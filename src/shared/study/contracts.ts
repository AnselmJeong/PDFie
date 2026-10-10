import type { PdfOutlineNode, PdfRect, PdfSelection } from "../pdf/domain"
import type { IntelligentLessonStep, WidgetState } from "./intelligent-ui"

export const INDEX_VERSION = "native-structure-v4"
export const MAX_PAGE_ANALYSIS_BYTES = 4_000_000
export const MAX_PAGE_BLOCKS = 10_000
export const analysisByteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
export type ProviderId = "ollama-cloud" | "codex"
export interface ModelInfo {
  id: string
  label: string
  vision: boolean
  isDefault?: boolean
}
/** Typography of a block, kept so headings can be judged against the whole document. */
export interface BlockStyle {
  /** Font size of the first line in points, or its visible glyph height when the PDF reports none. */
  size: number
  /** Share (0–1) of characters set in a bold, colored or italic face. */
  bold: number
  colored: number
  italic: number
  /** Font name and color of the first line. */
  font: string
  /** First-line position as a share of the page height and width. */
  top: number
  left: number
}
export interface StudyBlock {
  id: string
  documentHash: string
  revision: string
  pageIndex: number
  rawText: string
  normalizedText: string
  rects: PdfRect[]
  role: "paragraph" | "heading" | "caption" | "reference"
  quality: "usable" | "uncertain"
  order: number
  sectionId: string
  style?: BlockStyle
}
export interface PageAnalysis {
  pageIndex: number
  width: number
  height: number
  status: "ready" | "needs-ocr" | "failed"
  blocks: StudyBlock[]
  error?: string
}
export interface StudySection {
  id: string
  title: string
  startBlockId: string
  endBlockId: string
  pageStart: number
  pageEnd: number
  source: "bookmark" | "heading" | "page" | "user"
  userEdited: boolean
  /** 1 for top-level sections; nested subsections are deeper. */
  level: number
  parentId: string | null
  /** Front matter, study body, or back matter such as references and declarations. */
  kind: SectionKind
}
export type SectionKind = "front" | "body" | "back"
export interface IndexStatus {
  revision: string
  pageCount: number
  indexedPages: number
  failedPages: number[]
  ocrPages: number[]
  blockCount: number
  failedPageReasons?: Array<{ page: number; message: string }>
}
export interface EvidenceRef {
  id: string
  documentHash: string
  revision: string
  quote: string
  pageIndex: number
  rects: PdfRect[]
  sectionTitle: string
  precision: "paragraph" | "region" | "page-only"
  quality: "usable" | "uncertain"
}
export type ClaimKind = "document-claim" | "inference" | "background" | "illustration" | "unknown"
export interface AnswerBlock {
  text: string
  kind: ClaimKind
  evidenceIds: string[]
}
export interface StudyMessage {
  id: string
  role: "user" | "assistant"
  text: string
  state: "running" | "completed" | "stopped" | "failed" | "interrupted"
  task: StudyTask
  origin?: StudyOrigin
  createdAt: string
  model: string
  provider: ProviderId
  scope: StudyScope
  blocks: AnswerBlock[]
  evidence: EvidenceRef[]
  coverage: string
  draftText?: string
  captureId?: string
  goalId?: string
  goalContext?: { version: string; question: string; indexRevision: string }
  error?: string
}
export interface StudyGoal {
  id: string
  question: string
  prerequisites: string
  sectionId: string | null
  evidenceIds: string[]
  difficulty: "introductory" | "intermediate" | "advanced"
  checkQuestion: string
  userEdited: boolean
  explored: boolean
  checked: boolean
  revision: string
}
export type LessonStep =
  | IntelligentLessonStep
  | { type: "explanation"; title: string; text: string; evidenceIds: string[] }
  | { type: "diagram"; title: string; nodes: string[]; text: string; evidenceIds: string[] }
  | {
      type: "prediction" | "quiz"
      title: string
      question: string
      options: string[]
      correctIndex: number
      feedback: string
      evidenceIds: string[]
    }
  | {
      type: "experiment"
      title: string
      formula: "linear" | "sampling-error"
      min: number
      max: number
      step: number
      initial: number
      unit: string
      text: string
      evidenceIds: string[]
    }
export interface LessonSpec {
  schemaVersion: 1
  id: string
  title: string
  objectives: string[]
  prerequisites: string[]
  steps: LessonStep[]
  evidence: EvidenceRef[]
  revision: string
  model: string
  provider: ProviderId
  goalId: string | null
  dataKind: "paper" | "illustrative"
  coverage: string
  createdAt: string
}
export interface AssessmentAttempt {
  id: string
  lessonId: string
  stepIndex: number
  response: string
  correct: boolean
  revealed: boolean
  feedback: string
  createdAt: string
}
export interface LessonProgress {
  lessonId: string
  stepIndex: number
  parameters: Record<string, number>
  widgetStates?: Record<string, WidgetState>
  completedAt?: string
}
export interface CaptureAsset {
  id: string
  documentHash: string
  pageIndex: number
  rect: PdfRect
  width: number
  height: number
  dataUrl: string
  createdAt: string
}
export type StudyScope = { type: "document" } | { type: "section"; sectionId: string } | { type: "selection" }
export type StudyTask = "chat" | "goals" | "summary" | "lesson"
export type StudyOrigin = "composer" | "action"
export interface StudySnapshot {
  documentHash: string
  index: IndexStatus
  sections: StudySection[]
  goals: StudyGoal[]
  messages: StudyMessage[]
  lessons: LessonSpec[]
  attempts: AssessmentAttempt[]
  progress: LessonProgress[]
}
export interface StudyGenerateRequest {
  documentId: string
  requestId: string
  task: StudyTask
  origin?: StudyOrigin
  question: string
  scope: StudyScope
  selection: PdfSelection | null
  captureId?: string
  goalId?: string
}
export interface StudyEvent {
  documentHash: string
  requestId: string
  phase: "retrieving" | "generating" | "completed" | "stopped" | "failed"
  error?: string
}
export interface StudyJobStatus {
  active: boolean
  terminal: StudyEvent | null
}
export interface IndexBeginRequest {
  documentId: string
  pageCount: number
  outline: PdfOutlineNode[]
}
export interface ProviderStatus {
  installed: boolean
  connected: boolean
  signingIn: boolean
  version: string | null
  allowance: "available" | "exhausted" | "unknown"
  windows: Array<{ name: string; usedPercent: number; resetsAt: number | null }>
  error?: string
  generationAvailable?: boolean
  generationNotice?: string
}
