import type { StudySnapshot } from "./contracts"

export interface LibraryDocument {
  documentHash: string
  title: string
  fileName: string
  sourceLinked: boolean
  sourceAvailable: boolean
  topic: string
  classification: TopicClassification | null
  collections: LibraryCollection[]
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

export interface TopicClassification {
  state: "queued" | "running" | "complete" | "manual" | "failed" | "insufficient"
  reason: string
  provider?: string
  model?: string
  pages?: number[]
  taxonomyRevision?: number
}
export interface LibraryQuery {
  query?: string
  filter?: "all" | "lessons" | "favorites" | "archived"
  sort?: "recent" | "title" | "added"
  topic?: string
  collectionId?: string
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

export interface LibraryCollection {
  id: string
  name: string
}
export interface LibraryFacets {
  total: number
  unassigned: number
  topics: { name: string; count: number }[]
  collections: (LibraryCollection & { count: number })[]
}
export interface LibraryPatch {
  title?: string
  favorite?: boolean
  archived?: boolean
  topic?: string
  collectionIds?: string[]
}

export interface LibraryImportStatus {
  batchId: string | null
  phase: "idle" | "scanning" | "importing" | "complete" | "cancelled"
  total: number
  added: number
  duplicates: number
  failed: number
  pending: number
  cancelled: number
  active: { name: string; page: number; total: number } | null
  notes: string[]
  issues: { id: string; name: string; error: string }[]
  classifications: { complete: number; pending: number; needsAttention: number }
}

export interface TopicChangePreview {
  source: string
  target: string
  count: number
  manualCount: number
  merge: boolean
  token: string
}
