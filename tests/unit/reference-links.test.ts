import { describe, expect, it } from "vitest"
import type { PdfRect } from "../../src/shared/pdf/domain"
import {
  buildReferenceTargets,
  destinationPosition,
  expandCitationGroup,
  findReferenceMentions,
  isSelfReference,
  previewRegion,
  resolveMention,
} from "../../src/shared/pdf/reference-links"

/** Lay text out on one line, 6 units per character, starting at (x, y). */
function layout(text: string, x = 50, y = 100): Array<PdfRect | null> {
  return Array.from(text, (char, index) =>
    char === " " ? null : { x: x + index * 6, y, width: 5, height: 10 },
  )
}

const block = (
  pageIndex: number,
  rawText: string,
  y: number,
  role: "paragraph" | "caption" | "reference" | "heading" = "paragraph",
) => ({
  pageIndex,
  rawText,
  role,
  rects: [{ x: 60, y, width: 200, height: 10 }],
})

describe("figure, table and citation mentions", () => {
  it("finds figure, table and citation mentions with their boxes", () => {
    const text = "As shown in Fig. 3 and Table S2, results agree [4-6, 9] (see Figures 12)."
    const mentions = findReferenceMentions(text, layout(text))
    expect(mentions.map((m) => [m.kind, m.labels, m.text])).toEqual([
      ["figure", ["3"], "Fig. 3"],
      ["table", ["S2"], "Table S2"],
      ["figure", ["12"], "Figures 12"],
      ["citation", ["4", "5", "6", "9"], "[4-6, 9]"],
    ])
    const fig = mentions[0]
    expect(fig?.rects).toEqual([{ x: 50 + 12 * 6, y: 100, width: 5 * 6 + 5, height: 10 }])
  })

  it("does not mistake words that end in 표 or contain 'table' for a mention", () => {
    expect(findReferenceMentions("대표 3명", layout("대표 3명"))).toEqual([])
    expect(findReferenceMentions("Portable 3D", layout("Portable 3D"))).toEqual([])
    expect(findReferenceMentions("그림 2와 표 1", layout("그림 2와 표 1")).map((m) => m.kind)).toEqual([
      "figure",
      "table",
    ])
  })

  it("splits a mention across lines into one rectangle per line", () => {
    const boxes: Array<PdfRect | null> = [...layout("Figure", 400, 100), null, ...layout("7", 50, 112)]
    const [mention] = findReferenceMentions("Figure 7", boxes)
    expect(mention?.rects).toHaveLength(2)
  })

  it("bounds citation ranges", () => {
    expect(expandCitationGroup("1-200")).toEqual(["1"])
    expect(expandCitationGroup("3, 3, 4")).toEqual(["3", "4"])
    expect(expandCitationGroup("1-30")).toHaveLength(12)
  })
})

describe("reference targets from the study index", () => {
  const blocks = [
    block(0, "Figure 2 shows the pipeline we use throughout.", 300),
    block(2, "Figure 2. The processing pipeline.", 500, "caption"),
    block(3, "Table 1: Participants", 80, "caption"),
    block(5, "References", 60, "heading"),
    block(5, "[1] A. Author. A paper. 2019.", 90, "reference"),
    block(5, "[2] B. Author. Another paper, Journal, 2020.", 110, "paragraph"),
  ]
  const targets = buildReferenceTargets(blocks)

  it("prefers the real caption over a body line that starts with the label", () => {
    const figure = targets.find((t) => t.kind === "figure" && t.label === "2")
    expect(figure?.pageIndex).toBe(2)
    expect(targets.find((t) => t.kind === "table")?.label).toBe("1")
  })

  it("collects bibliography entries after the references heading", () => {
    expect(targets.filter((t) => t.kind === "citation").map((t) => [t.label, t.pageIndex])).toEqual([
      ["1", 5],
      ["2", 5],
    ])
    const mention = { kind: "citation" as const, labels: ["2", "7"], text: "[2,7]", rects: [] }
    expect(resolveMention(mention, targets).map((t) => t.label)).toEqual(["2"])
  })

  it("recognizes the caption itself as a self reference", () => {
    const caption = {
      kind: "figure" as const,
      labels: ["2"],
      text: "Figure 2",
      rects: [{ x: 60, y: 500, width: 40, height: 10 }],
    }
    expect(isSelfReference(caption, 2, targets)).toBe(true)
    expect(isSelfReference(caption, 0, targets)).toBe(false)
  })

  it("previews above a figure caption and below a table caption", () => {
    const page = { width: 600, height: 800 }
    const figure = previewRegion({ kind: "figure", rect: { x: 60, y: 500, width: 200, height: 10 } }, page)
    expect(figure.y + figure.height).toBeGreaterThan(510)
    expect(figure.y).toBeLessThan(500)
    const table = previewRegion({ kind: "table", rect: { x: 60, y: 80, width: 200, height: 10 } }, page)
    expect(table.y).toBe(70)
    expect(table.y + table.height).toBeLessThanOrEqual(800)
  })
})

describe("PDF link destinations", () => {
  it("converts PDF user space to a top offset", () => {
    expect(
      destinationPosition({ pageIndex: 4, zoom: { mode: 1, params: { x: 0, y: 700, zoom: 0 } } }, 792),
    ).toEqual({
      pageIndex: 4,
      y: 92,
    })
    expect(destinationPosition({ pageIndex: 1, zoom: { mode: 3 }, view: [600] }, 792)).toEqual({
      pageIndex: 1,
      y: 192,
    })
    expect(destinationPosition({ pageIndex: 2, zoom: { mode: 2 }, view: [] }, 792)).toEqual({ pageIndex: 2 })
    expect(
      destinationPosition({ pageIndex: 2, zoom: { mode: 1, params: { x: 0, y: 0, zoom: 0 } } }, 792),
    ).toEqual({
      pageIndex: 2,
    })
  })
})

describe("external links from a PDF", async () => {
  const { safeExternalUrl } = await import("../../src/shared/pdf/external-url")
  it("allows only web and mail links", () => {
    expect(safeExternalUrl("https://doi.org/10.1000/xyz")).toBe("https://doi.org/10.1000/xyz")
    expect(safeExternalUrl("mailto:author@example.org")).toBe("mailto:author@example.org")
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull()
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull()
    expect(safeExternalUrl("not a url")).toBeNull()
  })
})
