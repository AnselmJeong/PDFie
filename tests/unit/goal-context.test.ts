import { describe, expect, it } from "vitest"
import { resolveEvidenceBlocks, retrieve, retrieveGoal } from "../../src/bun/retrieval/context"
import type {
  EvidenceRef,
  StudyBlock,
  StudyGoal,
  StudyMessage,
  StudySection,
  StudySnapshot,
} from "../../src/shared/study/contracts"
import { GOAL_CONTEXT_VERSION, goalEvidence, reusableGoalAnswer } from "../../src/shared/study/goal-context"

const block = (
  id: string,
  sectionId: string,
  role: StudyBlock["role"],
  text: string,
  pageIndex = 0,
): StudyBlock => ({
  id,
  sectionId,
  role,
  rawText: text,
  normalizedText: text,
  pageIndex,
  documentHash: "paper",
  revision: "new",
  rects: [],
  quality: "usable",
  order: 0,
})
const section = (id: string, title: string): StudySection => ({
  id,
  title,
  startBlockId: `${id}-heading`,
  endBlockId: `${id}-body`,
  pageStart: 1,
  pageEnd: 2,
  source: "heading",
  userEdited: false,
})
const ref = (patch: Partial<EvidenceRef> = {}): EvidenceRef => ({
  id: "old-paragraph",
  documentHash: "paper",
  revision: "old",
  quote: "Single-dimensional measures rely on responsiveness to a controlled perturbation.",
  pageIndex: 0,
  rects: [],
  sectionTitle: "consciousness",
  precision: "paragraph",
  quality: "usable",
  ...patch,
})
const goal: StudyGoal = {
  id: "goal",
  question: "의식을 단일 차원으로 평가하는 접근과 다차원 접근은 어떻게 다른가?",
  prerequisites: "각성과 경험의 구분",
  sectionId: "old-section",
  evidenceIds: ["old-paragraph"],
  difficulty: "intermediate",
  checkQuestion: "각성도와 경험의 폭은 같은가?",
  userEdited: true,
  explored: true,
  checked: false,
  revision: "old",
}
const message = (patch: Partial<StudyMessage> = {}): StudyMessage => ({
  id: "explanation",
  role: "assistant",
  task: "chat",
  origin: "action",
  state: "completed",
  text: "설명",
  blocks: [],
  evidence: [],
  coverage: "부분 발췌",
  scope: { type: "document" },
  createdAt: "2026-10-10T00:00:00Z",
  model: "test",
  provider: "codex",
  goalId: goal.id,
  ...patch,
})
const snapshot = (messages: StudyMessage[]): StudySnapshot => ({
  documentHash: "paper",
  index: { revision: "new", pageCount: 2, indexedPages: 2, blockCount: 4, failedPages: [], ocrPages: [] },
  sections: [],
  goals: [goal],
  messages,
  lessons: [],
  progress: [],
  attempts: [],
})

