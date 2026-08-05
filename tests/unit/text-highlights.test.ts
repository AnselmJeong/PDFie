import { describe, expect, it } from "vitest"
import type { PdfSelection } from "../../src/shared/pdf/domain"
import {
  addOrRestyleHighlight,
  createHighlightPages,
} from "../../src/views/main/features/pdf/adapters/text-highlights"

const selection: PdfSelection = {
  text: "Selected passage",
  normalizedText: "Selected passage",
  source: "viewer",
  pages: [
    {
      pageNumber: 2,
      rects: [
        { x: 10, y: 20, width: 30, height: 12 },
        { x: 40.5, y: 20, width: 24, height: 12 },
      ],
    },
  ],
}

describe("PDF text highlights", () => {
  it("keeps normalized PDF coordinates and merges adjacent fallback rectangles", () => {
    expect(createHighlightPages(selection, { geometry: {}, slices: {} })).toEqual([
      {
        pageNumber: 2,
        rects: [{ x: 10, y: 20, width: 54.5, height: 12 }],
      },
    ])
  })

  it("restyles the same selected range without creating a duplicate", () => {
    const pages = createHighlightPages(selection, { geometry: {}, slices: {} })
    const created = addOrRestyleHighlight(
      [],
      selection,
      pages,
      "yellow",
      () => "highlight-1",
      () => "2026-08-05T00:00:00.000Z",
    )
    const restyled = addOrRestyleHighlight(
      created,
      selection,
      pages,
      "pink",
      () => "unused",
      () => "unused",
    )

    expect(restyled).toHaveLength(1)
    expect(restyled[0]).toMatchObject({
      id: "highlight-1",
      style: "pink",
      createdAt: "2026-08-05T00:00:00.000Z",
    })
  })
})
