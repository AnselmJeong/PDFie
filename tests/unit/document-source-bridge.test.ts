import { describe, expect, it } from "vitest"
import { parseRange } from "../../src/bun/pdf/document-source-bridge"

describe("PDF source range parsing", () => {
  it("parses bounded and open-ended byte ranges", () => {
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 })
  })

  it("parses suffix ranges", () => {
    expect(parseRange("bytes=-12", 100)).toEqual({ start: 88, end: 99 })
  })

  it("rejects malformed and out-of-bounds ranges", () => {
    expect(parseRange("bytes=100-120", 100)).toBeNull()
    expect(parseRange("bytes=20-10", 100)).toBeNull()
    expect(parseRange("items=0-10", 100)).toBeNull()
  })
})
