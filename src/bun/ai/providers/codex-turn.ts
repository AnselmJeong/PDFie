import type { GenerationInput } from "../provider-contract"

export interface CodexTransport {
  request<T = unknown>(method: string, params: unknown): Promise<T>
  listeners: Set<(method: string, params: unknown) => void>
  failureListeners: Set<(error: Error) => void>
  serverRequestListeners: Set<() => void>
  close(error?: Error): void
}
interface Item {
  type: string
  id: string
  text?: string
  phase?: string | null
}
interface Turn {
  id: string
  status: string
  items?: Item[]
  error?: { message?: string } | null
}
export const CODEX_THREAD_POLICY = {
  modelProvider: "openai",
  allowProviderModelFallback: false,
  approvalPolicy: "never",
  sandbox: "read-only",
  ephemeral: true,
  environments: [],
  runtimeWorkspaceRoots: [],
  dynamicTools: [],
  selectedCapabilityRoots: [],
} as const

export function verifyCodexThread(value: unknown, model: string): string {
  const result = value as {
    thread?: { id?: string; environments?: unknown[] | null }
    model?: string
    modelProvider?: string
    approvalPolicy?: string
    sandbox?: { type?: string; networkAccess?: boolean }
    runtimeWorkspaceRoots?: unknown[]
    instructionSources?: unknown[]
  } | null
  if (
    !result?.thread?.id ||
    result.model !== model ||
    result.modelProvider !== "openai" ||
    result.approvalPolicy !== "never" ||
    result.sandbox?.type !== "readOnly" ||
    result.sandbox.networkAccess !== false ||
    !Array.isArray(result.thread.environments) ||
    result.thread.environments.length !== 0 ||
    !Array.isArray(result.runtimeWorkspaceRoots) ||
    result.runtimeWorkspaceRoots.length !== 0 ||
    !Array.isArray(result.instructionSources) ||
    result.instructionSources.length !== 0
  )
    throw new Error("Codex의 학습 전용 실행 설정을 확인하지 못했습니다. 연결 상태를 새로고침하세요.")
  return result.thread.id
}

// Each application request owns one ephemeral thread. Only its completed final
// answer becomes study data; commentary, reasoning and incomplete output do not.
export async function runCodexTurn(
  transport: CodexTransport,
  threadId: string,
  input: GenerationInput,
  onToken: (token: string) => void,
  effort?: string,
) {
  input.signal.throwIfAborted()
  let turnId: string | null = null
  let settled = false
  let interrupt: Promise<void> | null = null
  const items = new Map<string, Item>()
  const early: Array<[string, Record<string, unknown>]> = []
  let length = 0
  let resolveDone!: () => void
  let rejectDone!: (error: Error) => void
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  // Observe rejection while the turn/start acknowledgement is still pending.
  void done.catch(() => undefined)
  const fail = (error: Error) => {
    if (settled) return
    settled = true
    rejectDone(error)
  }
  const abort = () => {
    fail(new Error("생성이 중지되었습니다."))
    if (turnId)
      interrupt = transport
        .request("turn/interrupt", { threadId, turnId })
        .then(() => undefined)
        .catch(() => transport.close())
    else transport.close()
  }
  const toolRequested = () => {
    fail(new Error("학습 전용 Codex 연결에서 허용하지 않는 도구 요청을 차단했습니다."))
    transport.close()
  }
  const itemAllowed = (item: Item) => {
    if (!["userMessage", "agentMessage", "reasoning", "contextCompaction"].includes(item.type)) {
      toolRequested()
      return false
    }
    return true
  }
  const receive = (method: string, unknownParams: unknown) => {
    if (settled || !unknownParams || typeof unknownParams !== "object") return
    const params = unknownParams as Record<string, unknown>
    if (params.threadId !== threadId) return
    if (!turnId) {
      if (early.length >= 1000) return fail(new Error("Codex 응답이 너무 큽니다."))
      early.push([method, params])
      return
    }
    const turn = params.turn as Turn | undefined
    if ((params.turnId ?? turn?.id) !== turnId) return
    if (method === "item/started" || method === "item/completed") {
      const item = params.item as Item | undefined
      if (!item || !itemAllowed(item)) return
      if (item.type === "agentMessage") {
        const previous = items.get(item.id)
        items.set(item.id, { ...previous, ...item, text: item.text || previous?.text || "" })
      }
    } else if (method === "item/agentMessage/delta") {
      if (typeof params.itemId !== "string" || typeof params.delta !== "string") return
      length += params.delta.length
      if (length > 200000) return toolFreeFailure("Codex 응답이 너무 큽니다.")
      const old = items.get(params.itemId) ?? { id: params.itemId, type: "agentMessage", text: "" }
      items.set(params.itemId, { ...old, text: (old.text ?? "") + params.delta })
    } else if (method === "turn/completed" && turn) {
      if (turn.status !== "completed")
        return fail(
          new Error(
            turn.status === "interrupted"
              ? "생성이 중지되었습니다."
              : "Codex가 자료 생성을 완료하지 못했습니다. 다시 시도하세요.",
          ),
        )
      for (const item of turn.items ?? []) {
        if (!itemAllowed(item)) return
        if (item.type === "agentMessage") items.set(item.id, item)
      }
      const answer = [...items.values()]
        .filter((item) => item.phase !== "commentary" && item.text)
        .map((item) => item.text)
        .join("\n")
      if (!answer.trim() || answer.length > 200000)
        return fail(new Error("Codex의 최종 응답을 확인하지 못했습니다."))
      try {
        onToken(answer)
        settled = true
        resolveDone()
      } catch (cause) {
        fail(cause instanceof Error ? cause : new Error("응답을 저장하지 못했습니다."))
      }
    } else if (method === "error" && params.willRetry === false) {
      fail(new Error("Codex 생성 연결에 오류가 발생했습니다. 다시 시도하세요."))
    }
  }
  const toolFreeFailure = (message: string) => {
    fail(new Error(message))
    transport.close()
  }
  const timer = setTimeout(() => toolFreeFailure("Codex 생성 시간이 초과되었습니다."), 240000)
  transport.listeners.add(receive)
  transport.failureListeners.add(fail)
  transport.serverRequestListeners.add(toolRequested)
  input.signal.addEventListener("abort", abort, { once: true })
  try {
    const userInput: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: JSON.stringify({ history: input.history, request: input.prompt }),
        text_elements: [],
      },
    ]
    if (input.imageDataUrl) userInput.push({ type: "image", url: input.imageDataUrl })
    const response = await transport.request<{ turn: Turn }>("turn/start", {
      threadId,
      input: userInput,
      environments: [],
      runtimeWorkspaceRoots: [],
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
      model: input.model,
      serviceTierForTurn: "default",
      ...(effort ? { effort } : {}),
      ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}),
    })
    turnId = response.turn.id
    if (!turnId) throw new Error("Codex 생성 요청을 확인하지 못했습니다.")
    if (input.signal.aborted) abort()
    for (const [method, params] of early) receive(method, params)
    early.length = 0
    if (response.turn.status !== "inProgress") receive("turn/completed", { threadId, turn: response.turn })
    await done
  } finally {
    if (interrupt) {
      let stopTimer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        interrupt,
        new Promise<void>((resolve) => {
          stopTimer = setTimeout(() => {
            transport.close()
            resolve()
          }, 5000)
        }),
      ])
      clearTimeout(stopTimer)
    }
    clearTimeout(timer)
    transport.listeners.delete(receive)
    transport.failureListeners.delete(fail)
    transport.serverRequestListeners.delete(toolRequested)
    input.signal.removeEventListener("abort", abort)
  }
}
