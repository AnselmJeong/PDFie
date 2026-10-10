import type { StudyMessage, StudyOrigin, StudyTask } from "./contracts"

// Older records have no origin. Their task still identifies automatic study work.
export function studyOrigin(request: { task: StudyTask; origin?: StudyOrigin }): StudyOrigin {
  return request.task === "chat" ? (request.origin ?? "composer") : "action"
}

export function conversationMessages(messages: readonly StudyMessage[]): StudyMessage[] {
  return messages.filter((message) => studyOrigin(message) === "composer")
}

export function actionAnswers(messages: readonly StudyMessage[]): StudyMessage[] {
  return messages.filter(
    (message) =>
      studyOrigin(message) === "action" &&
      message.role === "assistant" &&
      (message.task === "chat" || message.task === "summary"),
  )
}
