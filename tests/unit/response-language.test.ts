import { expect, it } from "vitest"
import { studyOutputSchema } from "../../src/bun/study/output-schema"
import { assertKoreanResponse, expectsKorean } from "../../src/shared/study/response-language"

it("defaults to Korean for paper questions and supports explicit response-language requests", () => {
  for (const question of [
    "이 논문의 주장을 설명해 주세요.",
    "What is brain entropy?",
    "영어 논문의 Chinese group 결과를 한국어로 설명해줘.",
  ])
    expect(expectsKorean(question)).toBe(true)
  for (const question of [
    "영어로 답변해줘.",
    "중국어로 설명해주세요.",
    "Please answer in English.",
    "Translate the explanation into Japanese.",
  ])
    expect(expectsKorean(question)).toBe(false)
})
it("rejects the observed Chinese goals before they can replace existing goals", () => {
  const goals = {
    goals: [
      {
        question: "熵脑假说试图解释脑熵与哪些意识体验变化之间的关系？",
        prerequisites: "本提案仅基于所提供的部分摘录。",
        checkQuestion: "意识体验是什么？",
      },
    ],
  }
  expect(() => assertKoreanResponse("goals", goals, "학습 목표를 제안해주세요.")).toThrow(
    "저장하지 않았습니다",
  )
  expect(() => assertKoreanResponse("goals", goals, "중국어로 설명해주세요.")).not.toThrow()
})
it("rejects Chinese with a token Korean suffix but permits Korean with technical terms and quotations", () => {
  expect(() =>
    assertKoreanResponse(
      "chat",
      { blocks: [{ text: "脑熵与意识体验之间存在复杂关系。입니다." }] },
      "설명해줘",
    ),
  ).toThrow()
  expect(() =>
    assertKoreanResponse(
      "chat",
      {
        blocks: [
          {
            text: "뇌 엔트로피(brain entropy)는 의식 경험의 다양성과 관련됩니다. ‘意识’라는 표현의 번역은 문맥을 확인해야 합니다.",
          },
        ],
      },
      "설명해줘",
    ),
  ).not.toThrow()
  expect(() =>
    assertKoreanResponse(
      "chat",
      { blocks: [{ text: "Brain entropy describes signal diversity." }] },
      "설명해줘",
    ),
  ).toThrow()
})
it("checks learning explanations, questions and feedback while allowing numeric quiz options", () => {
  const lesson = {
    steps: [
      {
        type: "quiz",
        question: "표본은 몇 명인가요?",
        options: ["40", "400"],
        feedback: "원문에는 40명이라고 나옵니다.",
      },
    ],
  }
  expect(() => assertKoreanResponse("lesson", lesson, "학습 자료 만들어줘")).not.toThrow()
  lesson.steps[0]!.feedback = "原文说40人。"
  expect(() => assertKoreanResponse("lesson", lesson, "학습 자료 만들어줘")).toThrow()
})
it("constrains visible prose without adding Korean requirements to source IDs", () => {
  const schema = studyOutputSchema("goals") as {
    properties: {
      goals: { items: { properties: Record<string, { pattern?: string; items?: { pattern?: string } }> } }
    }
  }
  expect(schema.properties.goals.items.properties.question?.pattern).toBe("[가-힣]")
  expect(schema.properties.goals.items.properties.evidenceIds?.items?.pattern).toBeUndefined()
  expect(JSON.stringify(studyOutputSchema("chat", false))).not.toContain("가-힣")
})
