import type { PdfHighlightStyle, PdfMark, PdfTextHighlight } from "./domain"

/**
 * Turns PDFie's annotations into standard PDF annotations for export, and into
 * Markdown notes. Text highlights stay in PDFie's own model while reading
 * (selection, AI and evidence depend on it); only an exported copy carries
 * them as /Highlight and /Underline annotations. Marks are already EmbedPDF
 * annotation objects.
 */

/** PdfAnnotationSubtype values used here (stable PDF subtype numbers in EmbedPDF's enum). */
export const SUBTYPE = { HIGHLIGHT: 9, UNDERLINE: 10 } as const

export const HIGHLIGHT_COLORS: Record<PdfHighlightStyle, string> = {
  yellow: "#FACC15",
  green: "#4ADE80",
  blue: "#60A5FA",
  pink: "#F472B6",
  "red-underline": "#DC2626",
}

const DATE_FIELDS = ["created", "modified"] as const

/** JSON-safe copy of an annotation object (Dates become ISO strings). */
export function serializeAnnotation(annotation: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(annotation)) as Record<string, unknown>
}

/** Restore Date fields of a stored annotation object. */
export function reviveAnnotation(stored: Record<string, unknown>): Record<string, unknown> {
  const annotation: Record<string, unknown> = { ...stored }
  for (const field of DATE_FIELDS) {
    const value = annotation[field]
    if (typeof value === "string") {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) delete annotation[field]
      else annotation[field] = date
    }
  }
  return annotation
}

const rect = (r: { x: number; y: number; width: number; height: number }) => ({
  origin: { x: r.x, y: r.y },
  size: { width: r.width, height: r.height },
})

function bounds(rects: Array<{ x: number; y: number; width: number; height: number }>) {
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** One text-markup annotation per highlighted page, with the note as its contents. */
export function highlightAnnotations(highlights: PdfTextHighlight[]): Array<Record<string, unknown>> {
  return highlights.flatMap((highlight) =>
    highlight.pages
      .filter((page) => page.rects.length > 0)
      .map((page, index) => {
        const underline = highlight.style === "red-underline"
        const color = HIGHLIGHT_COLORS[highlight.style] ?? HIGHLIGHT_COLORS.yellow
        const created = new Date(highlight.createdAt)
        return {
          type: underline ? SUBTYPE.UNDERLINE : SUBTYPE.HIGHLIGHT,
          id: `${highlight.id}-${index}`,
          pageIndex: page.pageNumber - 1,
          rect: rect(bounds(page.rects)),
          segmentRects: page.rects.map(rect),
          color,
          strokeColor: color,
          opacity: underline ? 1 : 0.45,
          author: "PDFie",
          ...(Number.isNaN(created.getTime()) ? {} : { created, modified: created }),
          ...(index === 0 && highlight.note ? { contents: highlight.note } : {}),
        }
      }),
  )
}

const FREETEXT = 3
const TEXT_NOTE = 1

/** Text PDFium can draw with the standard fonts it uses for text boxes (Latin-1). */
export function fitsStandardFont(text: string): boolean {
  return Array.from(text).every((char) => (char.codePointAt(0) ?? 0) <= 0xff)
}

/**
 * A text box whose text needs other scripts (Korean, for one) is drawn by
 * PDFium with a Latin font, so those letters would vanish in other viewers.
 * Export it as a note instead: viewers show its text in their own font.
 */
function exportableMark(mark: PdfMark): Record<string, unknown> {
  const annotation = reviveAnnotation({ ...mark.annotation, pageIndex: mark.pageIndex })
  const contents = typeof annotation.contents === "string" ? annotation.contents : ""
  if (Number(annotation.type) !== FREETEXT || fitsStandardFont(contents)) return annotation
  const box = annotation.rect as { origin: { x: number; y: number } } | undefined
  return {
    type: TEXT_NOTE,
    id: mark.id,
    pageIndex: mark.pageIndex,
    rect: { origin: { x: box?.origin.x ?? 0, y: box?.origin.y ?? 0 }, size: { width: 20, height: 20 } },
    contents,
    color: typeof annotation.fontColor === "string" ? annotation.fontColor : "#F59E0B",
    strokeColor: typeof annotation.fontColor === "string" ? annotation.fontColor : "#F59E0B",
    opacity: 1,
    icon: 1,
    author: "PDFie",
    flags: ["print", "noZoom", "noRotate"],
    ...(annotation.created ? { created: annotation.created } : {}),
  }
}

/** Every annotation for an exported copy: marks first, then highlights. */
export function exportAnnotations(
  highlights: PdfTextHighlight[],
  marks: PdfMark[],
): Array<Record<string, unknown>> {
  return [...marks.map(exportableMark), ...highlightAnnotations(highlights)]
}

const MARK_NAMES: Record<number, string> = {
  4: "직선",
  5: "사각형",
  6: "원",
  15: "펜",
  1: "메모",
  3: "텍스트 상자",
}

function quote(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

/** Highlights with their notes and a page index of drawn marks, in reading order. */
export function annotationsMarkdown(title: string, highlights: PdfTextHighlight[], marks: PdfMark[]): string {
  const lines = [`# ${title} — 주석`, ""]
  const ordered = [...highlights].sort(
    (a, b) =>
      (a.pages[0]?.pageNumber ?? 0) - (b.pages[0]?.pageNumber ?? 0) ||
      (a.pages[0]?.rects[0]?.y ?? 0) - (b.pages[0]?.rects[0]?.y ?? 0),
  )
  if (ordered.length) {
    lines.push("## 하이라이트", "")
    for (const highlight of ordered) {
      const pages = [...new Set(highlight.pages.map((page) => page.pageNumber))]
      lines.push(`- p. ${pages.join("–")}${highlight.style === "red-underline" ? " · 밑줄" : ""}`)
      lines.push("", quote(highlight.text), "")
      if (highlight.note) lines.push(`  메모: ${highlight.note.trim()}`, "")
    }
  }
  if (marks.length) {
    lines.push("## 필기와 도형", "")
    const byPage = new Map<number, string[]>()
    for (const mark of marks) {
      const type = Number(mark.annotation.type)
      const name = MARK_NAMES[type] ?? "주석"
      const contents = typeof mark.annotation.contents === "string" ? mark.annotation.contents.trim() : ""
      const list = byPage.get(mark.pageIndex + 1) ?? []
      list.push(contents ? `${name}: ${contents}` : name)
      byPage.set(mark.pageIndex + 1, list)
    }
    for (const [page, items] of [...byPage.entries()].sort((a, b) => a[0] - b[0]))
      lines.push(`- p. ${page}: ${items.join(", ")}`)
    lines.push("")
  }
  if (!ordered.length && !marks.length) lines.push("아직 주석이 없습니다.", "")
  return lines.join("\n")
}
