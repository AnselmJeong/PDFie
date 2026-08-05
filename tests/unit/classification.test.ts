import { describe, expect, it } from "vitest"
import { classifyPdfDocument } from "../../src/shared/pdf/classification"
import type { PdfOutlineNode } from "../../src/shared/pdf/domain"

const node = (title: string, children: PdfOutlineNode[] = []): PdfOutlineNode => ({
  id: title,
  title,
  pageNumber: 1,
  children,
})

describe("PDF fast classifier", () => {
  it("classifies a scholarly article from content signals", () => {
    const result = classifyPdfDocument({
      pageCount: 18,
      firstPagesText: "Abstract\nAuthor affiliation: University\nhttps://doi.org/10.1234/example",
      latePagesText: "References",
      outline: [],
    })
    expect(result.documentType).toBe("article")
    expect(result.articleScore).toBeGreaterThanOrEqual(10)
  })

  it("classifies a nested chapter outline as a book", () => {
    const result = classifyPdfDocument({
      pageCount: 240,
      firstPagesText: "",
      latePagesText: "",
      outline: [node("Part I", [node("Chapter 1"), node("Chapter 2"), node("Chapter 3")])],
    })
    expect(result.documentType).toBe("book")
    expect(result.bookScore).toBeGreaterThanOrEqual(10)
  })

  it("keeps weak page-count-only evidence unknown", () => {
    expect(
      classifyPdfDocument({ pageCount: 12, firstPagesText: "", latePagesText: "", outline: [] }).documentType,
    ).toBe("unknown")
  })
})
