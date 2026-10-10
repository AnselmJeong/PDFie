// Only the current user's question can override the app's Korean default.
// Paper excerpts, images and prior assistant messages never select the locale.
export function expectsKorean(question: string): boolean {
  const language = "English|Chinese|Japanese|French|German|Spanish|Italian|Portuguese|Russian|Arabic"
  const koreanNames = "영어|중국어|일본어|프랑스어|독일어|스페인어|이탈리아어|포르투갈어|러시아어|아랍어"
  return !new RegExp(
    `(?:${koreanNames})(?:로|로만)\\s*(?:답|응답|설명|작성|번역|말|써|해\\s*줘)|(?:answer|respond|reply|write|explain|translate|output)[^.!?\\n]{0,80}\\b(?:in|into)\\s+(?:${language})\\b`,
    "i",
  ).test(question)
}

export const KOREAN_RESPONSE_INSTRUCTION =
  "응답 언어: 한국어(ko-KR). 사용자는 다른 응답 언어를 요청하지 않았습니다. 모든 목표 질문, 사전 지식, 설명과 점검 피드백을 자연스러운 한국어 문장으로 작성하세요. 원문이나 이전 대화의 언어로 바꾸지 마세요. 고유명사와 전문 용어는 필요할 때 영어로 병기할 수 있습니다."

export function assertKoreanResponse(task: string, value: Record<string, unknown>, question: string) {
  if (!expectsKorean(question)) return
  const fields: unknown[] = []
  if (task === "goals" && Array.isArray(value.goals)) {
    for (const goal of value.goals) fields.push(goal.question, goal.prerequisites, goal.checkQuestion)
  } else if (task === "lesson" && Array.isArray(value.steps)) {
    fields.push(
      value.title,
      ...(Array.isArray(value.objectives) ? value.objectives : []),
      ...(Array.isArray(value.prerequisites) ? value.prerequisites : []),
    )
    for (const step of value.steps) {
      if (step.text) fields.push(step.text)
      if (step.question) fields.push(step.question)
      if (step.feedback) fields.push(step.feedback)
      if (["comparison", "concept-map", "evidence-map", "signal-experiment", "sandbox"].includes(step.type))
        fields.push(step.title)
      if (step.type === "comparison") {
        fields.push(...step.concepts)
        for (const aspect of step.aspects) fields.push(aspect.label, ...aspect.values)
      }
      if (step.type === "concept-map") {
        for (const node of step.nodes) fields.push(node.label, node.detail)
        for (const edge of step.edges) fields.push(edge.label)
      }
      if (step.type === "evidence-map")
        for (const claim of step.claims)
          fields.push(claim.claim, claim.support, claim.limitation, claim.nextCheck)
    }
  } else if (Array.isArray(value.blocks)) {
    for (const block of value.blocks) fields.push(block.text)
  }
  for (const field of fields) {
    if (typeof field !== "string") continue // Domain validation owns shape/length.
    const hangul = field.match(/[\uac00-\ud7a3]/g)?.length ?? 0
    const other = field.match(/[\u3400-\u9fff\u3040-\u30ff]/g)?.length ?? 0
    if (hangul === 0 || other > hangul)
      throw new Error("한국어 응답을 확인하지 못해 결과를 저장하지 않았습니다. 다시 생성해 주세요.")
  }
}
