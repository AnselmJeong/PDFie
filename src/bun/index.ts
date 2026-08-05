import { join } from "node:path"
import Electrobun, { BrowserView, BrowserWindow, Utils } from "electrobun/bun"
import type { AppRPC } from "../shared/rpc/app-rpc"
import { AiSettingsRepository } from "./ai/ai-settings-repository"
import { OllamaCloudService } from "./ai/ollama-cloud-service"
import { installApplicationMenu } from "./app-menu"
import { PdfSourceBridge } from "./pdf/document-source-bridge"
import { DocumentStateRepository } from "./pdf/document-state-repository"
import { restoreSingleSelectedPath } from "./pdf/open-file-dialog"

const sourceBridge = new PdfSourceBridge()
await sourceBridge.start()
const documentStates = await DocumentStateRepository.open(
  join(Utils.paths.userData, "pdfie-documents-v1.json"),
)
const aiSettings = await AiSettingsRepository.open(
  join(Utils.paths.userData, "pdfie-ai-settings-v1.json"),
  join(Utils.paths.userData, "pdfie-secret-v1.key"),
)
const ollamaCloud = new OllamaCloudService(aiSettings)
let sendAiToken: (detail: { requestId: string; token: string }) => void = () => undefined

async function choosePdf() {
  const selected = await Utils.openFileDialog({
    startingFolder: Utils.paths.home,
    allowedFileTypes: "pdf",
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
  })
  const path = restoreSingleSelectedPath(selected)
  if (!path) return null
  const source = await sourceBridge.register(path)
  const persisted = documentStates.get(source.documentHash)
  return {
    source,
    restored: {
      currentPage: persisted.currentPage,
      zoom: persisted.zoom,
      rotation: persisted.rotation,
      highlights: persisted.highlights,
    },
    persistedType: {
      documentType: persisted.documentType,
      source: persisted.documentTypeSource,
    },
  }
}

const rpc = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {
      "app.ping": async () => ({ ok: true as const, renderer: "native" as const }),
      "pdf.openDialog": async () => choosePdf(),
      "pdf.close": async ({ documentId }) => ({
        closed: sourceBridge.closeDocument(documentId),
      }),
      "pdf.saveState": async ({ documentHash, ...patch }) => {
        await documentStates.save(documentHash, patch)
        return { saved: true as const }
      },
      "ai.settings.get": async () => aiSettings.status(),
      "ai.settings.update": async (params) => aiSettings.update(params),
      "ai.models": async () => ({ models: await ollamaCloud.listModels() }),
      "ai.chatStream": async (params) => ({
        status: await ollamaCloud.chatStream(params, (token) => {
          sendAiToken({ requestId: params.requestId, token })
        }),
      }),
      "ai.stop": async ({ requestId }) => ({ stopped: ollamaCloud.stop(requestId) }),
    },
    messages: {
      "app.log": ({ level, message }) => {
        console[level](`[view] ${message.slice(0, 500)}`)
      },
    },
  },
})

const mainWindow = new BrowserWindow({
  title: "PDFie",
  url: "views://main/index.html",
  frame: { width: 1480, height: 940, x: 80, y: 60 },
  titleBarStyle: "default",
  rpc,
})

sendAiToken = (detail) => mainWindow.webview.rpc?.proxy.send["ai.token"](detail)
mainWindow.webview.setNavigationRules(["^*", "views://main/*"])
installApplicationMenu(() => mainWindow.webview.rpc?.proxy.send["pdf.openRequested"]({}))

Electrobun.events.on("before-quit", () => {
  sourceBridge.close()
})
