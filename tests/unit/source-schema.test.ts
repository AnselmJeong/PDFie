import { describe, expect, it } from "vitest"
import { studyOutputSchema } from "../../src/bun/study/output-schema"
import type { EvidenceRef } from "../../src/shared/study/contracts"
import { SourceReferenceError, validateGoals } from "../../src/shared/study/validation"

const id = "E-1-26-5ac1b12b897d2e1e"
const sources = { evidenceIds: [id], sectionIds: ["S1"] }
const evidence: EvidenceRef[] = [
  {
    id,
    documentHash: "doc",
    revision: "r1",
    pageIndex: 0,
    quote: "Broad exploration avoids learning traps.",
    rects: [],
    sectionTitle: "Exploration",
    precision: "paragraph",
    quality: "usable",
  },
]

describe("request-specific source choices", () => {
  it("limits goal evidence and nullable section IDs to the request", () => {
    expect(studyOutputSchema("goals", true, sources)).toMatchObject({
      $defs: { evidenceId: { type: "string", enum: [id] } },
      properties: {
        goals: {
          items: {
            properties: {
              evidenceIds: { minItems: 1, items: { $ref: "#/$defs/evidenceId" } },
              sectionId: { type: ["string", "null"], enum: ["S1", null] },
            },
          },
        },
      },
    })
  })
  it("shares source choices across all nested lesson components", () => {
    const schema = studyOutputSchema("lesson", true, sources)
    const serialized = JSON.stringify(schema)
    expect(serialized.match(new RegExp(id, "g"))).toHaveLength(1)
    expect(serialized.match(/#\/\$defs\/evidenceId/g)?.length).toBeGreaterThan(10)
    for (const task of ["chat", "summary"])
      expect(studyOutputSchema(task, true, sources)).toMatchObject({
        $defs: { evidenceId: { enum: [id] } },
        properties: {
          blocks: { items: { properties: { evidenceIds: { items: { $ref: "#/$defs/evidenceId" } } } } },
        },
      })
  })
  it("rejects the actual appended-character failure without guessing a replacement", () => {
    const goal = {
      question: "왜 탐색하나요?",
      prerequisites: "탐색의 정의를 압니다.",
      sectionId: "S1",
      evidenceIds: [`${id}4`],
      difficulty: "intermediate",
      checkQuestion: "학습 함정은 무엇인가요?",
    }
    try {
      validateGoals({ goals: [goal] }, evidence, ["S1"], "r1")
      throw new Error("Invalid ID was accepted")
    } catch (error) {
      expect(error).toBeInstanceOf(SourceReferenceError)
      expect(error).toMatchObject({ kind: "evidence", ids: [`${id}4`] })
    }
    expect(
      validateGoals({ goals: [{ ...goal, evidenceIds: [id] }] }, evidence, ["S1"], "r1")[0]?.evidenceIds,
    ).toEqual([id])
  })
  it("keeps empty source packets restrictive and nullable sections valid", () => {
    expect(studyOutputSchema("goals", true, { evidenceIds: [], sectionIds: [] })).toMatchObject({
      properties: {
        goals: {
          items: {
            properties: {
              evidenceIds: { maxItems: 0 },
              sectionId: { enum: [null] },
            },
          },
        },
      },
    })
  })
})
