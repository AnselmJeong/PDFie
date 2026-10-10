import type { AiSettingsRepository } from "../ai-settings-repository"
import { parseOpenAiModelIds } from "../ollama-cloud-service"
import type { GenerationInput, StudyProvider } from "../provider-contract"

export class OllamaProvider implements StudyProvider {
  #capabilities = new Map<string, { vision: boolean; expires: number }>()
  readonly id = "ollama-cloud" as const
  constructor(private settings: AiSettingsRepository) {}
  async key() {
    const key = await this.settings.getApiKey()
    if (!key) throw new Error("AI 설정에서 Ollama Cloud API key를 저장하세요.")
    return key
  }
  async models() {
    const response = await fetch("https://ollama.com/v1/models", {
      headers: { Authorization: `Bearer ${await this.key()}` },
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`모델 목록을 불러오지 못했습니다 (${response.status}).`)
    const ids = parseOpenAiModelIds(await response.json())
    const models = []
    for (let i = 0; i < ids.length; i += 4)
      models.push(
        ...(await Promise.all(
          ids.slice(i, i + 4).map(async (id) => ({ id, label: id, vision: await this.vision(id) })),
        )),
      )
    return models
  }
  async vision(model: string): Promise<boolean> {
    const cached = this.#capabilities.get(model)
    if (cached && cached.expires > Date.now()) return cached.vision
    try {
      const response = await fetch("https://ollama.com/api/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return false
      const data = (await response.json()) as { capabilities?: unknown }
      const vision = Array.isArray(data.capabilities) && data.capabilities.includes("vision")
      this.#capabilities.set(model, { vision, expires: Date.now() + 600000 })
      return vision
    } catch {
      return false
    }
  }
  async generate(input: GenerationInput, onToken: (token: string) => void) {
    if (input.imageDataUrl && !(await this.vision(input.model)))
      throw new Error(
        "선택한 모델의 이미지 지원을 확인할 수 없습니다. 이미지 지원 모델로 바꾸거나 첨부를 제거하세요.",
      )
    if (input.signal.aborted) throw new Error("생성이 중지되었습니다.")
    const response = await fetch("https://ollama.com/v1/chat/completions", {
      method: "POST",
      signal: input.signal,
      headers: { Authorization: `Bearer ${await this.key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        stream: true,
        temperature: 0.2,
        messages: [
          { role: "system", content: input.system },
          ...input.history,
          {
            role: "user",
            content: input.imageDataUrl
              ? [
                  { type: "text", text: input.prompt },
                  { type: "image_url", image_url: { url: input.imageDataUrl } },
                ]
              : input.prompt,
          },
        ],
      }),
    })
    if (!response.ok)
      throw new Error(`Ollama Cloud 요청 실패 (${response.status}). 모델·인증·사용 한도를 확인하세요.`)
    if (!response.body) throw new Error("모델이 빈 응답을 반환했습니다.")
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let finished = false
    const consume = (line: string) => {
      if (!line.startsWith("data:")) return
      const data = line.slice(5).trim()
      if (data === "[DONE]") {
        finished = true
        return
      }
      if (!data) return
      const parsed = JSON.parse(data) as {
        error?: unknown
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
      }
      if (parsed.error) throw new Error("모델이 stream 오류를 반환했습니다.")
      const choice = parsed.choices?.[0]
      if (choice?.delta?.content) onToken(choice.delta.content)
      if (choice?.finish_reason === "stop") finished = true
      if (choice?.finish_reason === "length")
        throw new Error("응답 길이 제한에 도달했습니다. 학습 범위를 줄여 다시 시도하세요.")
    }
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 1000000) throw new Error("모델 stream이 너무 큽니다.")
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ""
        lines.forEach(consume)
      }
      buffer += decoder.decode()
      if (buffer.trim()) consume(buffer)
      if (!finished) throw new Error("응답 연결이 완료 전에 끊어졌습니다.")
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}
