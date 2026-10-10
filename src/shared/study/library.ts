import type { StudySnapshot } from "./contracts"

export interface LibraryDocument {
  documentHash: string
  title: string
  fileName: string
  sourceLinked: boolean
  sourceAvailable: boolean
  favorite: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  pageCount: number
  lessonCount: number
  completedLessonCount: number
  messageCount: number
  goalCount: number
  checkedGoalCount: number
}
export interface LibraryQuery {
  query?: string
  filter?: "all" | "lessons" | "favorites" | "archived"
  sort?: "recent" | "title"
  offset?: number
}
export interface LibraryPage {
  items: LibraryDocument[]
  total: number
}
export interface LibraryDetail {
  document: LibraryDocument
  snapshot: StudySnapshot
}
