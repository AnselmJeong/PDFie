import type { PluginRegistry } from "@embedpdf/core"
import { nativeDocument } from "./study-analysis"

/** Margins to hide, as fractions of the page's width (left, right) and height (top, bottom). */
export interface CropInsets {
  left: number
  top: number
  right: number
  bottom: number
}

export const NO_CROP: CropInsets = { left: 0, top: 0, right: 0, bottom: 0 }
/** Never hide more than this share of a page on one side. */
export const MAX_INSET = 0.3
const INK_THRESHOLD = 232
const PADDING = 0.012

/**
 * The inked area of a rendered page, as fractions of its size, or null for a
 * blank page. A row or column counts only with a few dark pixels so dust and
 * anti-aliasing at the paper edge do not widen the bounds.
 */
export function contentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } | null {
  const minimum = Math.max(2, Math.round(Math.min(width, height) * 0.004))
  const rows = new Uint32Array(height)
  const columns = new Uint32Array(width)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const alpha = pixels[offset + 3] ?? 255
      if (alpha < 16) continue
      const luminance =
        0.299 * (pixels[offset] ?? 255) +
        0.587 * (pixels[offset + 1] ?? 255) +
        0.114 * (pixels[offset + 2] ?? 255)
      if (luminance < INK_THRESHOLD) {
        rows[y] = (rows[y] ?? 0) + 1
        columns[x] = (columns[x] ?? 0) + 1
      }
    }
  }
  const first = (counts: Uint32Array) => counts.findIndex((count) => count >= minimum)
  const last = (counts: Uint32Array) => {
    for (let index = counts.length - 1; index >= 0; index--) if ((counts[index] ?? 0) >= minimum) return index
    return -1
  }
  const top = first(rows)
  const left = first(columns)
  if (top < 0 || left < 0) return null
  return {
    left: left / width,
    top: top / height,
    right: (last(columns) + 1) / width,
    bottom: (last(rows) + 1) / height,
  }
}

/**
 * Insets that keep every sampled page's content visible: the union of their
 * bounds, padded, capped per side, and symmetric left/right when nearly so.
 */
export function insetsFromBounds(
  bounds: Array<{ left: number; top: number; right: number; bottom: number }>,
): CropInsets {
  if (!bounds.length) return NO_CROP
  const clamp = (value: number) => Math.min(MAX_INSET, Math.max(0, value))
  const left = clamp(Math.min(...bounds.map((b) => b.left)) - PADDING)
  const right = clamp(1 - Math.max(...bounds.map((b) => b.right)) - PADDING)
  const top = clamp(Math.min(...bounds.map((b) => b.top)) - PADDING)
  const bottom = clamp(1 - Math.max(...bounds.map((b) => b.bottom)) - PADDING)
  // Facing pages mirror their gutters; a near-symmetric crop keeps spreads balanced.
  const horizontal = Math.abs(left - right) < 0.03 ? Math.min(left, right) : null
  return {
    left: round(horizontal ?? left),
    right: round(horizontal ?? right),
    top: round(top),
    bottom: round(bottom),
  }
}

/** Apply the reader's manual adjustment (positive hides more) within bounds. */
export function adjustInsets(insets: CropInsets, adjust: number): CropInsets {
  const shift = (value: number) => round(Math.min(MAX_INSET, Math.max(0, value + adjust)))
  return {
    left: shift(insets.left),
    top: shift(insets.top),
    right: shift(insets.right),
    bottom: shift(insets.bottom),
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** Pages to sample: spread through the document, skipping a title page when there are others. */
export function samplePages(pageCount: number, samples = 6): number[] {
  if (pageCount <= 0) return []
  if (pageCount <= samples) return Array.from({ length: pageCount }, (_, index) => index)
  const start = pageCount > 2 ? 1 : 0
  const span = pageCount - start
  return [
    ...new Set(Array.from({ length: samples }, (_, index) => start + Math.floor((index * span) / samples))),
  ]
}

/** Render a few pages at low resolution and find the margins they all share. */
export async function detectCrop(
  registry: PluginRegistry,
  documentId: string,
  signal: { cancelled: boolean },
): Promise<CropInsets> {
  const document = nativeDocument(registry, documentId)
  const engine = registry.getEngine()
  const bounds = []
  for (const pageIndex of samplePages(document.pages.length)) {
    if (signal.cancelled) break
    const page = document.pages[pageIndex]
    if (!page) continue
    const factor = Math.min(1, 220 / Math.max(1, page.size.width))
    try {
      const image = await engine
        .renderPageRectRaw(
          document,
          page,
          { origin: { x: 0, y: 0 }, size: { width: page.size.width, height: page.size.height } },
          { scaleFactor: factor, dpr: 1, rotation: 0 },
        )
        .toPromise()
      const found = contentBounds(new Uint8ClampedArray(image.data), image.width, image.height)
      if (found) bounds.push(found)
    } catch {
      // A page that cannot be rendered does not narrow the crop.
    }
  }
  return insetsFromBounds(bounds)
}
