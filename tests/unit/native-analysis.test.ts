import type { PdfPageGeometry, PdfTextRun } from "@embedpdf/models"
import { describe, expect, it } from "vitest"
import { analysisByteLength, MAX_PAGE_ANALYSIS_BYTES } from "../../src/shared/study/contracts"
import { groupNativeRuns } from "../../src/views/main/features/pdf/adapters/study-analysis"

function wordRuns(columns = 2, lines = 32, words = 20) {
  const geometry: PdfPageGeometry = { runs: [] }
  const texts: string[] = []
  let charStart = 0
  for (let column = 0; column < columns; column++)
    for (let line = 0; line < lines; line++)
      for (let word = 0; word < words; word++) {
        const x = 50 + column * 280 + word * 11,
          y = 50 + line * 11
        const text = "word "
        geometry.runs.push({
          charStart,
          fontSize: 1,
          rect: { x, y, width: 10, height: 10 },
          glyphs: Array.from(text, (_, i) => ({
            x: x + i * 2,
            y,
            width: 2,
            height: 10,
            flags: i === 4 ? 1 : 0,
          })),
        })
        texts.push(text)
        charStart += text.length
      }
  return { geometry, texts }
}

function styledLines(
  lines: Array<{ text: string; y: number; height: number; bold?: boolean; blue?: boolean; x?: number }>,
) {
  const geometry: PdfPageGeometry = { runs: [] }
  const texts: string[] = []
  const rich: PdfTextRun[] = []
  let charStart = 0
  for (const line of lines) {
    const text = `${line.text}\n`
    const x = line.x ?? 50
    const width = line.text.length * 3
    geometry.runs.push({
      charStart,
      fontSize: 1,
      rect: { x, y: line.y, width, height: line.height },
      glyphs: Array.from(text, (character, i) => ({
        x: x + i * 3,
        y: line.y,
        width: 3,
        height: line.height,
        flags: character === "\n" ? 2 : character === " " ? 1 : 0,
      })),
    })
    texts.push(text)
    rich.push({
      text,
      charIndex: charStart,
      charCount: text.length,
      fontSize: 1,
      rect: { origin: { x, y: line.y }, size: { width, height: line.height } },
      font: {
        name: line.bold ? "Bold" : "Roman",
        familyName: "Test",
        weight: line.bold ? 800 : 400,
        italic: false,
        monospaced: false,
        embedded: true,
      },
      color: line.blue
        ? { red: 125, green: 148, blue: 201, alpha: 255 }
        : { red: 0, green: 0, blue: 0, alpha: 255 },
    })
    charStart += text.length
  }
  return { geometry, texts, rich }
}

describe("native page analysis", () => {
  it("indexes dense word-run PDFs without dropping words or crossing columns", () => {
    const { geometry, texts } = wordRuns()
    expect(geometry.runs.length).toBeGreaterThan(1000)
    const blocks = groupNativeRuns(geometry, texts, 612, 791)
    expect(blocks).toHaveLength(2)
    expect(
      blocks
        .map((block) => block.rawText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ).toBe(texts.join("").trim())
    expect(blocks.every((block) => block.quality === "usable" && block.role === "paragraph")).toBe(true)
    expect(blocks[0]?.rects).toHaveLength(32)
    expect(blocks[1]?.rects).toHaveLength(32)
    expect(blocks[0]?.rects.every((rect) => rect.x + rect.width < 300)).toBe(true)
    expect(blocks[1]?.rects.every((rect) => rect.x >= 330)).toBe(true)
    expect(
      analysisByteLength({ pageIndex: 0, width: 612, height: 791, status: "ready", blocks }),
    ).toBeLessThan(MAX_PAGE_ANALYSIS_BYTES)
  })
  it("retains punctuation runs and whitespace within a sentence", () => {
    const { geometry } = wordRuns(1, 1, 3)
    const blocks = groupNativeRuns(geometry, ["Claim", ", ", "evidence."], 612, 791)
    expect(blocks[0]?.rawText).toBe("Claim, evidence.")
  })
  it("splits long paragraphs at storage boundaries without truncation", () => {
    const { geometry, texts } = wordRuns(1, 160, 20)
    const blocks = groupNativeRuns(geometry, texts, 612, 2200)
    expect(blocks.length).toBeGreaterThan(1)
    expect(blocks.every((block) => block.rawText.length <= 12000 && block.rects.length <= 300)).toBe(true)
    expect(
      blocks
        .map((block) => block.rawText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ).toBe(texts.join("").trim())
  })
  it("merges wrapped styled subheadings while retaining their following body", () => {
    const { geometry, texts, rich } = styledLines([
      { text: "The preceding paragraph ends here.", y: 100, height: 10 },
      { text: "Single versus multi-dimensional approaches to", y: 140, height: 12, bold: true, blue: true },
      { text: "consciousness", y: 152, height: 12, bold: true, blue: true },
      { text: "Diagnoses and symptom severity measures have tended to adopt", y: 175, height: 10 },
      { text: "a single-dimension model of consciousness.", y: 186, height: 10 },
    ])
    const blocks = groupNativeRuns(geometry, texts, 612, 791, rich)
    expect(blocks.map((block) => block.role)).toEqual(["paragraph", "heading", "paragraph"])
    expect(blocks[1]?.rawText.replace(/\s+/g, " ")).toBe(
      "Single versus multi-dimensional approaches to consciousness",
    )
    expect(blocks[1]?.rects).toHaveLength(2)
    expect(blocks[2]?.rawText).toContain("single-dimension model")
  })
  it("does not promote alternating glyph heights, years, author names or running headers to sections", () => {
    const { geometry, texts, rich } = styledLines([
      { text: "Journal 2026: Article title", y: 20, height: 16, bold: true, blue: true },
      { text: "Robin L. Researcher1,2", y: 140, height: 15, bold: true },
      { text: "The hypothesis states that expansive conscious states reliably", y: 200, height: 11 },
      { text: "exhibit increased brain entropy while the inverse applies", y: 212, height: 12 },
      { text: "for states of reduced consciousness across several contexts.", y: 224, height: 11 },
      { text: "2017 with the publication of an important paper led by a researcher", y: 260, height: 10 },
    ])
    expect(groupNativeRuns(geometry, texts, 612, 791, rich).every((block) => block.role !== "heading")).toBe(
      true,
    )
  })
  it("keeps bold table captions separate from section headings", () => {
    const { geometry, texts, rich } = styledLines([
      { text: "Table 2 Evidence for the hypothesis", y: 100, height: 16, bold: true, blue: true },
      { text: "The table describes several empirical observations.", y: 125, height: 10 },
    ])
    expect(groupNativeRuns(geometry, texts, 612, 791, rich)[0]?.role).toBe("caption")
  })
})
