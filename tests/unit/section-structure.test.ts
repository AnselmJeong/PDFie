import { describe, expect, it } from "vitest"
import type { PdfOutlineNode } from "../../src/shared/pdf/domain"
import type { BlockStyle, StudyBlock, StudySection } from "../../src/shared/study/contracts"
import {
  analyzeStructure,
  headingNameKind,
  isBoldFont,
  isItalicFont,
  sectionSubtree,
} from "../../src/shared/study/section-structure"

const BODY = "Brain entropy describes the diversity of neural states visited over time in each session."
let counter = 0
function block(
  rawText: string,
  pageIndex: number,
  style: Partial<BlockStyle> = {},
  role: StudyBlock["role"] = "paragraph",
): StudyBlock {
  counter++
  return {
    id: `B${counter}`,
    documentHash: "doc",
    revision: "test",
    pageIndex,
    rawText,
    normalizedText: rawText,
    rects: [{ x: 50, y: 100, width: 400, height: 10 }],
    role,
    quality: "usable",
    order: counter,
    sectionId: "",
    style: { size: 9, bold: 0, colored: 0, italic: 0, font: "Times/0/0/0", top: 0.3, left: 0.1, ...style },
  }
}
const body = (pageIndex: number, text = BODY) => block(`${text} ${text}`, pageIndex)
const heading = (text: string, pageIndex: number, style: Partial<BlockStyle> = {}) =>
  block(text, pageIndex, { size: 11, bold: 1, font: "Times-Bold/0/0/0", ...style })
const titles = (blocks: StudyBlock[], outline: PdfOutlineNode[] = []) => {
  const structure = analyzeStructure(blocks, outline)
  return blocks.flatMap((b) => (structure.boundaries.get(b.id) ?? []).map((s) => `${s.level} ${s.title}`))
}

describe("font recognition", () => {
  it("reads bold and italic faces from names when PDFium reports weight 0", () => {
    expect(isBoldFont({ name: "Helvetica-Bold", weight: 0 })).toBe(true)
    expect(isBoldFont({ name: "NimbusRomNo9L-Medi", weight: 0 })).toBe(true)
    expect(isBoldFont({ name: "CMBX12", weight: 0 })).toBe(true)
    expect(isBoldFont({ name: "AdvOT-Semibold" })).toBe(true)
    expect(isBoldFont({ name: "Times-Roman", weight: 400 })).toBe(false)
    expect(isBoldFont({ name: "Inter-Light", weight: 300 })).toBe(false)
    expect(isBoldFont({ name: "Custom", weight: 700 })).toBe(true)
    expect(isItalicFont({ name: "Helvetica-Oblique" })).toBe(true)
    expect(isItalicFont({ name: "MinionPro-It" })).toBe(true)
    expect(isItalicFont({ name: "Times-Roman", italic: false })).toBe(false)
  })
})

describe("heading names", () => {
  it("recognizes numbered, capitalized and Korean section names", () => {
    expect(headingNameKind("2.1 Materials and Methods")).toBe("body")
    expect(headingNameKind("III. RESULTS AND DISCUSSION")).toBe("body")
    expect(headingNameKind("Related Work")).toBe("body")
    expect(headingNameKind("Appendix B")).toBe("body")
    expect(headingNameKind("결론 및 제언")).toBe("body")
    expect(headingNameKind("REFERENCES")).toBe("back")
    expect(headingNameKind("Conflicts of Interest:")).toBe("back")
    expect(headingNameKind("Data and code availability")).toBe("back")
    expect(headingNameKind("참고문헌")).toBe("back")
    expect(headingNameKind("Entropy increases under psilocybin")).toBeNull()
  })
})

