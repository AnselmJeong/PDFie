import { expect, it, vi } from "vitest"
import type { GenerationInput } from "../../src/bun/ai/provider-contract"
import { CodexProvider } from "../../src/bun/ai/providers/codex-provider"
import {
  CODEX_THREAD_POLICY,
  type CodexTransport,
  runCodexTurn,
  verifyCodexThread,
} from "../../src/bun/ai/providers/codex-turn"
import type { JsonRpcProcess } from "../../src/bun/ai/transport/json-rpc-process"

const input = (signal = new AbortController().signal): GenerationInput => ({
  requestId: "request",
  model: "live-model",
  system: "trusted instructions",
  prompt: "source data",
  history: [{ role: "assistant", content: "prior response" }],
  signal,
})
function fakeTransport(start: (emit: (method: string, params: unknown) => void, params: unknown) => unknown) {
  const transport: CodexTransport = {
    listeners: new Set(),
    failureListeners: new Set(),
    serverRequestListeners: new Set(),
    close: vi.fn(),
    request: vi.fn(async (method: string, params: unknown) =>
      method === "turn/start" ? start(emit, params) : {},
    ) as CodexTransport["request"],
  }
  function emit(method: string, params: unknown) {
    transport.listeners.forEach((listener) => {
      listener(method, params)
    })
  }
  return { transport, emit }
}
const final = (threadId = "thread", status = "completed") => ({
  threadId,
  turn: { id: "turn", status, items: [] },
})

