import { describe, expect, it } from "vitest"
import { createWheelPageNavigation } from "../../src/views/main/features/pdf/adapters/wheel-navigation"

function wheel(deltaY: number, overrides: Partial<WheelEvent> = {}) {
  return {
    deltaX: 0,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe("fit-page wheel navigation", () => {
  it("turns one page per gesture and ignores a long momentum tail", () => {
    const direction = createWheelPageNavigation()
    expect(direction(wheel(80), 0, 800)).toBe(1)
    for (let time = 20; time < 1800; time += 20) expect(direction(wheel(12), time, 800)).toBe(0)
    expect(direction(wheel(-80), 2100, 800)).toBe(-1)
  })

  it("accumulates small trackpad deltas without carrying them across separate gestures", () => {
    const direction = createWheelPageNavigation()
    expect(direction(wheel(20), 0, 800)).toBe(0)
    expect(direction(wheel(20), 200, 800)).toBe(0)
    expect(direction(wheel(12), 220, 800)).toBe(1)
  })

  it("normalizes line and page wheel units", () => {
    expect(createWheelPageNavigation()(wheel(3, { deltaMode: 1 }), 0, 800)).toBe(1)
    expect(createWheelPageNavigation()(wheel(-1, { deltaMode: 2 }), 0, 800)).toBe(-1)
  })

  it("leaves horizontal gestures and modified scrolling alone", () => {
    const direction = createWheelPageNavigation()
    for (const overrides of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { deltaX: 100 },
    ]) {
      expect(direction(wheel(80, overrides), 0, 800)).toBe(0)
    }
    expect(direction(wheel(80), 0, 800)).toBe(1)
  })

  it("drops partial motion on direction reversal and limits closely spaced turns", () => {
    const direction = createWheelPageNavigation()
    expect(direction(wheel(20), 0, 800)).toBe(0)
    expect(direction(wheel(-20), 20, 800)).toBe(0)
    expect(direction(wheel(-20), 40, 800)).toBe(-1)
    expect(direction(wheel(80), 240, 800)).toBe(0)
    expect(direction(wheel(80), 340, 800)).toBe(1)
  })
})
