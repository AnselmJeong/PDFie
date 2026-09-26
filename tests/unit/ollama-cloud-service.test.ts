import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { AiSettingsRepository } from "../../src/bun/ai/ai-settings-repository"
import { OllamaCloudService, parseOpenAiModelIds } from "../../src/bun/ai/ollama-cloud-service"

describe("Ollama Cloud model listing", () => {
  it("deduplicates and filters non-chat models", () => {
    expect(
      parseOpenAiModelIds({
        data: [
          { id: "qwen3.5:397b" },
          { id: "glm-5:cloud" },
          { id: "qwen3-embedding:latest" },
          { id: "x/internal" },
          { id: "glm-5:cloud" },
        ],
      }),
    ).toEqual(["glm-5:cloud", "qwen3.5:397b"])
  })

  it("returns an empty list for malformed responses", () => {
    expect(parseOpenAiModelIds(null)).toEqual([])
    expect(parseOpenAiModelIds({ data: "not-an-array" })).toEqual([])
  })
})

it("sends the exact selected quote and pages to the streaming provider", async () => {
  const directory = join(tmpdir(), `pdfie-ai-test-${crypto.randomUUID()}`)
  const settings = await AiSettingsRepository.open(join(directory, "settings.json"), join(directory, "key"))
  vi.spyOn(settings, "getApiKey").mockResolvedValue("test-only-key")
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('data: {"choices":[{"delta":{"content":"Summary"}}]}\n\ndata: [DONE]\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    }),
  )
  try {
    const tokens: string[] = []
    await new OllamaCloudService(settings).chatStream(
      {
        requestId: "qa",
        model: "test-model",
        question: "Summarize this",
        activePage: 9,
        selection: { text: "정확한 선택 구절", pages: [2, 3] },
      },
      (token) => tokens.push(token),
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.messages[1].content).toBe(
      "Selected source (pages 2, 3):\n정확한 선택 구절\n\nQuestion: Summarize this",
    )
    expect(tokens).toEqual(["Summary"])
  } finally {
    vi.restoreAllMocks()
  }
})