it("keeps history/image data once and accepts early deltas only from its completed turn", async () => {
  const { transport } = fakeTransport((emit) => {
    emit("item/agentMessage/delta", { threadId: "other", turnId: "turn", itemId: "x", delta: "unrelated" })
    emit("item/agentMessage/delta", { threadId: "thread", turnId: "old", itemId: "old", delta: "stale" })
    emit("item/started", {
      threadId: "thread",
      turnId: "turn",
      item: { type: "agentMessage", id: "note", phase: "commentary" },
    })
    emit("item/agentMessage/delta", { threadId: "thread", turnId: "turn", itemId: "note", delta: "not JSON" })
    emit("item/agentMessage/delta", { threadId: "thread", turnId: "turn", itemId: "answer", delta: '{"ok":' })
    emit("item/agentMessage/delta", { threadId: "thread", turnId: "turn", itemId: "answer", delta: "true}" })
    emit("item/completed", {
      threadId: "thread",
      turnId: "turn",
      item: { type: "agentMessage", id: "answer", phase: "final_answer", text: '{"ok":true}' },
    })
    emit("turn/completed", final())
    return { turn: { id: "turn", status: "inProgress" } }
  })
  const tokens = vi.fn()
  const request = { ...input(), imageDataUrl: "data:image/png;base64,test", outputSchema: { type: "object" } }
  await runCodexTurn(transport, "thread", request, tokens)
  expect(tokens).toHaveBeenCalledExactlyOnceWith('{"ok":true}')
  const params = vi.mocked(transport.request).mock.calls[0]?.[1] as {
    input: Array<{ text?: string; url?: string }>
  }
  expect(JSON.parse(params.input[0]!.text!)).toEqual({ history: request.history, request: request.prompt })
  expect(params.input[1]?.url).toBe(request.imageDataUrl)
  expect(params).toMatchObject({
    environments: [],
    runtimeWorkspaceRoots: [],
    approvalPolicy: "never",
    serviceTierForTurn: "default",
    sandboxPolicy: { type: "readOnly", networkAccess: false },
  })
  expect(transport.listeners.size).toBe(0)
  expect(transport.failureListeners.size).toBe(0)
})
it.each(["failed", "interrupted"])("never saves a %s turn's partial result", async (status) => {
  const { transport } = fakeTransport((emit) => {
    emit("item/agentMessage/delta", { threadId: "thread", turnId: "turn", itemId: "a", delta: "partial" })
    emit("turn/completed", final("thread", status))
    return { turn: { id: "turn", status: "inProgress" } }
  })
  const tokens = vi.fn()
  await expect(runCodexTurn(transport, "thread", input(), tokens)).rejects.toThrow(
    status === "failed" ? "완료" : "중지",
  )
  expect(tokens).not.toHaveBeenCalled()
})
it("settles streaming EOF and removes all listeners", async () => {
  const { transport } = fakeTransport(() => {
    queueMicrotask(() =>
      transport.failureListeners.forEach((listener) => {
        listener(new Error("EOF"))
      }),
    )
    return { turn: { id: "turn", status: "inProgress" } }
  })
  await expect(runCodexTurn(transport, "thread", input(), vi.fn())).rejects.toThrow("EOF")
  expect(
    transport.listeners.size + transport.failureListeners.size + transport.serverRequestListeners.size,
  ).toBe(0)
})
it("interrupts the matching active turn and ignores later completion after stop", async () => {
  const controller = new AbortController()
  const { transport, emit } = fakeTransport(() => ({ turn: { id: "turn", status: "inProgress" } }))
  const tokens = vi.fn()
  const completion = runCodexTurn(transport, "thread", input(controller.signal), tokens)
  await Promise.resolve()
  controller.abort()
  emit("turn/completed", final())
  await expect(completion).rejects.toThrow("중지")
  expect(transport.request).toHaveBeenCalledWith("turn/interrupt", { threadId: "thread", turnId: "turn" })
  expect(tokens).not.toHaveBeenCalled()
})
it("closes a nonresponsive interrupt and releases the turn within five seconds", async () => {
  vi.useFakeTimers()
  try {
    const controller = new AbortController()
    const { transport } = fakeTransport(() => ({ turn: { id: "turn", status: "inProgress" } }))
    vi.mocked(transport.request).mockImplementation(async (method) =>
      method === "turn/start" ? { turn: { id: "turn", status: "inProgress" } } : new Promise(() => undefined),
    )
    const completion = runCodexTurn(transport, "thread", input(controller.signal), vi.fn())
    const assertion = expect(completion).rejects.toThrow("중지")
    await Promise.resolve()
    controller.abort()
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(transport.close).toHaveBeenCalledOnce()
    expect(transport.listeners.size).toBe(0)
    expect(transport.failureListeners.size).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
it.each(["thread/start", "thread/unsubscribe"])(
  "stopping during %s cancels the pending RPC and permits another generation",
  async (blockedMethod) => {
    const provider = new CodexProvider("unused")
    const controller = new AbortController()
    const { transport } = fakeTransport((emit) => {
      emit("turn/completed", {
        threadId: "thread",
        turn: {
          id: "turn",
          status: "completed",
          items: [{ id: "answer", type: "agentMessage", text: '{"ok":true}' }],
        },
      })
      return { turn: { id: "turn", status: "inProgress" } }
    })
    const native = Object.assign(transport, { closed: false })
    const request = vi.mocked(transport.request).getMockImplementation()
    expect(request).toBeDefined()
    let rejectPending: ((cause: Error) => void) | undefined
    let reached!: () => void
    const pending = new Promise<void>((resolve) => {
      reached = resolve
    })
    let block = true
    vi.mocked(transport.request).mockImplementation(async (method, params) => {
      if (method === blockedMethod && block) {
        reached()
        return new Promise((_, reject) => {
          rejectPending = reject
        })
      }
      if (method === "thread/start")
        return {
          thread: { id: "thread", environments: [] },
          model: "live-model",
          modelProvider: "openai",
          approvalPolicy: "never",
          sandbox: { type: "readOnly", networkAccess: false },
          runtimeWorkspaceRoots: [],
          instructionSources: [],
        }
      return request?.(method, params)
    })
    vi.mocked(transport.close).mockImplementation(() => {
      native.closed = true
      rejectPending?.(new Error("closed on cancellation"))
    })
    vi.spyOn(provider, "connect").mockResolvedValue(native as unknown as JsonRpcProcess)
    vi.spyOn(provider, "status").mockResolvedValue({
      installed: true,
      connected: true,
      signingIn: false,
      version: "codex-cli 0.160.0",
      allowance: "available",
      windows: [],
      generationAvailable: true,
    })
    vi.spyOn(provider, "models").mockResolvedValue([{ id: "live-model", label: "live", vision: false }])
    try {
      const completion = provider.generate(input(controller.signal), vi.fn())
      // Cleanup can resolve normally; the study service still checks the signal
      // before publishing any lesson. Preparation cancellation must reject.
      const observed = completion.catch((cause: unknown) => cause)
      await pending
      controller.abort()
      await observed
      expect(transport.close).toHaveBeenCalled()
      block = false
      native.closed = false
      const tokens = vi.fn()
      await provider.generate(input(), tokens)
      expect(tokens).toHaveBeenCalledExactlyOnceWith('{"ok":true}')
    } finally {
      vi.restoreAllMocks()
    }
  },
)
it("rejects any executable tool item even if a server violates the thread policy", async () => {
  const { transport } = fakeTransport((emit) => {
    emit("item/started", {
      threadId: "thread",
      turnId: "turn",
      item: { type: "commandExecution", id: "tool" },
    })
    return { turn: { id: "turn", status: "inProgress" } }
  })
  await expect(runCodexTurn(transport, "thread", input(), vi.fn())).rejects.toThrow("도구 요청")
  expect(transport.close).toHaveBeenCalled()
})
it("requires the server to confirm empty environments, sources and read-only policy", () => {
  const response = {
    thread: { id: "thread", environments: [] },
    model: "live-model",
    modelProvider: "openai",
    approvalPolicy: "never",
    sandbox: { type: "readOnly", networkAccess: false },
    runtimeWorkspaceRoots: [],
    instructionSources: [],
  }
  expect(verifyCodexThread(response, "live-model")).toBe("thread")
  for (const patch of [
    { thread: { id: "thread", environments: null } },
    { instructionSources: ["AGENTS.md"] },
    { model: "fallback" },
    { sandbox: { type: "readOnly", networkAccess: true } },
  ])
    expect(() => verifyCodexThread({ ...response, ...patch }, "live-model")).toThrow("실행 설정")
  expect(CODEX_THREAD_POLICY).toMatchObject({
    ephemeral: true,
    dynamicTools: [],
    selectedCapabilityRoots: [],
    allowProviderModelFallback: false,
  })
})
it.each(["unknown", "exhausted"] as const)(
  "blocks %s quota before any inference or fallback",
  async (allowance) => {
    const provider = new CodexProvider("unused")
    const request = vi.fn()
    vi.spyOn(provider, "connect").mockResolvedValue({ request, close: vi.fn() } as unknown as JsonRpcProcess)
    vi.spyOn(provider, "status").mockResolvedValue({
      installed: true,
      connected: true,
      signingIn: false,
      version: "codex-cli 0.160.0",
      allowance,
      windows: [],
      generationAvailable: false,
    })
    const fetch = vi.spyOn(globalThis, "fetch")
    await expect(provider.generate(input(), vi.fn())).rejects.toThrow("사용 한도")
    expect(request).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  },
)
