import {
  type PageTextSlice,
  PdfActionType,
  type PdfAnnotationObject,
  PdfAnnotationSubtype,
  type PdfDocumentObject,
  type PdfLinkTarget,
  type PdfPageGeometry,
  type PdfPageObject,
  type PdfTask,
} from "@embedpdf/models"
import type { PdfRect } from "./domain"
import { destinationPosition, findReferenceMentions, type ReferenceMention } from "./reference-links"

/** Something on a page that leads elsewhere: a PDF link or a textual reference. */
export type PageReference =
  | {
      type: "internal-link"
      rects: PdfRect[]
      pageIndex: number
      y?: number
      /** "Figure 3" text under a link over "3": its caption previews better than the destination. */
      mention?: ReferenceMention
    }
  | { type: "external-link"; rects: PdfRect[]; url: string }
  | { type: "mention"; rects: PdfRect[]; mention: ReferenceMention }

/** The engine calls this needs; both the viewer's worker engine and PdfiumNative provide them. */
export interface PageReferenceEngine {
  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfAnnotationObject[]>
  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageGeometry>
  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]): PdfTask<string[]>
}

const MAX_PAGE_GLYPHS = 60_000

function linkTarget(target: PdfLinkTarget | undefined, pageHeight: (index: number) => number) {
  if (!target) return null
  const destination =
    target.type === "destination"
      ? target.destination
      : target.action.type === PdfActionType.Goto
        ? target.action.destination
        : null
  if (destination)
    return {
      type: "internal-link" as const,
      ...destinationPosition(destination, pageHeight(destination.pageIndex)),
    }
  if (target.type === "action" && target.action.type === PdfActionType.URI && target.action.uri)
    return { type: "external-link" as const, url: target.action.uri }
  return null
}

const toRect = (rect: PdfAnnotationObject["rect"]): PdfRect => ({
  x: rect.origin.x,
  y: rect.origin.y,
  width: rect.size.width,
  height: rect.size.height,
})

export function overlaps(a: PdfRect, b: PdfRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** A page's text with one box per character (null for synthesized spaces). */
export function pageTextWithBoxes(geometry: PdfPageGeometry, texts: string[]) {
  let text = ""
  const boxes: Array<PdfRect | null> = []
  let nextChar = geometry.runs[0]?.charStart ?? 0
  geometry.runs.forEach((run, order) => {
    if (run.charStart > nextChar || (text && !/\s$/.test(text))) {
      text += " "
      boxes.push(null)
    }
    const runText = (texts[order] ?? "").replaceAll(String.fromCharCode(0), " ")
    Array.from(runText).forEach((char, index) => {
      const glyph = run.glyphs[index]
      text += char
      boxes.push(
        glyph && glyph.flags !== 2 && glyph.width > 0 && glyph.height > 0
          ? { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height }
          : null,
      )
    })
    nextChar = run.charStart + run.glyphs.length
  })
  return { text, boxes }
}

/** A page's PDF links and its figure, table and citation mentions not already covered by a link. */
export async function pageReferences(
  engine: PageReferenceEngine,
  document: PdfDocumentObject,
  page: PdfPageObject,
): Promise<PageReference[]> {
  const pageHeight = (index: number) => document.pages[index]?.size.height ?? page.size.height
  const links: PageReference[] = []
  try {
    for (const annotation of await engine.getPageAnnotations(document, page).toPromise()) {
      if (annotation.type !== PdfAnnotationSubtype.LINK) continue
      const target = linkTarget(annotation.target, pageHeight)
      if (target) links.push({ ...target, rects: [toRect(annotation.rect)] })
    }
  } catch {
    // A page whose annotations cannot be read still has textual references.
  }

  const mentions: PageReference[] = []
  try {
    const geometry = await engine.getPageGeometry(document, page).toPromise()
    const glyphs = geometry.runs.reduce((sum, run) => sum + run.glyphs.length, 0)
    if (glyphs > 0 && glyphs <= MAX_PAGE_GLYPHS) {
      const texts = await engine
        .getTextSlices(
          document,
          geometry.runs.map((run) => ({
            pageIndex: page.index,
            charIndex: run.charStart,
            charCount: run.glyphs.length,
          })),
        )
        .toPromise()
      const { text, boxes } = pageTextWithBoxes(geometry, texts)
      for (const mention of findReferenceMentions(text, boxes)) {
        // A PDF link over the same words knows its destination better.
        const link = links.find((item) =>
          item.rects.some((linkRect) => mention.rects.some((rect) => overlaps(linkRect, rect))),
        )
        if (!link) mentions.push({ type: "mention", rects: mention.rects, mention })
        else if (link.type === "internal-link" && !link.mention) link.mention = mention
      }
    }
  } catch {
    // Pages without a text layer have no textual references.
  }
  return [...links, ...mentions]
}

export function hitTest(references: PageReference[], point: { x: number; y: number }): PageReference | null {
  return (
    references.find((reference) =>
      reference.rects.some(
        (rect) =>
          point.x >= rect.x - 1 &&
          point.x <= rect.x + rect.width + 1 &&
          point.y >= rect.y - 1 &&
          point.y <= rect.y + rect.height + 1,
      ),
    ) ?? null
  )
}
