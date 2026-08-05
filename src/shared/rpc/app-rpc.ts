import type { RPCSchema } from "electrobun/bun"
import type { PdfOpenResult, PdfTextHighlight } from "../pdf/domain"

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      "app.ping": { params: Record<string, never>; response: { ok: true; renderer: "native" } }
      "pdf.openDialog": { params: Record<string, never>; response: PdfOpenResult | null }
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
        response: {
          endpoint: "https://ollama.com/v1"
          hasApiKey: boolean
          selectedModel: string
          sidebarWidth: number
          sidebarFontSize: number
        }
      }
      "ai.settings.update": {
        params: {
          apiKey?: string
          clearApiKey?: boolean
          selectedModel?: string
          sidebarWidth?: number
          sidebarFontSize?: number
        }
        response: {
          endpoint: "https://ollama.com/v1"
          hasApiKey: boolean
          selectedModel: string
          sidebarWidth: number
          sidebarFontSize: number
        }
      }
      "ai.models": { params: Record<string, never>; response: { models: string[] } }
      "ai.chatStream": {
        params: {
          requestId: string
          model: string
          question: string
          activePage: number
          selection: { text: string; pages: number[] } | null
        }
        response: { status: "completed" | "stopped" }
      }
      "ai.stop": { params: { requestId: string }; response: { stopped: boolean } }
    }
    messages: {
      "app.log": { level: "info" | "warn" | "error"; message: string }
    }
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      "pdf.openRequested": Record<string, never>
      "ai.token": { requestId: string; token: string }
    }
  }>
}
