import type { SearchResult } from "@embedpdf/models"
import { describe, expect, it } from "vitest"
import { getSearchResultScrollTarget } from "../../src/views/main/features/pdf/adapters/EmbedPdfWorkspace"

function searchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    pageIndex: 4,
    charIndex: 120,
    charCount: 8,
    rects: [
      {
        origin: { x: 72, y: 180 },
        size: { width: 48, height: 12 },
      },
    ],
    context: {
      before: "A contextual ",
      match: "result",
      after: " excerpt",
      truncatedLeft: false,
      truncatedRight: false,
    },
    ...overrides,
  }
}

describe("PDF search result navigation", () => {
  it("converts the zero-based page and match rectangle into a centered scroll target", () => {
    expect(getSearchResultScrollTarget(searchResult())).toEqual({
      pageNumber: 5,
      pageCoordinates: { x: 96, y: 186 },
      alignX: 50,
      alignY: 35,
      behavior: "smooth",
    })
  })

  it("still navigates to the page when PDFium returns no match rectangle", () => {
    expect(getSearchResultScrollTarget(searchResult({ pageIndex: 0, rects: [] }))).toEqual({
      pageNumber: 1,
      behavior: "smooth",
    })
  })
})
