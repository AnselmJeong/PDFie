import type { SelectionDocumentState } from "@embedpdf/plugin-selection"
import type {
  PdfHighlightStyle,
  PdfSelection,
  PdfSelectionPage,
  PdfTextHighlight,
} from "../../../../../shared/pdf/domain"
import { normalizeSelectionText } from "../../../../../shared/pdf/selection"
import { createPreciseSelectionHighlightRects } from "./selection-highlight"

function coordinate(value: number): string {
  return value.toFixed(3)
}

function pageKey(page: PdfSelectionPage): string {
  return `${page.pageNumber}:${page.rects
    .map((rect) => [rect.x, rect.y, rect.width, rect.height].map((value) => coordinate(value)).join(","))
    .join(";")}`
}

function selectionKey(text: string, pages: PdfSelectionPage[]): string {
  return `${text}\n${pages.map(pageKey).join("|")}`
}

export function createHighlightPages(
  selection: PdfSelection,
  state: Pick<SelectionDocumentState, "geometry" | "slices">,
): PdfSelectionPage[] {
  return selection.pages.map((page) => {
    const pageIndex = page.pageNumber - 1
    const fallback = page.rects.map((rect) => ({
      origin: { x: rect.x, y: rect.y },
      size: { width: rect.width, height: rect.height },
    }))
    const rects = createPreciseSelectionHighlightRects(
      state.geometry[pageIndex],
      state.slices[pageIndex],
      fallback,
    )
    return {
      pageNumber: page.pageNumber,
      rects: rects.map((rect) => ({
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
      })),
    }
  })
}

export function addOrRestyleHighlight(
  highlights: readonly PdfTextHighlight[],
  selection: PdfSelection,
  pages: PdfSelectionPage[],
  style: PdfHighlightStyle,
  createId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): PdfTextHighlight[] {
  const key = selectionKey(selection.normalizedText, pages)
  const existing = highlights.find(
    (highlight) => selectionKey(normalizeSelectionText(highlight.text), highlight.pages) === key,
  )
  const next: PdfTextHighlight = {
    ...existing,
    id: existing?.id ?? createId(),
    text: selection.text,
    style,
    pages,
    createdAt: existing?.createdAt ?? now(),
  }

  return existing
    ? highlights.map((highlight) => (highlight.id === existing.id ? next : highlight))
    : [...highlights, next]
}

export function findSelectionHighlight(
  highlights: readonly PdfTextHighlight[],
  selection: PdfSelection,
  pages: PdfSelectionPage[],
) {
  const key = selectionKey(selection.normalizedText, pages)
  return highlights.find(
    (highlight) => selectionKey(normalizeSelectionText(highlight.text), highlight.pages) === key,
  )
}
