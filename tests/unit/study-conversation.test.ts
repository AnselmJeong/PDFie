import { describe, expect, it } from "vitest"
import { exportStudyMarkdown } from "../../src/bun/study/study-export"
import type { StudyMessage, StudySnapshot } from "../../src/shared/study/contracts"
import { actionAnswers, conversationMessages, studyOrigin } from "../../src/shared/study/conversation"

const message = (patch: Partial<StudyMessage>): StudyMessage => ({
  id: "message",
  role: "assistant",
  text: "직접 질문에 대한 답변",
  state: "completed",
  task: "chat",
  createdAt: "2026-10-10T00:00:00.000Z",
  model: "test-model",
  provider: "codex",
  scope: { type: "document" },
  blocks: [],
  evidence: [],
  coverage: "본문 준비",
  ...patch,
})

describe("conversation records", () => {
  it("hides both sides of previously saved automatic requests without changing the records", () => {
    const messages = [
      message({ id: "goal-user", task: "goals", role: "user" }),
      message({ id: "goal-answer", task: "goals" }),
      message({ id: "lesson-user", task: "lesson", role: "user" }),
      message({ id: "lesson-answer", task: "lesson" }),
      message({ id: "summary-user", task: "summary", role: "user" }),
      message({ id: "summary-answer", task: "summary" }),
      message({ id: "user", role: "user" }),
      message({ id: "answer" }),
    ]
    const saved = JSON.stringify(messages)
    expect(conversationMessages(messages).map((m) => m.id)).toEqual(["user", "answer"])
    expect(JSON.stringify(messages)).toBe(saved)
  })

  it("uses the input origin even when a button requests the same task and text as the user", () => {
    const typed = message({ id: "typed", role: "user", origin: "composer" })
    const clicked = message({ id: "clicked", role: "user", origin: "action" })
    expect(conversationMessages([clicked, typed])).toEqual([typed])
  })

  it.each(["running", "completed", "stopped", "failed", "interrupted"] as const)(
    "keeps %s direct conversations while hiding action records",
    (state) => {
      const typed = message({ origin: "composer", state })
      const clicked = message({ origin: "action", state })
      expect(conversationMessages([typed, clicked])).toEqual([typed])
    },
  )

  it.each(["goals", "lesson", "summary"] as const)(
    "always treats %s as a study action even if supplied a composer origin",
    (task) => expect(studyOrigin({ task, origin: "composer" })).toBe("action"),
  )

  it("keeps useful action answers accessible without automatic prompts or completion notices", () => {
    const summary = message({ task: "summary", text: "섹션 요약" })
    const explanation = message({ origin: "action", text: "목표 설명" })
    expect(
      actionAnswers([
        message({ task: "goals" }),
        message({ task: "lesson" }),
        message({ task: "summary", role: "user" }),
        message({ origin: "action", role: "user" }),
        message({ origin: "composer" }),
        summary,
        explanation,
      ]),
    ).toEqual([summary, explanation])
  })

  it("separates exported conversation and study answers while retaining source citations", () => {
    const study: StudySnapshot = {
      documentHash: "document",
      index: {
        revision: "revision",
        pageCount: 1,
        indexedPages: 1,
        failedPages: [],
        ocrPages: [],
        blockCount: 1,
      },
      sections: [],
      goals: [],
      lessons: [],
      attempts: [],
      progress: [],
      messages: [
        message({ task: "goals", role: "user", text: "INTERNAL_GOAL_PROMPT" }),
        message({ task: "goals", text: "GOAL_COMPLETION_NOTICE" }),
        message({ task: "lesson", text: "LESSON_COMPLETION_NOTICE" }),
        message({ role: "user", text: "DIRECT_QUESTION" }),
        message({ text: "DIRECT_ANSWER" }),
        message({ task: "summary", role: "user", text: "INTERNAL_SUMMARY_PROMPT" }),
        message({
          task: "summary",
          blocks: [{ text: "SOURCE_SUMMARY", kind: "document-claim", evidenceIds: ["ref"] }],
          evidence: [
            {
              id: "ref",
              documentHash: "document",
              revision: "revision",
              quote: "SOURCE_QUOTE",
              pageIndex: 0,
              rects: [],
              sectionTitle: "Section",
              precision: "page-only",
              quality: "usable",
            },
          ],
        }),
      ],
    }
    const exported = exportStudyMarkdown("Paper", study)
    const dialogue = exported.split("## 대화")[1]?.split("## 요약과 설명")[0]
    expect(dialogue).toContain("DIRECT_QUESTION")
    expect(dialogue).toContain("DIRECT_ANSWER")
    expect(dialogue).not.toContain("SOURCE_SUMMARY")
    expect(exported).toContain("SOURCE_SUMMARY")
    expect(exported).toContain("SOURCE_QUOTE")
    expect(exported).not.toMatch(/INTERNAL_|COMPLETION_NOTICE/)
  })
})
