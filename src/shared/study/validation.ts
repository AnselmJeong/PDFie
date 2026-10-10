import type { AnswerBlock, EvidenceRef, LessonStep, StudyGoal } from "./contracts"

export class SourceReferenceError extends Error {
  constructor(
    readonly kind: "evidence" | "section",
    readonly ids: string[],
  ) {
    super(
      kind === "evidence"
        ? "원문에서 확인되지 않은 근거 ID가 포함되어 있습니다."
        : "없는 섹션을 참조한 목표입니다.",
    )
    this.name = "SourceReferenceError"
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("응답 형식이 올바르지 않습니다.")
  return value as Record<string, unknown>
}
function string(value: unknown, max = 6000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("응답의 텍스트 길이 또는 형식이 올바르지 않습니다.")
  return value.trim()
}
function strings(value: unknown, max = 12): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("응답의 목록이 올바르지 않습니다.")
  return value.map((item) => string(item, 1200))
}
function codeChannel(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("맞춤 화면의 크기 또는 형식이 올바르지 않습니다.")
  return value
}
export function parseModelJson(text: string): Record<string, unknown> {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  return record(JSON.parse(stripped))
}
function refs(value: unknown, evidence: EvidenceRef[]): string[] {
  const ids = strings(value)
  const unknown = ids.filter((id) => !evidence.some((ref) => ref.id === id))
  if (unknown.length) throw new SourceReferenceError("evidence", [...new Set(unknown)])
  return [...new Set(ids)]
}
export function validateAnswer(value: unknown, evidence: EvidenceRef[]): AnswerBlock[] {
  const blocks = record(value).blocks
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 32)
    throw new Error("설명 문단이 올바르지 않습니다.")
  return blocks.map((item) => {
    const block = record(item)
    const kind = block.kind
    if (!["document-claim", "inference", "background", "illustration", "unknown"].includes(String(kind)))
      throw new Error("설명의 근거 유형이 올바르지 않습니다.")
    const evidenceIds = refs(block.evidenceIds, evidence)
    return {
      text: string(block.text),
      kind: kind === "document-claim" && !evidenceIds.length ? "unknown" : (kind as AnswerBlock["kind"]),
      evidenceIds,
    }
  })
}
export function validateGoals(
  value: unknown,
  evidence: EvidenceRef[],
  sectionIds: string[],
  revision: string,
): StudyGoal[] {
  const goals = record(value).goals
  if (!Array.isArray(goals) || !goals.length || goals.length > 16)
    throw new Error("학습 목표 목록이 올바르지 않습니다.")
  return goals.map((item) => {
    const goal = record(item)
    if (goal.sectionId !== null && !sectionIds.includes(String(goal.sectionId)))
      throw new SourceReferenceError("section", [String(goal.sectionId)])
    if (!["introductory", "intermediate", "advanced"].includes(String(goal.difficulty)))
      throw new Error("목표 난이도가 올바르지 않습니다.")
    const evidenceIds = refs(goal.evidenceIds, evidence)
    if (!evidenceIds.length) throw new Error("학습 목표에 원문 근거가 필요합니다.")
    return {
      id: crypto.randomUUID(),
      question: string(goal.question, 800),
      prerequisites: string(goal.prerequisites, 1200),
      sectionId: goal.sectionId as string | null,
      evidenceIds,
      difficulty: goal.difficulty as StudyGoal["difficulty"],
      checkQuestion: string(goal.checkQuestion, 800),
      userEdited: false,
      explored: false,
      checked: false,
      revision,
    }
  })
}
export function validateLesson(
  value: unknown,
  evidence: EvidenceRef[],
): {
  title: string
  objectives: string[]
  prerequisites: string[]
  steps: LessonStep[]
  dataKind: "paper" | "illustrative"
} {
  const lesson = record(value)
  if (lesson.schemaVersion !== 1) throw new Error("지원하지 않는 학습 형식입니다.")
  if (!Array.isArray(lesson.steps) || lesson.steps.length < 3 || lesson.steps.length > 12)
    throw new Error("학습에는 3–12단계가 필요합니다.")
  let interaction = false
  let quiz = false
  const steps: LessonStep[] = lesson.steps.map((item) => {
    const step = record(item)
    const common = { title: string(step.title, 200), evidenceIds: refs(step.evidenceIds, evidence) }
    if (!common.evidenceIds.length) throw new Error("학습 단계마다 원문 근거가 필요합니다.")
    switch (step.type) {
      case "explanation":
        return { ...common, type: "explanation", text: string(step.text) }
      case "diagram":
        return { ...common, type: "diagram", nodes: strings(step.nodes, 6), text: string(step.text) }
      case "comparison": {
        interaction = true
        const concepts = strings(step.concepts, 4)
        if (
          concepts.length < 2 ||
          new Set(concepts).size !== concepts.length ||
          !Array.isArray(step.aspects) ||
          step.aspects.length < 2 ||
          step.aspects.length > 8
        )
          throw new Error("비교할 개념과 기준이 올바르지 않습니다.")
        const aspects = step.aspects.map((item) => {
          const aspect = record(item)
          const values = strings(aspect.values, 4)
          const evidenceIds = refs(aspect.evidenceIds, evidence)
          if (values.length !== concepts.length || !evidenceIds.length)
            throw new Error("비교 항목마다 개념별 설명과 원문 근거가 필요합니다.")
          return { label: string(aspect.label, 120), values, evidenceIds }
        })
        return { ...common, type: "comparison", text: string(step.text), concepts, aspects }
      }
      case "concept-map": {
        interaction = true
        if (
          !Array.isArray(step.nodes) ||
          step.nodes.length < 2 ||
          step.nodes.length > 8 ||
          !Array.isArray(step.edges) ||
          !step.edges.length ||
          step.edges.length > 12
        )
          throw new Error("개념 관계도의 크기가 올바르지 않습니다.")
        const nodes = step.nodes.map((item) => {
          const node = record(item)
          const evidenceIds = refs(node.evidenceIds, evidence)
          if (!evidenceIds.length) throw new Error("개념마다 원문 근거가 필요합니다.")
          return { label: string(node.label, 120), detail: string(node.detail, 1600), evidenceIds }
        })
        const edges = step.edges.map((item) => {
          const edge = record(item)
          const evidenceIds = refs(edge.evidenceIds, evidence)
          if (
            ![edge.from, edge.to].every(
              (n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < nodes.length,
            ) ||
            edge.from === edge.to ||
            !evidenceIds.length
          )
            throw new Error("개념 연결의 위치와 근거가 올바르지 않습니다.")
          return { from: Number(edge.from), to: Number(edge.to), label: string(edge.label, 200), evidenceIds }
        })
        return { ...common, type: "concept-map", text: string(step.text), nodes, edges }
      }
      case "evidence-map": {
        interaction = true
        if (!Array.isArray(step.claims) || !step.claims.length || step.claims.length > 6)
          throw new Error("근거 지도에 확인할 주장이 필요합니다.")
        const claims = step.claims.map((item) => {
          const claim = record(item)
          const evidenceIds = refs(claim.evidenceIds, evidence)
          if (!evidenceIds.length) throw new Error("주장마다 원문 근거가 필요합니다.")
          return {
            claim: string(claim.claim, 600),
            support: string(claim.support, 1600),
            limitation: string(claim.limitation, 1600),
            nextCheck: string(claim.nextCheck, 1200),
            evidenceIds,
          }
        })
        return { ...common, type: "evidence-map", text: string(step.text), claims }
      }
      case "signal-experiment": {
        interaction = true
        if (
          lesson.dataKind !== "illustrative" ||
          typeof step.initial !== "number" ||
          !Number.isFinite(step.initial) ||
          step.initial < 0 ||
          step.initial > 1
        )
          throw new Error("신호 실험은 0–1 범위의 교육용 가상값을 사용해야 합니다.")
        return { ...common, type: "signal-experiment", text: string(step.text), initial: step.initial }
      }
      case "sandbox": {
        interaction = true
        const html = codeChannel(step.html, 30000)
        const css = codeChannel(step.css, 10000)
        const jsFunctions = codeChannel(step.jsFunctions, 18000)
        if (!Array.isArray(step.jsExpressions) || step.jsExpressions.length > 12)
          throw new Error("맞춤 화면의 초기화 순서가 올바르지 않습니다.")
        const jsExpressions = step.jsExpressions.map((item) => codeChannel(item, 4000))
        if (
          !html.trim() ||
          /<\/?(?:script|iframe|frame|object|embed|meta|base|link|form|html|head|body)\b/i.test(html) ||
          /<\/style/i.test(css) ||
          /\b(?:src|href|action)\s*=\s*["']?\s*(?:https?:|\/\/|javascript:|views:|file:)/i.test(html)
        )
          throw new Error("맞춤 화면에는 외부 문서나 실행 태그를 넣을 수 없습니다.")
        if (
          typeof step.initialHeight !== "number" ||
          !Number.isFinite(step.initialHeight) ||
          step.initialHeight < 180 ||
          step.initialHeight > 1000 ||
          !["paper", "illustrative"].includes(String(step.dataKind)) ||
          (step.dataKind === "illustrative" && lesson.dataKind !== "illustrative")
        )
          throw new Error("맞춤 화면의 높이와 자료 유형을 확인하세요.")
        return {
          ...common,
          type: "sandbox",
          text: string(step.text),
          initialHeight: step.initialHeight,
          html,
          css,
          jsFunctions,
          jsExpressions,
          dataKind: step.dataKind as "paper" | "illustrative",
        }
      }
      case "prediction":
      case "quiz": {
        interaction = true
        quiz ||= step.type === "quiz"
        const options = strings(step.options, 5)
        if (
          options.length < 2 ||
          !Number.isInteger(step.correctIndex) ||
          Number(step.correctIndex) < 0 ||
          Number(step.correctIndex) >= options.length
        )
          throw new Error("점검의 선택지와 정답이 올바르지 않습니다.")
        return {
          ...common,
          type: step.type,
          question: string(step.question, 1200),
          options,
          correctIndex: Number(step.correctIndex),
          feedback: string(step.feedback, 3000),
        }
      }
      case "experiment": {
        interaction = true
        if (
          lesson.dataKind !== "illustrative" ||
          !["linear", "sampling-error"].includes(String(step.formula))
        )
          throw new Error("실험은 검증된 교육용 계산만 사용할 수 있습니다.")
        const { min, max, initial, step: increment } = step
        if (
          ![min, max, initial, increment].every((n) => typeof n === "number" && Number.isFinite(n)) ||
          Number(min) < 0.1 ||
          Number(max) > 10000 ||
          Number(max) <= Number(min) ||
          Number(increment) <= 0 ||
          Number(increment) > Number(max) - Number(min) ||
          Number(initial) < Number(min) ||
          Number(initial) > Number(max)
        )
          throw new Error("실험 변수 범위가 올바르지 않습니다.")
        return {
          ...common,
          type: "experiment",
          formula: step.formula as "linear" | "sampling-error",
          min: Number(min),
          max: Number(max),
          step: Number(increment),
          initial: Number(initial),
          unit: string(step.unit, 80),
          text: string(step.text),
        }
      }
      default:
        throw new Error("허용되지 않은 학습 구성요소입니다.")
    }
  })
  if (!interaction || !quiz) throw new Error("학습에는 예측 또는 조작과 이해 점검이 필요합니다.")
  if (lesson.dataKind !== "paper" && lesson.dataKind !== "illustrative")
    throw new Error("학습 자료 유형이 올바르지 않습니다.")
  return {
    title: string(lesson.title, 200),
    objectives: strings(lesson.objectives, 6),
    prerequisites: strings(lesson.prerequisites, 8),
    steps,
    dataKind: lesson.dataKind,
  }
}
export function evidenceMatches(
  ref: EvidenceRef,
  block: { id: string; documentHash: string; revision: string; rawText: string },
): boolean {
  return (
    ref.id === block.id &&
    ref.documentHash === block.documentHash &&
    ref.revision === block.revision &&
    ref.quote === block.rawText
  )
}
export function experimentValue(formula: "linear" | "sampling-error", input: number): number {
  return formula === "linear" ? 2 * input : 1 / Math.sqrt(input)
}
