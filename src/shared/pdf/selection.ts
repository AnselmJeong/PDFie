import type { PdfRect, PdfSelection } from "./domain"

export interface ViewerFormattedSelection {
  pageIndex: number
  segmentRects: Array<PdfRect | { origin: { x: number; y: number }; size: { width: number; height: number } }>
}

export function normalizeSelectionText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function toPdfSelection(
  textLines: string[],
  formatted: ViewerFormattedSelection[],
): PdfSelection | null {
  const text = textLines.join("\n").trim()
  if (!text || formatted.length === 0) return null

  const pages = formatted
    .slice()
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .map((item) => ({
      pageNumber: item.pageIndex + 1,
      rects: item.segmentRects.map((rect) =>
        "origin" in rect
          ? { x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height }
          : { ...rect },
      ),
    }))

  return {
    text,
    normalizedText: normalizeSelectionText(text),
    pages,
    source: "viewer",
  }
}
