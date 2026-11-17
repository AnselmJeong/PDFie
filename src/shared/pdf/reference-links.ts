import type { StudyBlock } from "../study/contracts"
import type { PdfRect } from "./domain"

/**
 * Figure, table and citation references in a paper's text, and the places
 * they point to. Papers without PDF links still say "Figure 3" or "[23]";
 * the study index already marks captions and reference entries, so a mention
 * can be resolved to its caption or bibliography entry without the PDF's help.
 */
export type ReferenceKind = "figure" | "table" | "citation"

export interface ReferenceMention {
  kind: ReferenceKind
  /** Normalized labels: "3", "S2"; a citation group "[4–6, 9]" lists each number. */
  labels: string[]
  text: string
  /** One rectangle per line the mention spans, in page units. */
  rects: PdfRect[]
}

export interface ReferenceTarget {
  kind: ReferenceKind
  label: string
  pageIndex: number
  rect: PdfRect
  text: string
}

const MAX_CITATION_GROUP = 12
const FIGURE_MENTION =
  /(?<![\p{L}\p{N}])(fig(?:ure)?s?\.?|tables?|tab\.|그림|표)[\s ]?(S?\d{1,3})(?![\p{N}])/giu
const CITATION_MENTION = /\[(\d{1,4}(?:\s*[-–—,]\s*\d{1,4}){0,20})\]/gu
const CAPTION_START =
  /^(?:(?:supplementary|extended data|supporting)\s+)?(fig(?:ure)?s?\.?|tables?|tab\.|그림|표)\s*(S?\d{1,3})(?![\p{N}])\s*([.:|–—-])?/iu
const REFERENCES_HEADING =
  /^(?:[\dIVX]+\.?\s*)?(?:references(?: and notes)?|bibliography|literature cited|works cited|참고\s?문헌)\s*$/iu
const BRACKET_ENTRY = /(?:^|\s)\[(\d{1,4})\]\s/gu
const NUMBERED_ENTRY = /^(\d{1,4})\.\s+\p{Lu}/u

function kindOf(word: string): "figure" | "table" {
  const lower = word.toLowerCase()
  return lower.startsWith("tab") || lower === "표" ? "table" : "figure"
}

function normalizeLabel(label: string): string {
  return label.toUpperCase().replace(/^0+(?=\d)/, "")
}

/** Expand "4–6, 9" into ["4", "5", "6", "9"], bounded for absurd ranges. */
export function expandCitationGroup(group: string): string[] {
  const labels: string[] = []
  for (const part of group.split(",")) {
    const range = part.split(/[-–—]/).map((value) => Number(value.trim()))
    const [start, end] = range
    if (start === undefined || !Number.isInteger(start)) continue
    if (
      range.length === 2 &&
      end !== undefined &&
      Number.isInteger(end) &&
      end >= start &&
      end - start < 50
    ) {
      for (let value = start; value <= end; value++) labels.push(String(value))
    } else labels.push(String(start))
    if (labels.length >= MAX_CITATION_GROUP) break
  }
  return [...new Set(labels)].slice(0, MAX_CITATION_GROUP)
}

/** Group character boxes into one rectangle per text line. */
export function lineRects(boxes: Array<PdfRect | null>): PdfRect[] {
  const lines: PdfRect[] = []
  for (const box of boxes) {
    if (!box || box.width <= 0 || box.height <= 0) continue
    const line = lines.find(
      (rect) =>
        Math.abs(rect.y + rect.height / 2 - (box.y + box.height / 2)) < Math.max(rect.height, box.height) / 2,
    )
    if (!line) {
      lines.push({ ...box })
      continue
    }
    const right = Math.max(line.x + line.width, box.x + box.width)
    const bottom = Math.max(line.y + line.height, box.y + box.height)
    line.x = Math.min(line.x, box.x)
    line.y = Math.min(line.y, box.y)
    line.width = right - line.x
    line.height = bottom - line.y
  }
  return lines
}

/**
 * Find references in a page's text. `boxes[i]` is the box of `text[i]`, or
 * null for characters PDFium synthesized (spaces between runs, line breaks).
 */
export function findReferenceMentions(text: string, boxes: Array<PdfRect | null>): ReferenceMention[] {
  const mentions: ReferenceMention[] = []
  const rectsFor = (start: number, end: number) => lineRects(boxes.slice(start, end))
  for (const match of text.matchAll(FIGURE_MENTION)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const rects = rectsFor(start, end)
    if (!rects.length) continue
    mentions.push({
      kind: kindOf(match[1] ?? ""),
      labels: [normalizeLabel(match[2] ?? "")],
      text: match[0],
      rects,
    })
  }
  for (const match of text.matchAll(CITATION_MENTION)) {
    const start = match.index ?? 0
    const labels = expandCitationGroup(match[1] ?? "")
    const rects = rectsFor(start, start + match[0].length)
    if (!labels.length || !rects.length) continue
    mentions.push({ kind: "citation", labels, text: match[0], rects })
  }
  return mentions
}

type IndexedBlock = Pick<StudyBlock, "pageIndex" | "rawText" | "rects" | "role"> & {
  style?: Pick<NonNullable<StudyBlock["style"]>, "bold">
}

/** The line rectangle at a character offset in a multi-line block, estimated by position. */
function rectAt(block: IndexedBlock, offset: number): PdfRect | null {
  if (!block.rects.length) return null
  const fraction = Math.min(0.999, Math.max(0, offset / Math.max(1, block.rawText.length)))
  return block.rects[Math.floor(fraction * block.rects.length)] ?? block.rects[0] ?? null
}

/**
 * Captions (the best-scoring line that starts with "Figure 3." and the like)
 * and bibliography entries after the last "References" heading.
 */