describe("document structure", () => {
  it("judges headings against the document's body style and nests subsections", () => {
    const blocks = [
      block("A paper about brain entropy", 0, { size: 18, bold: 1, font: "Times-Bold/0/0/0", top: 0.1 }),
      block("Robin Researcher1,2 and Kim Analyst2", 0, { top: 0.15 }),
      heading("Introduction", 0),
      body(0),
      heading("Results", 0),
      // Same size as body text: bold and set apart from body type.
      heading("Entropy increases under psilocybin", 0, { size: 9 }),
      body(0),
      heading("Subjective reports track entropy", 1, { size: 9 }),
      body(1),
      heading("Discussion", 1),
      body(1),
    ]
    const structure = analyzeStructure(blocks)
    expect(structure.documentTitle).toBe("A paper about brain entropy")
    expect(titles(blocks)).toEqual([
      "1 Introduction",
      "1 Results",
      "2 Entropy increases under psilocybin",
      "2 Subjective reports track entropy",
      "1 Discussion",
    ])
  })

  it("recognizes Korean headings and back matter", () => {
    const blocks = [
      heading("서론", 0, { font: "Gothic-Bold/0/0/0" }),
      body(0, "정확한 선택은 조사와 문장부호를 그대로 보존해야 하며 읽는 순서가 바뀌지 않아야 한다."),
      heading("연구 방법", 0, { font: "Gothic-Bold/0/0/0" }),
      body(0, "참여자는 두 차례 방문하였고 각 방문 사이에는 일주일의 간격을 두었다고 보고하였다."),
      heading("참고문헌", 1, { font: "Gothic-Bold/0/0/0" }),
      body(1, "홍길동. 뇌 엔트로피 연구. 한국심리학회지. 2020;12:1-9."),
    ]
    expect(titles(blocks)).toEqual(["1 서론", "1 연구 방법", "1 참고문헌"])
  })

  it("ignores running headers, figure labels and out-of-sequence numbering", () => {
    const blocks: StudyBlock[] = []
    for (let page = 0; page < 4; page++) {
      blocks.push(
        block("JOURNAL OF CLINICAL STUDIES", page, { size: 9, bold: 1, font: "Arial-Bold/0/0/0", top: 0.04 }),
      )
      blocks.push(block(`Researcher et al. Page ${page + 1}`, page, { top: 0.96 }))
    }
    blocks.splice(1, 0, heading("1 Introduction", 0), body(0))
    blocks.splice(
      5,
      0,
      heading("Placebo", 1, { size: 10 }),
      heading("Psilocybin", 1, { size: 10 }),
      block("Time after dosing (min)", 1, { size: 6 }),
      block("LZc", 1, { size: 6 }),
      block("Fig. 1 | Signal complexity across conditions.", 1, { size: 7 }, "caption"),
      body(1),
      // A bold table row that happens to start with a number.
      heading("12 Subjects completed both visits", 1, { size: 9 }),
      body(1),
      heading("2 Methods", 2),
      body(2),
    )
    expect(titles(blocks)).toEqual(["1 1 Introduction", "1 2 Methods"])
    const structure = analyzeStructure(blocks)
    expect([...structure.furniture].length).toBeGreaterThanOrEqual(8)
  })

  it("rejects runs of figure labels even when body text follows them", () => {
    const blocks = [
      heading("Introduction", 0),
      body(0),
      heading("Placebo", 0, { size: 9 }),
      heading("Psilocybin", 0, { size: 9 }),
      heading("Ketamine", 0, { size: 9 }),
      // A heading directly after a figure still opens its section.
      heading("Effects on network integration", 0, { size: 9 }),
      body(0),
    ]
    expect(titles(blocks)).toEqual(["1 Introduction", "2 Effects on network integration"])
  })

  it("prefers usable bookmarks and nests native headings below them", () => {
    const blocks = [
      block("Chapter one", 0, { size: 16, bold: 1, font: "Times-Bold/0/0/0", top: 0.1 }),
      body(0),
      heading("Background", 1),
      body(1),
      block("Second chapter opening", 2, { top: 0.1 }),
      body(2),
    ]
    const outline: PdfOutlineNode[] = [
      {
        id: "p1",
        title: "Part I",
        pageNumber: 1,
        children: [
          { id: "c1", title: "Chapter one", pageNumber: 1, children: [] },
          { id: "c2", title: "Chapter two", pageNumber: 3, children: [] },
        ],
      },
    ]
    expect(titles(blocks, outline)).toEqual(["1 Part I", "2 Chapter one", "3 Background", "2 Chapter two"])
  })

  it("falls back to page-level heading roles for blocks indexed without typography", () => {
    const plain = [
      { ...block("Methods", 0, {}, "heading"), style: undefined },
      { ...body(0), style: undefined },
      { ...block("Results", 0, {}, "heading"), style: undefined },
      { ...body(0), style: undefined },
    ]
    expect(titles(plain)).toEqual(["1 Methods", "1 Results"])
  })
})

describe("section subtree", () => {
  it("includes nested sections up to the next sibling", () => {
    const section = (id: string, level: number): StudySection => ({
      id,
      title: id,
      startBlockId: id,
      endBlockId: id,
      pageStart: 1,
      pageEnd: 1,
      source: "heading",
      userEdited: false,
      level,
      parentId: null,
      kind: "body",
    })
    const sections = [section("a", 1), section("a1", 2), section("a1x", 3), section("a2", 2), section("b", 1)]
    expect([...sectionSubtree(sections, "a")]).toEqual(["a", "a1", "a1x", "a2"])
    expect([...sectionSubtree(sections, "a1")]).toEqual(["a1", "a1x"])
    expect([...sectionSubtree(sections, "missing")]).toEqual([])
  })
})
