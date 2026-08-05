import { describe, expect, it } from "vitest"
import { restoreSingleSelectedPath } from "../../src/bun/pdf/open-file-dialog"

describe("single-file dialog path restoration", () => {
  it("restores commas that Electrobun splits out of a selected filename", () => {
    const selected = [
      "/Volumes/Aquatope/Downloads/3319959476 - Practical Guide to Transcranial Direct Current Stimulation; Principles",
      " Procedures and Applications - Helena Knotkova.pdf",
    ]

    expect(restoreSingleSelectedPath(selected)).toBe(
      "/Volumes/Aquatope/Downloads/3319959476 - Practical Guide to Transcranial Direct Current Stimulation; Principles, Procedures and Applications - Helena Knotkova.pdf",
    )
  })

  it("keeps ordinary paths unchanged", () => {
    expect(restoreSingleSelectedPath(["/Users/reader/Documents/paper.pdf"])).toBe(
      "/Users/reader/Documents/paper.pdf",
    )
  })

  it("returns null when the dialog is cancelled", () => {
    expect(restoreSingleSelectedPath([""])).toBeNull()
    expect(restoreSingleSelectedPath([])).toBeNull()
  })
})