export function buildReferenceTargets(blocks: IndexedBlock[]): ReferenceTarget[] {
  const captions = new Map<string, { target: ReferenceTarget; score: number }>()
  for (const block of blocks) {
    const text = block.rawText.trim()
    const match = CAPTION_START.exec(text)
    const rect = block.rects[0]
    if (!match || !rect) continue
    const kind = kindOf(match[1] ?? "")
    const label = normalizeLabel(match[2] ?? "")
    const score =
      (match[3] ? 2 : 0) + (block.role === "caption" ? 1 : 0) + ((block.style?.bold ?? 0) >= 0.5 ? 1 : 0)
    const key = `${kind}:${label}`
    const existing = captions.get(key)
    if (!existing || score > existing.score)
      captions.set(key, {
        target: { kind, label, pageIndex: block.pageIndex, rect, text: text.slice(0, 400) },
        score,
      })
  }

  let start = -1
  blocks.forEach((block, index) => {
    if (block.rawText.trim().length <= 40 && REFERENCES_HEADING.test(block.rawText.trim())) start = index
  })
  const candidates =
    start >= 0 ? blocks.slice(start + 1) : blocks.filter((block) => block.role === "reference")
  const references = new Map<string, ReferenceTarget>()
  const addReference = (label: string, block: IndexedBlock, offset: number) => {
    if (references.has(label)) return
    const rect = rectAt(block, offset)
    if (!rect) return
    references.set(label, {
      kind: "citation",
      label,
      pageIndex: block.pageIndex,
      rect,
      text: block.rawText.slice(offset, offset + 400).trim(),
    })
  }
  for (const block of candidates) {
    const text = block.rawText
    const numbered = start >= 0 ? NUMBERED_ENTRY.exec(text.trimStart()) : null
    if (numbered?.[1]) addReference(numbered[1], block, 0)
    for (const match of text.matchAll(BRACKET_ENTRY)) {
      const offset = (match.index ?? 0) + (match[0].startsWith("[") ? 0 : 1)
      if (match[1]) addReference(String(Number(match[1])), block, offset)
    }
  }
  return [...[...captions.values()].map((entry) => entry.target), ...references.values()]
}

/** Targets for a mention, in the mention's order; unknown labels are skipped. */
export function resolveMention(mention: ReferenceMention, targets: ReferenceTarget[]): ReferenceTarget[] {
  return mention.labels.flatMap((label) => {
    const target = targets.find((item) => item.kind === mention.kind && item.label === label)
    return target ? [target] : []
  })
}

/** A mention that is the target itself (the caption line, the bibliography entry). */
export function isSelfReference(mention: ReferenceMention, pageIndex: number, targets: ReferenceTarget[]) {
  return resolveMention(mention, targets).some(
    (target) =>
      target.pageIndex === pageIndex &&
      mention.rects.some(
        (rect) =>
          Math.abs(rect.y + rect.height / 2 - (target.rect.y + target.rect.height / 2)) <
            Math.max(rect.height, target.rect.height) &&
          rect.x < target.rect.x + target.rect.width + 2 &&
          rect.x + rect.width > target.rect.x - 2,
      ),
  )
}

/**
 * The region of the target page worth previewing, in page units: the figure
 * above its caption, the table below its caption, a bibliography entry.
 */
export function previewRegion(
  target: Pick<ReferenceTarget, "kind" | "rect">,
  page: { width: number; height: number },
): PdfRect {
  const { rect } = target
  const clampY = (top: number, height: number) => {
    const y = Math.max(0, Math.min(top, page.height - height))
    return { y, height: Math.min(height, page.height - y) }
  }
  if (target.kind === "citation") {
    const x = Math.max(0, rect.x - 8)
    const width = Math.min(page.width - x, Math.max(rect.width + 16, page.width * 0.48))
    return { x, width, ...clampY(rect.y - 6, Math.max(page.height * 0.12, 72)) }
  }
  const height = page.height * 0.5
  const top = target.kind === "figure" ? rect.y + rect.height + page.height * 0.06 - height : rect.y - 10
  return { x: 0, width: page.width, ...clampY(top, height) }
}

/** Region below a link destination (top of a section, figure float or entry). */
export function destinationRegion(y: number | undefined, page: { width: number; height: number }): PdfRect {
  const height = page.height * 0.4
  const top = y === undefined ? 0 : Math.max(0, Math.min(y - 12, page.height - height))
  return { x: 0, y: top, width: page.width, height: Math.min(height, page.height - top) }
}

export interface DestinationLike {
  pageIndex: number
  zoom: { mode: number; params?: { x: number; y: number; zoom: number } }
  view?: number[]
}

/**
 * Convert a PDF destination (PDF user space, origin at the bottom left) to a
 * 0-based page index and the target's top in page units from the top.
 */
export function destinationPosition(
  destination: DestinationLike,
  pageHeight: number,
): { pageIndex: number; y?: number } {
  const fromTop = (top: number | undefined) =>
    top === undefined || !Number.isFinite(top) || top <= 0
      ? undefined
      : Math.max(0, Math.min(pageHeight, pageHeight - top))
  const view = destination.view ?? []
  let y: number | undefined
  switch (destination.zoom.mode) {
    case 1: // XYZ
      y = fromTop(destination.zoom.params?.y)
      break
    case 3: // FitH
    case 7: // FitBH
      y = fromTop(view[0])
      break
    case 5: // FitR: left, bottom, right, top
      y = fromTop(view[3])
      break
    default:
      y = undefined
  }
  return y === undefined ? { pageIndex: destination.pageIndex } : { pageIndex: destination.pageIndex, y }
}
