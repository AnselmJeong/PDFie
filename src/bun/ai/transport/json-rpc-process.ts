import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { StringDecoder } from "node:string_decoder"

export class JsonRpcProcess {
  #child: ChildProcessWithoutNullStreams | null = null
  #sequence = 0
  #pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  readonly listeners = new Set<(method: string, params: unknown) => void>()
  readonly failureListeners = new Set<(error: Error) => void>()
  readonly serverRequestListeners = new Set<() => void>()
  #closed = false
  get closed() {
    return this.#closed
  }
  constructor(
    readonly executable: string,
    readonly args: string[],
    readonly cwd: string,
    readonly env: Record<string, string>,
    readonly timeout = 20000,
  ) {}
  start() {
    if (this.#closed) throw new Error("Codex 연결이 닫혔습니다. 다시 연결하세요.")
    if (this.#child) return
    const child = spawn(this.executable, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.#child = child
    const decoder = new StringDecoder("utf8")
    let buffer = ""
    child.stderr.on("data", () => undefined)
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.#child !== child) return
      try {
        buffer += decoder.write(chunk)
        if (buffer.length > 2000000) throw new Error("Codex 응답 크기가 제한을 초과했습니다.")
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const frame = JSON.parse(line) as {
            id?: number | string
            method?: string
            params?: unknown
            result?: unknown
            error?: { message?: string }
          }
          if (frame.method && frame.id !== undefined) {
            // A provider may never authorize local actions or elicit secrets.
            child.stdin.write(
              `${JSON.stringify({ id: frame.id, error: { code: -32601, message: "PDFie does not expose tools or approvals" } })}\n`,
            )
            this.serverRequestListeners.forEach((listener) => {
              listener()
            })
          } else if (frame.method) {
            const method = frame.method
            this.listeners.forEach((fn) => {
              fn(method, frame.params)
            })
          } else if (typeof frame.id === "number") {
            const pending = this.#pending.get(frame.id)
            if (!pending) continue
            clearTimeout(pending.timer)
            this.#pending.delete(frame.id)
            if (frame.error)
              pending.reject(new Error("Codex 요청을 처리하지 못했습니다. 연결·인증 상태를 확인하세요."))
            else pending.resolve(frame.result)
          }
        }
      } catch {
        this.close(new Error("Codex가 올바르지 않은 응답을 반환했습니다."))
      }
    })
    child.on("error", () => {
      if (this.#child === child) this.close(new Error("Codex를 실행하지 못했습니다."))
    })
    child.on("exit", () => {
      if (this.#child === child) this.close(new Error("Codex 연결이 종료되었습니다."))
    })
    child.stdin.on("error", () => {
      if (this.#child === child) this.close(new Error("Codex 연결에 쓰지 못했습니다."))
    })
  }
  request<T = unknown>(method: string, params: unknown): Promise<T> {
    this.start()
    const id = ++this.#sequence
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error("Codex 연결 응답 시간이 초과되었습니다."))
        this.close()
      }, this.timeout)
      this.#pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
      this.#child?.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }
  notify(method: string) {
    this.#child?.stdin.write(`${JSON.stringify({ method })}\n`)
  }
  close(error = new Error("Codex 연결이 닫혔습니다.")) {
    if (this.#closed) return
    this.#closed = true
    const child = this.#child
    this.#child = null
    child?.kill("SIGKILL")
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.#pending.clear()
    this.failureListeners.forEach((listener) => {
      listener(error)
    })
  }
}
