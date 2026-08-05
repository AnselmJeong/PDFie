import { describe, expect, it } from "vitest"
import {
  createPreciseSelectionHighlightRects,
  mergeSelectionHighlightRects,
} from "../../src/views/main/features/pdf/adapters/selection-highlight"

describe("selection highlight rect merging", () => {
  it("merges touching and overlapping glyph runs on the same line", () => {
    expect(
      mergeSelectionHighlightRects([
        { origin: { x: 10, y: 20 }, size: { width: 21, height: 11 } },
        { origin: { x: 29, y: 19.5 }, size: { width: 18, height: 12 } },
        { origin: { x: 50, y: 20 }, size: { width: 17, height: 11 } },
      ]),
    ).toEqual([{ origin: { x: 10, y: 19.5 }, size: { width: 57, height: 12 } }])
  })

  it("keeps separate lines and distant columns separate", () => {
    expect(
      mergeSelectionHighlightRects([
        { origin: { x: 10, y: 20 }, size: { width: 30, height: 10 } },
        { origin: { x: 180, y: 20 }, size: { width: 30, height: 10 } },
        { origin: { x: 10, y: 36 }, size: { width: 40, height: 10 } },
      ]),
    ).toHaveLength(3)
  })
})

describe("precise selection highlight geometry", () => {
  it("uses tight horizontal glyph edges while preserving the line-height band", () => {
    const rects = createPreciseSelectionHighlightRects(
      {
        runs: [
          {
            charStart: 40,
            rect: { x: 10, y: 20, width: 36, height: 12 },
            glyphs: [
              {
                x: 10,
                y: 20,
                width: 12,
                height: 12,
                flags: 0,
                tightX: 12,
                tightY: 22,
                tightWidth: 8,
                tightHeight: 8,
              },
              { x: 22, y: 20, width: 4, height: 12, flags: 2 },
              {
                x: 26,
                y: 20,
                width: 12,
                height: 12,
                flags: 0,
                tightX: 27,
                tightY: 22,
                tightWidth: 9,
                tightHeight: 8,
              },
            ],
          },
        ],
      },
      { start: 40, count: 3 },
    )

    expect(rects).toEqual([{ origin: { x: 12, y: 20 }, size: { width: 24, height: 12 } }])
  })

  it("falls back to SDK rectangles when tight geometry is unavailable", () => {
    expect(
      createPreciseSelectionHighlightRects(undefined, undefined, [
        { origin: { x: 10, y: 20 }, size: { width: 20, height: 10 } },
      ]),
    ).toEqual([{ origin: { x: 10, y: 20 }, size: { width: 20, height: 10 } }])
  })
})
