import { describe, expect, it } from "vitest"
import { normalizeSelectionText, toPdfSelection } from "../../src/shared/pdf/selection"

describe("selection normalization", () => {
  it("preserves paragraph boundaries while normalizing search whitespace", () => {
    expect(normalizeSelectionText("  연구  결과\r\n\r\n다음\t문단  ")).toBe("연구 결과\n\n다음 문단")
  })

  it("keeps original text and converts PDFium page coordinates", () => {
    expect(
      toPdfSelection(
        ["First line", "second line"],
        [
          {
            pageIndex: 1,
            segmentRects: [{ origin: { x: 12, y: 20 }, size: { width: 80, height: 14 } }],
          },
        ],
      ),
    ).toEqual({
      text: "First line\nsecond line",
      normalizedText: "First line\nsecond line",
      pages: [{ pageNumber: 2, rects: [{ x: 12, y: 20, width: 80, height: 14 }] }],
      source: "viewer",
    })
  })

  it("rejects empty or geometry-free selections", () => {
    expect(toPdfSelection([], [])).toBeNull()
    expect(toPdfSelection(["text"], [])).toBeNull()
  })
})
