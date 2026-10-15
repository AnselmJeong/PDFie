import type { RPCSchema } from "electrobun/bun"
import type { AiSettingsStatus } from "../../bun/ai/ai-settings-repository"
import type { PdfOpenResult, PdfTextHighlight } from "../pdf/domain"
import type {
  CaptureAsset,
  IndexBeginRequest,
  IndexStatus,
  LessonProgress,
  ModelInfo,
  PageAnalysis,
  ProviderId,
  ProviderStatus,
  StudyEvent,
  StudyGenerateRequest,
  StudyGoal,
  StudyJobStatus,
  StudySnapshot,
} from "../study/contracts"
import type {
  LibraryCollection,
  LibraryDetail,
  LibraryFacets,
  LibraryPage,
  LibraryPatch,
  LibraryQuery,
} from "../study/library"

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      "library.classify": { params: { documentHash: string }; response: { queued: true } }
      "library.list": { params: LibraryQuery; response: LibraryPage }
      "library.facets": { params: { archived?: boolean }; response: LibraryFacets }
      "library.collection.save": { params: { name: string; id?: string }; response: LibraryCollection }
      "library.collection.delete": { params: { id: string }; response: { saved: true } }
      "library.detail": { params: { documentHash: string }; response: LibraryDetail }
      "library.update": {
        params: { documentHash: string } & LibraryPatch
        response: { saved: true }
      }
      "library.openPdf": {
        params: { documentHash: string; relink?: boolean }
        response: PdfOpenResult | null
      }
      "library.progress": {
        params: { documentHash: string; progress: LessonProgress }
        response: { saved: true }
      }
      "library.assess": {
        params: {
          documentHash: string
          lessonId: string
          stepIndex: number
          choice: number
          revealed: boolean
        }
        response: StudySnapshot
      }
      "library.capture": {
        params: { documentHash: string; captureId: string }
        response: CaptureAsset | null
      }
      "library.export": {
        params: { documentHash: string }
        response: { saved: boolean; path: string | null }
      }
      "library.delete": { params: { documentHash: string }; response: { saved: true } }
      "app.settings.open": { params: { documentId?: string }; response: { opened: true } }
      "app.settings.close": { params: Record<string, never>; response: { closed: true } }
      "app.settings.context": {
        params: Record<string, never>
        response: { document: { id: string; fileName: string } | null }
      }
      "study.snapshot": { params: { documentId: string }; response: StudySnapshot }
      "study.index.begin": {
        params: IndexBeginRequest
        response: { index: IndexStatus; completedPages: number[] }
      }
      "study.index.page": { params: { documentId: string; page: PageAnalysis }; response: IndexStatus }
      "study.generate": { params: StudyGenerateRequest; response: { requestId: string } }
      "study.job.status": {
        params: { documentId: string; requestId: string }
        response: StudyJobStatus
      }
      "study.goal.save": { params: { documentId: string; goal: StudyGoal }; response: { saved: true } }
      "study.goal.delete": { params: { documentId: string; goalId: string }; response: { saved: true } }
      "study.goal.reorder": { params: { documentId: string; goalIds: string[] }; response: { saved: true } }
      "study.section.rename": {
        params: { documentId: string; sectionId: string; title: string }
        response: { saved: true }
      }
      "study.section.splitPoints": {
        params: { documentId: string; sectionId: string }
        response: Array<{ id: string; page: number; preview: string }>
      }
      "study.section.split": {
        params: { documentId: string; blockId: string; title: string }
        response: { saved: true }
      }
      "study.section.merge": { params: { documentId: string; sectionId: string }; response: { saved: true } }
      "study.progress": {
        params: { documentId: string; progress: LessonProgress }
        response: { saved: true }
      }
      "study.assess": {
        params: { documentId: string; lessonId: string; stepIndex: number; choice: number; revealed: boolean }
        response: StudySnapshot
      }
      "study.capture.save": { params: { documentId: string; capture: CaptureAsset }; response: CaptureAsset }
      "study.capture.remove": { params: { documentId: string; captureId: string }; response: { saved: true } }
      "study.export": { params: { documentId: string }; response: { saved: boolean; path: string | null } }
      "study.clear": { params: { documentId: string }; response: { saved: true } }
      "ai.provider.status": { params: Record<string, never>; response: ProviderStatus }
      "ai.provider.login": { params: Record<string, never>; response: { started: true } }
      "ai.provider.cancelLogin": { params: Record<string, never>; response: { cancelled: true } }
      "ai.provider.logout": { params: Record<string, never>; response: { loggedOut: true } }
      "app.ping": { params: Record<string, never>; response: { ok: true; renderer: "native" } }
      "pdf.openDialog": { params: Record<string, never>; response: PdfOpenResult | null }
      "pdf.prepareDrop": {
        params: { fileName: string; sizeBytes: number }
        response: { uploadUrl: string }
      }
      "pdf.completeDrop": { params: { documentId: string }; response: PdfOpenResult }
      "pdf.close": { params: { documentId: string }; response: { closed: boolean } }
      "pdf.saveState": {
        params: {
          documentHash: string
          currentPage?: number
          zoom?: number
          rotation?: number
          highlights?: PdfTextHighlight[]
          documentType?: "article" | "book" | "unknown"
          documentTypeSource?: "auto" | "user"
        }
        response: { saved: true }
      }
      "ai.settings.get": {
        params: Record<string, never>
        response: AiSettingsStatus
      }
      "ai.settings.update": {
        params: {
          provider?: ProviderId
          apiKey?: string
          clearApiKey?: boolean
          selectedModel?: string
          sidebarWidth?: number
          sidebarFontSize?: number
        }
        response: AiSettingsStatus
      }
      "ai.models": { params: Record<string, never>; response: { models: ModelInfo[]; provider: ProviderId } }
      "ai.stop": { params: { requestId: string }; response: { stopped: boolean } }
    }
    messages: {
      "app.log": { level: "info" | "warn" | "error"; message: string }
    }
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      "ai.settings.changed": AiSettingsStatus
      "ai.provider.changed": ProviderStatus
      "app.settings.contextChanged": Record<string, never>
      "study.records.changed": { documentHash: string }
      "pdf.openRequested": Record<string, never>
      "library.openRequested": Record<string, never>
      "ai.token": { requestId: string; token: string }
      "study.event": StudyEvent
    }
  }>
}
