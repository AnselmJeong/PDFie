import { describe, expect, it } from "vitest"
import { clampPage, getPageGroup } from "../../src/views/main/features/pdf/adapters/page-navigation"

describe("paginated PDF navigation", () => {
  it("advances to the next pair even when the right-hand page is current", () => {
    expect(getPageGroup(2, 8, true)).toEqual({ first: 1, last: 2, previous: null, next: 3 })
    expect(getPageGroup(4, 8, true)).toEqual({ first: 3, last: 4, previous: 1, next: 5 })
  })

  it("stops at both even and odd document endings", () => {
    expect(getPageGroup(319, 320, true)).toEqual({ first: 319, last: 320, previous: 317, next: null })
    expect(getPageGroup(3, 3, true)).toEqual({ first: 3, last: 3, previous: 1, next: null })
    expect(getPageGroup(1, 1, true)).toEqual({ first: 1, last: 1, previous: null, next: null })
  })

  it("uses single-page steps when leaving a two-page spread", () => {
    expect(getPageGroup(4, 8, false)).toEqual({ first: 4, last: 4, previous: 3, next: 5 })
  })

  it("clamps restored and typed page numbers before calling the SDK", () => {
    expect(clampPage(999, 3)).toBe(3)
    expect(clampPage(-2, 3)).toBe(1)
    expect(clampPage(2.8, 3)).toBe(2)
    expect(clampPage(Number.NaN, 3)).toBe(1)
    expect(getPageGroup(1, 0, true).next).toBeNull()
  })
})
