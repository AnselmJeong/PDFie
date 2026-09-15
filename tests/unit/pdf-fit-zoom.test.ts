import { describe, expect, it } from "vitest"
import { calculateFitZoom } from "../../src/views/main/features/pdf/adapters/fit-zoom"

describe("fit zoom for the visible spread", () => {
  const viewport = { width: 880, height: 870 }
  const page = { width: 595, height: 842 }

  it("fits a final unpaired page to the viewport height or width independently", () => {
    expect(calculateFitZoom("fit-page", page, viewport, 16)).toBe(0.995)
    expect(calculateFitZoom("fit-width", page, viewport, 16)).toBe(1.425)
  })

  it("includes the second page and gutter only while that pair is visible", () => {
    const pair = { width: 595 * 2 + 18, height: 842 }
    expect(calculateFitZoom("fit-width", pair, viewport, 16)).toBe(0.701)
    expect(calculateFitZoom("fit-width", page, viewport, 16)).toBeGreaterThan(1.4)
  })

  it("allows equal fit modes when width is the limiting dimension", () => {
    const landscape = { width: 842, height: 595 }
    expect(calculateFitZoom("fit-page", landscape, viewport, 16)).toBe(
      calculateFitZoom("fit-width", landscape, viewport, 16),
    )
  })

  it("recalculates after a sidebar resize and ignores unmeasured viewports", () => {
    expect(calculateFitZoom("fit-width", page, { width: 628, height: 870 }, 16)).toBe(1.001)
    expect(calculateFitZoom("fit-page", page, { width: 0, height: 0 }, 16)).toBeNull()
  })
})
