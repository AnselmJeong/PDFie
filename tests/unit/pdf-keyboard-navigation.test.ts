import { describe, expect, it } from "vitest"
import { getPageNavigationDirection } from "../../src/views/main/features/pdf/adapters/EmbedPdfWorkspace"

function keyboardEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    code: key,
    ctrlKey: false,
    isComposing: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe("PDF keyboard page navigation", () => {
  it.each(["PageUp", "ArrowLeft"])("maps %s to the previous page", (key) => {
    expect(getPageNavigationDirection(keyboardEvent(key))).toBe(-1)
  })

  it.each(["PageDown", "ArrowRight"])("maps %s to the next page", (key) => {
    expect(getPageNavigationDirection(keyboardEvent(key))).toBe(1)
  })

  it("recognizes macOS Fn navigation when key and physical code differ", () => {
    expect(getPageNavigationDirection(keyboardEvent("ArrowDown", { key: "PageDown" }))).toBe(1)
    expect(getPageNavigationDirection(keyboardEvent("ArrowUp", { key: "PageUp" }))).toBe(-1)
  })

  it("ignores unrelated keys and modified navigation keys", () => {
    expect(getPageNavigationDirection(keyboardEvent("ArrowUp"))).toBe(0)
    expect(getPageNavigationDirection(keyboardEvent("ArrowRight", { metaKey: true }))).toBe(0)
    expect(getPageNavigationDirection(keyboardEvent("PageDown", { shiftKey: true }))).toBe(0)
    expect(getPageNavigationDirection(keyboardEvent("PageDown", { isComposing: true }))).toBe(0)
  })
})
