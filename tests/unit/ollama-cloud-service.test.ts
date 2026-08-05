import { describe, expect, it } from "vitest"
import { parseOpenAiModelIds } from "../../src/bun/ai/ollama-cloud-service"

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
