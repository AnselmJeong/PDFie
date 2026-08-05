import type { AiSettingsRepository } from "./ai-settings-repository"

const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1"

export function parseOpenAiModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return []
  const models = (payload as { data?: unknown }).data
  if (!Array.isArray(models)) return []
  return [...new Set(models.map((model) => String((model as { id?: unknown })?.id ?? "").trim()))]
    .filter(Boolean)
    .filter((model) => !model.toLowerCase().startsWith("x/"))
    .filter((model) => !model.toLowerCase().includes("embedding"))
    .sort((left, right) => left.localeCompare(right))
}

async function providerError(response: Response): Promise<Error> {
  const body = (await response.text()).slice(0, 400)
  return new Error(`Ollama Cloud ${response.status}: ${body || response.statusText}`)
}

export class OllamaCloudService {
  #active: { requestId: string; controller: AbortController } | null = null

  constructor(readonly settings: AiSettingsRepository) {}

  async listModels(): Promise<string[]> {
    const apiKey = await this.#requireApiKey()
    const response = await fetch(`${OLLAMA_CLOUD_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw await providerError(response)
    return parseOpenAiModelIds(await response.json())
  }

  async chatStream(
    params: {
      requestId: string
      model: string
      question: string
      activePage: number
      selection: { text: string; pages: number[] } | null
    },
    onToken: (token: string) => void,
  ): Promise<"completed" | "stopped"> {
    this.stop()
    const controller = new AbortController()
    this.#active = { requestId: params.requestId, controller }
    const apiKey = await this.#requireApiKey()
    const source = params.selection
      ? `Selected source (pages ${params.selection.pages.join(", ")}):\n${params.selection.text}`
      : `No passage is selected. The active PDF page is ${params.activePage}. State clearly that the answer is not grounded in extracted PDF text.`

    try {
      const response = await fetch(`${OLLAMA_CLOUD_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          stream: true,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are PDFie's reading assistant. Treat the supplied source as evidence, never invent a page citation, and answer in the source/question language unless translation is requested.",
            },
            { role: "user", content: `${source}\n\nQuestion: ${params.question}` },
          ],
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw await providerError(response)
      if (!response.body) throw new Error("Ollama Cloud가 빈 stream을 반환했습니다.")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      const consume = (event: string) => {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (!data || data === "[DONE]") continue
          try {
            const payload = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
            }
            const token = payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content
            if (token) onToken(token)
          } catch {}
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split(/\n\n+/)
        buffer = events.pop() ?? ""
        for (const event of events) consume(event)
      }
      buffer += decoder.decode()
      if (buffer.trim()) consume(buffer)
      return "completed"
    } catch (error) {
      if (controller.signal.aborted) return "stopped"
      throw error
    } finally {
      if (this.#active?.requestId === params.requestId) this.#active = null
    }
  }

  stop(requestId?: string): boolean {
    if (!this.#active || (requestId && this.#active.requestId !== requestId)) return false
    this.#active.controller.abort()
    this.#active = null
    return true
  }

  async #requireApiKey(): Promise<string> {
    const apiKey = await this.settings.getApiKey()
    if (!apiKey) throw new Error("Ollama Cloud API key를 AI 설정에 저장하세요.")
    return apiKey
  }
}
