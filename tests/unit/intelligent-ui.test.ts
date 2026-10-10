import { describe, expect, it } from "vitest"
import { studyOutputSchema } from "../../src/bun/study/output-schema"
import type { EvidenceRef } from "../../src/shared/study/contracts"
import { illustrativeSignal, validateWidgetState } from "../../src/shared/study/intelligent-ui"
import { validateLesson } from "../../src/shared/study/validation"

const evidence: EvidenceRef[] = [
  {
    id: "e1",
    documentHash: "doc",
    revision: "r1",
    quote: "source",
    pageIndex: 0,
    rects: [],
    sectionTitle: "source",
    precision: "page-only",
    quality: "usable",
  },
]
const common = { title: "개념 비교", text: "발췌를 확인하며 개념의 차이를 탐구합니다.", evidenceIds: ["e1"] }
const quiz = {
  type: "quiz",
  title: "점검",
  question: "어떤가요?",
  options: ["하나", "둘"],
  correctIndex: 0,
  feedback: "원문을 확인하세요.",
  evidenceIds: ["e1"],
}
const comparison = {
  ...common,
  type: "comparison",
  concepts: ["단일 차원", "다차원"],
  aspects: [
    { label: "목적", values: ["요약합니다.", "구분합니다."], evidenceIds: ["e1"] },
    { label: "한계", values: ["차이를 숨깁니다.", "복잡해집니다."], evidenceIds: ["e1"] },
  ],
}
const sandbox = {
  ...common,
  type: "sandbox",
  initialHeight: 360,
  css: "",
  html: '<button id="select">선택</button>',
  jsFunctions: "function choose() {}",
  jsExpressions: ["choose();"],
  dataKind: "paper",
}
const lesson = (step: unknown, dataKind = "paper") => ({
  schemaVersion: 1,
  title: "학습",
  objectives: ["이해"],
  prerequisites: [],
  dataKind,
  steps: [{ ...common, type: "explanation" }, step, quiz],
})

describe("adaptive lesson catalog", () => {
  it("accepts cited comparisons and rejects mismatched widths or fabricated row citations", () => {
    expect(validateLesson(lesson(comparison), evidence).steps[1]?.type).toBe("comparison")
    for (const patch of [{ values: ["하나"] }, { evidenceIds: ["unknown"] }, { evidenceIds: [] }])
      expect(() =>
        validateLesson(
          lesson({ ...comparison, aspects: [{ ...comparison.aspects[0], ...patch }, comparison.aspects[1]] }),
          evidence,
        ),
      ).toThrow()
  })
  it("requires real concept endpoints and evidence on each relationship", () => {
    const graph = {
      ...common,
      type: "concept-map",
      nodes: [
        { label: "하나", detail: "설명", evidenceIds: ["e1"] },
        { label: "둘", detail: "설명", evidenceIds: ["e1"] },
      ],
      edges: [{ from: 0, to: 1, label: "연결", evidenceIds: ["e1"] }],
    }
    expect(validateLesson(lesson(graph), evidence).steps[1]?.type).toBe("concept-map")
    for (const to of [-1, 0, 2, 0.5])
      expect(() =>
        validateLesson(lesson({ ...graph, edges: [{ ...graph.edges[0], to }] }), evidence),
      ).toThrow()
  })
  it("requires support, limits, proposed checks and evidence for a claim", () => {
    const map = {
      ...common,
      type: "evidence-map",
      claims: [
        { claim: "주장", support: "지지", limitation: "한계", nextCheck: "제안", evidenceIds: ["e1"] },
      ],
    }
    expect(validateLesson(lesson(map), evidence).steps[1]?.type).toBe("evidence-map")
    expect(() =>
      validateLesson(lesson({ ...map, claims: [{ ...map.claims[0], evidenceIds: [] }] }), evidence),
    ).toThrow()
  })
  it("requires illustrative labels for signals and keeps marginal entropy distinct from structure", () => {
    const signal = { ...common, type: "signal-experiment", initial: 0.5 }
    expect(() => validateLesson(lesson(signal), evidence)).toThrow()
    expect(validateLesson(lesson(signal, "illustrative"), evidence).steps[1]?.type).toBe("signal-experiment")
    expect(() => validateLesson(lesson({ ...signal, initial: NaN }, "illustrative"), evidence)).toThrow()
    const alternating = illustrativeSignal(0),
      random = illustrativeSignal(1)
    expect(alternating.entropy).toBe(1)
    expect(random.entropy).toBeGreaterThan(0.9)
    expect(alternating.transitions).toBe(1)
    expect(random.transitions).toBeLessThan(0.7)
    expect(illustrativeSignal(1)).toEqual(random)
  })
  it("accepts separated sandbox channels while rejecting oversized or embedded executable documents", () => {
    expect(validateLesson(lesson(sandbox), evidence).steps[1]?.type).toBe("sandbox")
    for (const html of [
      "<script>attack()</script>",
      '<iframe src="x"></iframe>',
      '<meta http-equiv="refresh">',
      '<a href="https://example.com">external</a>',
    ])
      expect(() => validateLesson(lesson({ ...sandbox, html }), evidence)).toThrow()
    expect(() => validateLesson(lesson({ ...sandbox, css: "x".repeat(10001) }), evidence)).toThrow()
    expect(() => validateLesson(lesson({ ...sandbox, initialHeight: Infinity }), evidence)).toThrow()
    expect(() => validateLesson(lesson({ ...sandbox, dataKind: "illustrative" }), evidence)).toThrow()
  })
  it("bounds saved control data and excludes prototype injection", () => {
    expect(validateWidgetState({ selected: 1, range: "0.5", checked: true })).toEqual({
      selected: 1,
      range: "0.5",
      checked: true,
    })
    for (const value of [
      null,
      [],
      { x: {} },
      { x: Infinity },
      { x: "x".repeat(501) },
      { constructor: "attack" },
      JSON.parse('{"__proto__":"attack"}'),
      Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`key${i}`, i])),
    ])
      expect(() => validateWidgetState(value)).toThrow()
  })
  it("provides the sandbox channels and all native routes to the existing provider schema", () => {
    const schema = JSON.stringify(studyOutputSchema("lesson"))
    for (const type of [
      "comparison",
      "concept-map",
      "evidence-map",
      "signal-experiment",
      "sandbox",
      "jsFunctions",
      "jsExpressions",
    ])
      expect(schema).toContain(type)
    expect(schema).not.toContain("apiKey")
  })
})
