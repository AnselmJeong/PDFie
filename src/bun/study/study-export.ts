import type { StudyMessage, StudySnapshot } from "../../shared/study/contracts"
import { actionAnswers, conversationMessages } from "../../shared/study/conversation"
export function exportStudyMarkdown(title: string, study: StudySnapshot): string {
  const lines = [
    `# ${title} — 학습 기록`,
    `\n문서 SHA-256: ${study.documentHash}`,
    `색인: ${study.index.revision}`,
    "\n## 학습 목표",
  ]
  for (const goal of study.goals)
    lines.push(`\n- [${goal.checked ? "x" : " "}] ${goal.question} (${goal.explored ? "탐색함" : "미탐색"})`)
  const appendMessage = (message: StudyMessage) => {
    lines.push(
      `\n### ${message.role === "user" ? "질문" : "설명"} · ${message.state}`,
      ...(!message.blocks.length ? [`\n${message.text || message.error || "생성 중단"}`] : []),
      `\n${message.coverage}`,
      `모델: ${message.provider} / ${message.model}`,
    )
    for (const block of message.blocks)
      lines.push(`\n[${block.kind}] ${block.text} ${block.evidenceIds.map((id) => `[${id}]`).join(" ")}`)
    if (message.draftText)
      lines.push(`\n미완성 응답 (근거 검증 전):\n> ${message.draftText.replace(/\n/g, "\n> ")}`)
    for (const ref of message.evidence.filter((ref) =>
      message.blocks.some((b) => b.evidenceIds.includes(ref.id)),
    ))
      lines.push(
        `\n[${ref.id}] PDF p. ${ref.pageIndex + 1} · ${ref.sectionTitle}\n> ${ref.quote.replace(/\n/g, "\n> ")}`,
      )
  }
  lines.push("\n## 대화")
  for (const message of conversationMessages(study.messages)) appendMessage(message)
  const answers = actionAnswers(study.messages)
  if (answers.length) {
    lines.push("\n## 요약과 설명")
    for (const message of answers) appendMessage(message)
  }
  lines.push("\n## 학습과 이해 점검")
  for (const lesson of study.lessons) {
    lines.push(`\n### ${lesson.title}`, `\n${lesson.coverage}`)
    lines.push(
      `\n학습 목표: ${lesson.objectives.join(" · ")}`,
      `선수 개념: ${lesson.prerequisites.join(" · ")}`,
      `모델: ${lesson.provider} / ${lesson.model}`,
    )
    const progress = study.progress.find((p) => p.lessonId === lesson.id)
    if (progress)
      lines.push(
        `\n학습 위치: ${progress.stepIndex + 1}/${lesson.steps.length}${progress.completedAt ? ` · 수업 마침: ${progress.completedAt}` : ""}`,
      )
    for (const [index, step] of lesson.steps.entries()) {
      lines.push(`\n#### ${index + 1}. ${step.title}`, `\n${"text" in step ? step.text : step.question}`)
      if (step.type === "diagram") lines.push(...step.nodes.map((node, i) => `${i + 1}. ${node}`))
      if (step.type === "comparison")
        for (const aspect of step.aspects)
          lines.push(
            `\n**${aspect.label}**`,
            ...aspect.values.map((value, i) => `- ${step.concepts[i]}: ${value}`),
            `근거: ${aspect.evidenceIds.map((id) => `[${id}]`).join(" ")}`,
          )
      if (step.type === "concept-map") {
        for (const node of step.nodes)
          lines.push(`\n- ${node.label}: ${node.detail} ${node.evidenceIds.map((id) => `[${id}]`).join(" ")}`)
        for (const edge of step.edges)
          lines.push(
            `- ${step.nodes[edge.from]?.label} → ${edge.label} → ${step.nodes[edge.to]?.label} ${edge.evidenceIds.map((id) => `[${id}]`).join(" ")}`,
          )
      }
      if (step.type === "evidence-map")
        for (const claim of step.claims)
          lines.push(
            `\n**${claim.claim}**`,
            `- 지지: ${claim.support}`,
            `- 한계: ${claim.limitation}`,
            `- 추가 검증 제안: ${claim.nextCheck}`,
            `근거: ${claim.evidenceIds.map((id) => `[${id}]`).join(" ")}`,
          )
      if (step.type === "signal-experiment")
        lines.push(
          `\n교육용 이진 가상 신호 · 무작위 치환 비율: ${progress?.parameters[String(index)] ?? step.initial}. 단일 비트 엔트로피와 전환 비율은 신경 복잡성 또는 임상 지표가 아닙니다.`,
        )
      if (step.type === "sandbox")
        lines.push(
          `\n맞춤 상호작용 화면 (${step.dataKind === "illustrative" ? "교육용 가상 데이터" : "원문 기반"}) · 학습 서재에서 다시 열 수 있습니다.`,
          `저장한 조작: ${JSON.stringify(progress?.widgetStates?.[String(index)] ?? {})}`,
        )
      if (step.type === "quiz" || step.type === "prediction") {
        lines.push(...step.options.map((option, i) => `${i + 1}. ${option}`))
        lines.push(`\n정답: ${step.correctIndex + 1} · ${step.feedback}`)
      }
      if (step.type === "experiment")
        lines.push(
          `\n교육용 가상값 · 공식: ${step.formula} · 범위: ${step.min}–${step.max} ${step.unit} · 저장한 입력: ${progress?.parameters[String(index)] ?? step.initial}`,
        )
      const nestedIds =
        step.type === "comparison"
          ? step.aspects.flatMap((a) => a.evidenceIds)
          : step.type === "concept-map"
            ? [...step.nodes, ...step.edges].flatMap((a) => a.evidenceIds)
            : step.type === "evidence-map"
              ? step.claims.flatMap((a) => a.evidenceIds)
              : []
      for (const id of new Set([...step.evidenceIds, ...nestedIds])) {
        const ref = lesson.evidence.find((r) => r.id === id)
        if (ref)
          lines.push(
            `\n[${ref.id}] PDF p. ${ref.pageIndex + 1} · ${ref.sectionTitle}\n> ${ref.quote.replace(/\n/g, "\n> ")}`,
          )
      }
    }
    for (const attempt of study.attempts.filter((a) => a.lessonId === lesson.id))
      lines.push(
        `\n- ${attempt.response} → ${attempt.correct ? "정답" : "다시 점검"}${attempt.revealed ? " (정답 열람)" : ""}: ${attempt.feedback}`,
      )
  }
  return `${lines.join("\n")}\n`
}