describe("goal source context", () => {
  it("recovers old citations inside merged paragraphs and includes the following body across a page break", () => {
    const sections = [
      section("current", "Single versus multi-dimensional approaches to consciousness"),
      section("unrelated", "Other topic"),
    ]
    const blocks = [
      block("current-heading", "current", "heading", sections[0]?.title ?? ""),
      block(
        "new-paragraph",
        "current",
        "paragraph",
        `An introduction. ${ref().quote} Other approaches distinguish wakefulness and awareness.`,
      ),
      block(
        "continuation",
        "current",
        "paragraph",
        "Multiple dimensions exist. The hypothesis focuses on felt breadth of subjective experience, rather than arousal.",
        1,
      ),
      block("unrelated-body", "unrelated", "paragraph", "Unrelated material."),
    ]
    for (const task of ["chat", "lesson"]) {
      const result = retrieveGoal(blocks, sections, goal, [ref()], goal.question, task)
      expect(result.blocks.map((b) => b.id)).toEqual(["current-heading", "new-paragraph", "continuation"])
      expect(result.eligibleCount).toBe(3)
      expect(goal.sectionId).toBe("old-section")
    }
  })

  it("uses page geometry when a quoted passage splits and excludes the other column or document", () => {
    const passage = { x: 10, y: 100, width: 200, height: 20 }
    const blocks = [
      {
        ...block("start", "S", "paragraph", "Beginning of the quoted passage."),
        rects: [{ ...passage, height: 10 }],
      },
      {
        ...block("end", "S", "paragraph", "Continuation of that passage."),
        rects: [{ ...passage, y: 110, height: 10 }],
      },
      { ...block("other-column", "T", "paragraph", "Different text."), rects: [{ ...passage, x: 300 }] },
      {
        ...block("other-document", "T", "paragraph", "Different document."),
        documentHash: "other",
        rects: [passage],
      },
    ]
    expect(
      resolveEvidenceBlocks(blocks, [
        ref({ quote: "Saved differently extracted text", rects: [passage] }),
      ]).map((b) => b.id),
    ).toEqual(["start", "end"])
    expect(resolveEvidenceBlocks(blocks, [ref({ precision: "region", rects: [passage] })])).toEqual([])
  })

  it("includes all linked sections instead of selecting only the first citation", () => {
    const sections = [section("A", "Abstract"), section("B", "Dimensions"), section("C", "Unrelated")]
    const blocks = sections.flatMap((s) => [
      block(`${s.id}-heading`, s.id, "heading", s.title),
      block(`${s.id}-body`, s.id, "paragraph", `Actual source body for ${s.title}.`),
    ])
    const evidence = [ref({ id: "A-body" }), ref({ id: "B-body" })]
    const result = retrieveGoal(
      blocks,
      sections,
      { ...goal, sectionId: "A" },
      evidence,
      goal.question,
      "chat",
    )
    expect(result.blocks.map((b) => b.id)).toEqual(["A-heading", "A-body", "B-heading", "B-body"])
  })

  it("prioritizes linked passages and their neighbors over an unrelated earlier section under a tight packet limit", () => {
    const sections = [section("A", "Earlier material"), section("B", "Dimensions")]
    const blocks = Array.from({ length: 30 }, (_, i) =>
      block(`A-${i}`, "A", "paragraph", `Earlier unrelated paragraph ${i}.`),
    )
    blocks.push(
      block("B-heading", "B", "heading", "Dimensions"),
      block("B-anchor", "B", "paragraph", ref().quote),
      block("B-following", "B", "paragraph", "The adjacent body provides the conceptual distinction."),
    )
    const found = retrieveGoal(
      blocks,
      sections,
      { ...goal, sectionId: "A" },
      [ref({ id: "B-anchor" })],
      goal.question,
      "chat",
    ).blocks
    expect(found).toHaveLength(18)
    expect(found.map((b) => b.id)).toContain("B-following")
  })

  it("sends body passages for Korean questions with no English keyword overlap, instead of 18 headings", () => {
    const sections = Array.from({ length: 24 }, (_, i) => section(`S${i}`, `Topic ${i}`))
    const blocks = sections.flatMap((s) => [
      block(`${s.id}-heading`, s.id, "heading", s.title),
      block(`${s.id}-body`, s.id, "paragraph", `Body discussion of ${s.title}.`),
    ])
    const result = retrieve(blocks, sections, { type: "document" }, goal.question, "chat")
    expect(result.blocks).toHaveLength(18)
    expect(result.blocks.every((b) => b.role === "paragraph")).toBe(true)
    expect(new Set(result.blocks.map((b) => b.sectionId)).size).toBe(18)
  })

  it("includes a matched heading's body and keeps explicit section and selection limits", () => {
    const sections = [section("S", "Unique heading"), section("T", "Unrelated")]
    const heading = block("S-heading", "S", "heading", "Unique heading")
    const body = block("S-body", "S", "paragraph", "The actual explanation without those title words.")
    const other = block("T-body", "T", "paragraph", "Unrelated evidence.")
    expect(
      retrieve(
        [heading, body, other],
        sections,
        { type: "section", sectionId: "S" },
        "Unique heading",
        "chat",
      ).blocks.map((b) => b.id),
    ).toEqual([heading.id, body.id])
    expect(retrieve([heading], sections, { type: "selection" }, "Unique heading", "chat").blocks).toEqual([
      heading,
    ])
    expect(() =>
      retrieve([heading, body], sections, { type: "section", sectionId: "missing" }, "", "chat"),
    ).toThrow()
  })
})

describe("saved goal explanation reuse", () => {
  it("preserves legacy records but regenerates explanations made before passage retrieval or after edits/reindexing", () => {
    const context = { version: GOAL_CONTEXT_VERSION, question: goal.question, indexRevision: "new" }
    const old = message()
    const current = message({ id: "new", goalContext: context })
    const state = snapshot([old, current])
    expect(reusableGoalAnswer(snapshot([old]), goal)).toBeUndefined()
    expect(reusableGoalAnswer(state, goal)).toBe(current)
    expect(reusableGoalAnswer(state, { ...goal, question: "새 질문" })).toBeUndefined()
    expect(
      reusableGoalAnswer({ ...state, index: { ...state.index, revision: "next" } }, goal),
    ).toBeUndefined()
    expect(state.messages[0]).toBe(old)
  })

  it("recovers only the goal's citations from its own document", () => {
    const refs = [ref(), ref({ id: "unrelated" }), ref({ id: "old-paragraph", documentHash: "other" })]
    expect(goalEvidence(snapshot([message({ evidence: refs })]), goal)).toEqual([refs[0]])
  })
})
