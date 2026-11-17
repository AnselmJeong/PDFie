import { describe, expect, it } from "vitest"
import {
  emptyHistory,
  goBack,
  goForward,
  MAX_HISTORY,
  recordJump,
} from "../../src/shared/pdf/navigation-history"

describe("reader back/forward history", () => {
  it("returns through a chain of jumps and forward again", () => {
    let history = emptyHistory()
    history = recordJump(history, { page: 3, y: 400 }, { page: 12 })
    history = recordJump(history, { page: 12, y: 0 }, { page: 30 })
    const back = goBack(history, { page: 30, y: 10 })
    expect(back?.target).toEqual({ page: 12, y: 0 })
    const backAgain = back && goBack(back.history, { page: 12, y: 0 })
    expect(backAgain?.target).toEqual({ page: 3, y: 400 })
    const forward = backAgain && goForward(backAgain.history, { page: 3, y: 400 })
    expect(forward?.target).toEqual({ page: 12, y: 0 })
    expect(forward && goForward(forward.history, { page: 12, y: 0 })?.target).toEqual({ page: 30, y: 10 })
  })

  it("ignores jumps to the same place and does not duplicate the origin", () => {
    let history = recordJump(emptyHistory(), { page: 4, y: 100 }, { page: 4, y: 110 })
    expect(history.back).toEqual([])
    history = recordJump(history, { page: 4, y: 100 }, { page: 9 })
    history = recordJump(history, { page: 4, y: 105 }, { page: 11 })
    expect(history.back).toEqual([{ page: 4, y: 100 }])
  })

  it("clears forward on a new jump and stays bounded", () => {
    let history = recordJump(emptyHistory(), { page: 1 }, { page: 5 })
    const back = goBack(history, { page: 5 })
    history = recordJump(back?.history ?? history, { page: 1 }, { page: 8 })
    expect(history.forward).toEqual([])
    for (let page = 1; page <= MAX_HISTORY + 20; page++)
      history = recordJump(history, { page }, { page: page + 1000 })
    expect(history.back).toHaveLength(MAX_HISTORY)
    expect(goBack(emptyHistory(), { page: 1 })).toBeNull()
    expect(goForward(emptyHistory(), { page: 1 })).toBeNull()
  })
})
