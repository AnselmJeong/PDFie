import type { EvidenceRef, StudyGoal, StudyMessage, StudySnapshot } from "./contracts"

export const GOAL_CONTEXT_VERSION = "linked-passages-v1"

// Opening saved work is independent of whether it can be reused as a current answer.
export function savedGoalAnswer(snapshot: StudySnapshot, goal: StudyGoal): StudyMessage | undefined {
  return snapshot.messages
    .filter(
      (message) =>
        message.role === "assistant" &&
        message.task === "chat" &&
        message.goalId === goal.id &&
        message.state === "completed",
    )
    .at(-1)
}

export function savedGoalLesson(snapshot: StudySnapshot, goal: StudyGoal) {
  return snapshot.lessons.filter((lesson) => lesson.goalId === goal.id).at(-1)
}

export function goalEvidence(snapshot: StudySnapshot, goal: StudyGoal): EvidenceRef[] {
  const ids = new Set(goal.evidenceIds)
  const evidence = new Map<string, EvidenceRef>()
  for (const record of [...snapshot.messages, ...snapshot.lessons])
    for (const ref of record.evidence)
      if (ids.has(ref.id) && ref.documentHash === snapshot.documentHash) evidence.set(ref.id, ref)
  return [...evidence.values()]
}

export function reusableGoalAnswer(snapshot: StudySnapshot, goal: StudyGoal): StudyMessage | undefined {
  return snapshot.messages
    .filter(
      (message) =>
        message.role === "assistant" &&
        message.task === "chat" &&
        message.goalId === goal.id &&
        message.state === "completed" &&
        message.goalContext?.version === GOAL_CONTEXT_VERSION &&
        message.goalContext.question === goal.question &&
        message.goalContext.indexRevision === snapshot.index.revision,
    )
    .at(-1)
}
