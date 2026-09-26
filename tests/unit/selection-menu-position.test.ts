import { describe, expect, it } from "vitest"
import { selectionMenuPosition } from "../../src/views/main/features/pdf/adapters/selection-menu-position"

describe("selection menu screen placement", () => {
  const menu = { width: 550, height: 44 }
  const viewport = { width: 1024, height: 768 }
  it("keeps every action inside a narrow reader window at either page edge", () => {
    for (const x of [0, 15, 512, 1010, 1024]) {
      const position = selectionMenuPosition(
        { left: x, right: x + 10, top: 200, bottom: 220 },
        menu,
        viewport,
      )
      expect(position.left).toBeGreaterThanOrEqual(8)
      expect(position.left + menu.width).toBeLessThanOrEqual(viewport.width - 8)
    }
  })
  it("flips below a selection near the toolbar", () => {
    expect(selectionMenuPosition({ left: 400, right: 500, top: 10, bottom: 30 }, menu, viewport).top).toBe(38)
  })
  it("keeps an expanded note editor visible at the bottom", () => {
    const position = selectionMenuPosition(
      { left: 400, right: 500, top: 730, bottom: 750 },
      { width: 550, height: 250 },
      viewport,
    )
    expect(position.top).toBe(472)
  })
})
