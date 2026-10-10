import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { AiSettingsRepository } from "../../src/bun/ai/ai-settings-repository"
import { CodexProvider } from "../../src/bun/ai/providers/codex-provider"
import { OllamaProvider } from "../../src/bun/ai/providers/ollama-provider"
import { JsonRpcProcess } from "../../src/bun/ai/transport/json-rpc-process"

const folders: string[] = []
it("keeps a successful sign-in connected when quota refresh fails", async () => {
  const provider = new CodexProvider("unused-test-home")
  const request = vi.fn(async (method: string) => {
    if (method === "account/read") return { account: { type: "chatgpt" } }
    throw new Error("temporary quota failure")
  })
  vi.spyOn(provider, "executable").mockReturnValue(process.execPath)
  vi.spyOn(provider, "connect").mockResolvedValue({ request } as unknown as JsonRpcProcess)
  const state = await provider.status()
  expect(state.connected).toBe(true)
  expect(state.signingIn).toBe(false)
  expect(state.allowance).toBe("unknown")
  expect(state.error).toContain("한도")
  await expect(provider.login()).rejects.toThrow("이미 ChatGPT")
  expect(request).not.toHaveBeenCalledWith("account/login/start", expect.anything())
})
it("broadcasts browser login completion and account changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdfie-auth-event-test-"))
  folders.push(directory)
  const provider = new CodexProvider(directory)
  vi.spyOn(provider, "executable").mockReturnValue(process.execPath)
  vi.spyOn(JsonRpcProcess.prototype, "request").mockImplementation(async () => ({}))
  const changed = vi.fn()
  provider.accountListeners.add(changed)
  const transport = await provider.connect()
  for (const listener of transport.listeners) listener("account/login/completed", { success: true })
  expect(changed).toHaveBeenCalledOnce()
  for (const listener of transport.listeners) listener("account/updated", { authMode: "chatgpt" })
  expect(changed).toHaveBeenCalledTimes(2)
  provider.close()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true })
})
it("maps validated image inputs and history through the normal provider", async () => {
  const folder = await mkdtemp(join(tmpdir(), "pdfie-provider-test-"))
  folders.push(folder)
  const settings = await AiSettingsRepository.open(join(folder, "settings.json"), join(folder, "key"))
  vi.spyOn(settings, "getApiKey").mockResolvedValue("synthetic-key")
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) =>
      String(url).endsWith("/api/show")
        ? Response.json({ capabilities: ["completion", "vision"] })
        : new Response('data: {"choices":[{"delta":{"content":"한국어"}}]}\n\ndata: [DONE]\n\n'),
    )
  const tokens: string[] = []
  await new OllamaProvider(settings).generate(
    {
      requestId: "r",
      model: "vision-model",
      system: "trusted rules",
      prompt: "source packet",
      history: [{ role: "user", content: "prior" }],
      imageDataUrl: "data:image/png;base64,synthetic",
      signal: new AbortController().signal,
    },
    (t) => tokens.push(t),
  )
  const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))
  expect(body.messages[1]).toEqual({ role: "user", content: "prior" })
  expect(body.messages[2].content[1].image_url.url).toBe("data:image/png;base64,synthetic")
  expect(tokens).toEqual(["한국어"])
  expect(body.tools).toBeUndefined()
})
it("rejects unsupported vision before sending any completion", async () => {
  const folder = await mkdtemp(join(tmpdir(), "pdfie-provider-test-"))
  folders.push(folder)
  const settings = await AiSettingsRepository.open(join(folder, "settings.json"), join(folder, "key"))
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ capabilities: ["completion"] }))
  await expect(
    new OllamaProvider(settings).generate(
      {
        requestId: "r",
        model: "text-model",
        system: "rules",
        prompt: "packet",
        history: [],
        imageDataUrl: "data:image/png;base64,synthetic",
        signal: new AbortController().signal,
      },
      () => undefined,
    ),
  ).rejects.toThrow("이미지 지원")
  expect(fetch).toHaveBeenCalledTimes(1)
})
it("does not accept an abruptly closed stream as completed", async () => {
  const folder = await mkdtemp(join(tmpdir(), "pdfie-provider-test-"))
  folders.push(folder)
  const settings = await AiSettingsRepository.open(join(folder, "settings.json"), join(folder, "key"))
  vi.spyOn(settings, "getApiKey").mockResolvedValue("synthetic-key")
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
  )
  await expect(
    new OllamaProvider(settings).generate(
      {
        requestId: "r",
        model: "model",
        system: "rules",
        prompt: "packet",
        history: [],
        signal: new AbortController().signal,
      },
      () => undefined,
    ),
  ).rejects.toThrow("완료 전에")
})
it("settles malformed process frames and EOF without hanging", async () => {
  const folder = await mkdtemp(join(tmpdir(), "pdfie-stdio-test-"))
  folders.push(folder)
  const script = join(folder, "fake.cjs")
  await writeFile(script, 'process.stdin.once("data",()=>{process.stdout.write("not-json\\n")})')
  const transport = new JsonRpcProcess(
    process.execPath,
    [script],
    folder,
    { PATH: process.env.PATH ?? "" },
    1000,
  )
  await expect(transport.request("initialize", {})).rejects.toThrow("올바르지 않은 응답")
  transport.close()
  await writeFile(script, 'process.stdin.once("data",()=>process.exit(0))')
  const eof = new JsonRpcProcess(process.execPath, [script], folder, {}, 1000)
  await expect(eof.request("initialize", {})).rejects.toThrow("종료")
  eof.close()
})
it("rejects unsolicited server tool requests without approving or executing them", async () => {
  const folder = await mkdtemp(join(tmpdir(), "pdfie-stdio-test-"))
  folders.push(folder)
  const script = join(folder, "fake.cjs")
  await writeFile(
    script,
    'let step=0;process.stdin.on("data",chunk=>{for(const line of chunk.toString().trim().split("\\n")){const frame=JSON.parse(line);if(step++===0)process.stdout.write(JSON.stringify({id:999,method:"item/commandExecution/requestApproval",params:{command:"unsafe"}})+"\\n");else process.stdout.write(JSON.stringify({id:1,result:{rejected:frame.error?.code===-32601}})+"\\n")}})',
  )
  const transport = new JsonRpcProcess(process.execPath, [script], folder, {}, 1000)
  expect(await transport.request("initialize", {})).toEqual({ rejected: true })
  transport.close()
})
