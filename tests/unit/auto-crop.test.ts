import { describe, expect, it } from "vitest"
import {
  adjustInsets,
  contentBounds,
  insetsFromBounds,
  MAX_INSET,
  NO_CROP,
  samplePages,
} from "../../src/views/main/features/pdf/adapters/auto-crop"

/** A white RGBA page with a dark rectangle of ink. */
function page(width: number, height: number, ink: { x: number; y: number; w: number; h: number }) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = ink.y; y < ink.y + ink.h; y++)
    for (let x = ink.x; x < ink.x + ink.w; x++) pixels.set([20, 20, 20, 255], (y * width + x) * 4)
  return pixels
}

describe("automatic margin cropping", () => {
  it("finds the inked area of a page", () => {
    const bounds = contentBounds(page(200, 300, { x: 30, y: 45, w: 140, h: 210 }), 200, 300)
    expect(bounds).toEqual({ left: 0.15, top: 0.15, right: 0.85, bottom: 0.85 })
  })

  it("ignores specks and treats a blank page as having no content", () => {
    const pixels = page(200, 300, { x: 30, y: 45, w: 140, h: 210 })
    pixels.set([0, 0, 0, 255], (5 * 200 + 5) * 4)
    expect(contentBounds(pixels, 200, 300)?.left).toBe(0.15)
    expect(contentBounds(new Uint8ClampedArray(200 * 300 * 4).fill(255), 200, 300)).toBeNull()
  })

  it("keeps every sampled page's content, padded and capped", () => {
    const insets = insetsFromBounds([
      { left: 0.12, top: 0.1, right: 0.88, bottom: 0.9 },
      { left: 0.14, top: 0.08, right: 0.86, bottom: 0.92 },
    ])
    expect(insets.left).toBeCloseTo(0.108)
    expect(insets.right).toBeCloseTo(0.108)
    expect(insets.top).toBeCloseTo(0.068)
    expect(insets.bottom).toBeCloseTo(0.068)
    expect(insetsFromBounds([{ left: 0.6, top: 0.6, right: 0.7, bottom: 0.7 }]).top).toBe(MAX_INSET)
    expect(insetsFromBounds([])).toEqual(NO_CROP)
  })

  it("applies the manual adjustment within bounds", () => {
    expect(adjustInsets({ left: 0.1, top: 0.05, right: 0.1, bottom: 0.05 }, 0.02)).toEqual({
      left: 0.12,
      top: 0.07,
      right: 0.12,
      bottom: 0.07,
    })
    expect(adjustInsets({ left: 0.01, top: 0.29, right: 0, bottom: 0 }, -0.05).left).toBe(0)
    expect(adjustInsets({ left: 0.01, top: 0.29, right: 0, bottom: 0 }, 0.05).top).toBe(MAX_INSET)
  })

  it("samples pages across the document and skips a title page", () => {
    expect(samplePages(3)).toEqual([0, 1, 2])
    expect(samplePages(100)).toEqual([1, 17, 34, 50, 67, 83])
    expect(samplePages(0)).toEqual([])
  })
})
