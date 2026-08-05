import type { PdfPageGeometry } from "@embedpdf/models"

export interface SelectionHighlightRect {
  origin: { x: number; y: number }
  size: { width: number; height: number }
}

export interface SelectionSlice {
  start: number
  count: number
}

export function selectionHighlightRectsOverlap(
  left: SelectionHighlightRect,
  right: SelectionHighlightRect,
): boolean {
  const overlapWidth =
    Math.min(left.origin.x + left.size.width, right.origin.x + right.size.width) -
    Math.max(left.origin.x, right.origin.x)
  const overlapHeight =
    Math.min(left.origin.y + left.size.height, right.origin.y + right.size.height) -
    Math.max(left.origin.y, right.origin.y)
  return overlapWidth > 0.5 && overlapHeight > 0.5
}

function verticalOverlap(left: SelectionHighlightRect, right: SelectionHighlightRect): number {
  const top = Math.max(left.origin.y, right.origin.y)
  const bottom = Math.min(left.origin.y + left.size.height, right.origin.y + right.size.height)
  return Math.max(0, bottom - top)
}

function union(left: SelectionHighlightRect, right: SelectionHighlightRect): SelectionHighlightRect {
  const x = Math.min(left.origin.x, right.origin.x)
  const y = Math.min(left.origin.y, right.origin.y)
  const rightEdge = Math.max(left.origin.x + left.size.width, right.origin.x + right.size.width)
  const bottom = Math.max(left.origin.y + left.size.height, right.origin.y + right.size.height)
  return { origin: { x, y }, size: { width: rightEdge - x, height: bottom - y } }
}

/**
 * PDF text geometry often contains overlapping rectangles for adjacent glyph
 * runs. Rendering those rectangles independently produces dark seams because
 * translucent highlights stack. Merge only close rectangles on the same
 * visual line so selection remains precise across columns and equations.
 */
export function mergeSelectionHighlightRects(
  rects: readonly SelectionHighlightRect[],
): SelectionHighlightRect[] {
  const sorted = rects
    .filter((rect) => rect.size.width > 0 && rect.size.height > 0)
    .map((rect) => ({ origin: { ...rect.origin }, size: { ...rect.size } }))
    .sort((left, right) => left.origin.y - right.origin.y || left.origin.x - right.origin.x)

  const merged: SelectionHighlightRect[] = []
  for (const rect of sorted) {
    const current = merged.at(-1)
    if (!current) {
      merged.push(rect)
      continue
    }

    const overlapRatio = verticalOverlap(current, rect) / Math.min(current.size.height, rect.size.height)
    const horizontalGap = rect.origin.x - (current.origin.x + current.size.width)
    const maximumLineGap = Math.max(2, Math.min(current.size.height, rect.size.height) * 0.45)
    if (overlapRatio >= 0.58 && horizontalGap <= maximumLineGap) {
      merged[merged.length - 1] = union(current, rect)
    } else {
      merged.push(rect)
    }
  }
  return merged
}

/**
 * EmbedPDF builds selection rectangles from PDFium's loose character boxes.
 * Those boxes include font advance/side-bearing space, so the visible blue
 * edge can extend beyond the first or last selected glyph. Keep the stable
 * loose vertical line box, but take the horizontal endpoints from PDFium's
 * tight character boxes.
 */
export function createPreciseSelectionHighlightRects(
  geometry: PdfPageGeometry | undefined,
  slice: SelectionSlice | undefined,
  fallback: readonly SelectionHighlightRect[] = [],
): SelectionHighlightRect[] {
  if (!geometry || !slice || slice.count <= 0) return mergeSelectionHighlightRects(fallback)

  const selectionStart = slice.start
  const selectionEnd = slice.start + slice.count - 1
  const rects: SelectionHighlightRect[] = []

  for (const run of geometry.runs) {
    const runStart = run.charStart
    const runEnd = runStart + run.glyphs.length - 1
    if (runEnd < selectionStart || runStart > selectionEnd) continue

    const firstGlyph = Math.max(selectionStart, runStart) - runStart
    const lastGlyph = Math.min(selectionEnd, runEnd) - runStart
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    let previousRight = Number.NEGATIVE_INFINITY
    let glyphCount = 0
    let glyphWidthTotal = 0

    const flush = () => {
      if (glyphCount > 0 && Number.isFinite(left) && Number.isFinite(top)) {
        rects.push({
          origin: { x: left, y: top },
          size: { width: right - left, height: bottom - top },
        })
      }
      left = Number.POSITIVE_INFINITY
      right = Number.NEGATIVE_INFINITY
      top = Number.POSITIVE_INFINITY
      bottom = Number.NEGATIVE_INFINITY
      previousRight = Number.NEGATIVE_INFINITY
      glyphCount = 0
      glyphWidthTotal = 0
    }

    for (let index = firstGlyph; index <= lastGlyph; index += 1) {
      const glyph = run.glyphs[index]
      if (!glyph) continue
      // PDFium flag 2 denotes whitespace/empty geometry. Internal spaces are
      // retained naturally by the union of the surrounding visible glyphs.
      if (glyph.flags === 2) continue

      const glyphLeft = glyph.tightX ?? glyph.x
      const glyphWidth = glyph.tightWidth ?? glyph.width
      const glyphRight = glyphLeft + glyphWidth
      const averageWidth = glyphCount > 0 ? glyphWidthTotal / glyphCount : 0
      if (glyphCount > 0 && averageWidth > 0 && Math.abs(glyphLeft - previousRight) > averageWidth * 2.5) {
        flush()
      }

      left = Math.min(left, glyphLeft)
      right = Math.max(right, glyphRight)
      // Loose Y/height intentionally preserve a calm, even line-height band.
      top = Math.min(top, glyph.y)
      bottom = Math.max(bottom, glyph.y + glyph.height)
      previousRight = glyphRight
      glyphCount += 1
      glyphWidthTotal += glyphWidth
    }
    flush()
  }

  return rects.length ? mergeSelectionHighlightRects(rects) : mergeSelectionHighlightRects(fallback)
}
