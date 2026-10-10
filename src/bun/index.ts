import { join } from "node:path"
import Electrobun, { BrowserView, BrowserWindow, Utils } from "electrobun/bun"
import type { AppRPC } from "../shared/rpc/app-rpc"
import type { StudyEvent } from "../shared/study/contracts"
import { AiSettingsRepository } from "./ai/ai-settings-repository"
import { CodexProvider } from "./ai/providers/codex-provider"
import { OllamaProvider } from "./ai/providers/ollama-provider"
import { installApplicationMenu } from "./app-menu"
import { CaptureStore } from "./assets/capture-store"
import { PdfSourceBridge } from "./pdf/document-source-bridge"
import { DocumentStateRepository } from "./pdf/document-state-repository"
import { restoreSingleSelectedPath } from "./pdf/open-file-dialog"
import { StudyLibrary } from "./persistence/study-library"
import { StudyStore } from "./persistence/study-store"
import { linkLibraryPdf } from "./study/library-source"
import { exportStudyMarkdown } from "./study/study-export"
import { StudyService } from "./study/study-service"

const sourceBridge = new PdfSourceBridge()
await sourceBridge.start()
const documentStates = await DocumentStateRepository.open(
  join(Utils.paths.userData, "pdfie-documents-v1.json"),
)
const aiSettings = await AiSettingsRepository.open(
  join(Utils.paths.userData, "pdfie-ai-settings-v1.json"),
  join(Utils.paths.userData, "pdfie-secret-v1.key"),
)
const studyStore = new StudyStore(join(Utils.paths.userData, "pdfie-study-v1.sqlite"))
const library = new StudyLibrary(studyStore)
const captureStore = new CaptureStore(studyStore)
const codex = new CodexProvider(join(Utils.paths.userData, "codex"))
const providers = { "ollama-cloud": new OllamaProvider(aiSettings), codex }
let sendStudyEvent: (event: StudyEvent) => void = () => undefined
const study = new StudyService(studyStore, aiSettings, providers, captureStore, (event) =>
  sendStudyEvent(event),
)
const documentHash = (id: string) => sourceBridge.getSource(id).documentHash

function restorePdf(source: ReturnType<PdfSourceBridge["getSource"]>) {
  library.remember(source.documentHash, source.fileName, sourceBridge.persistentPath(source.documentId))
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
  return restorePdf(source)
}

let settingsWindow: BrowserWindow<ReturnType<typeof createAppRpc>> | null = null
let settingsDocumentId: string | undefined

function recordsChanged(hash: string) {
  for (const window of appWindows())
    window.webview.rpc?.proxy.send["study.records.changed"]({ documentHash: hash })
}
async function exportRecords(hash: string, title: string) {
  const folder = restoreSingleSelectedPath(
    await Utils.openFileDialog({
      startingFolder: Utils.paths.home,
      allowedFileTypes: "",
      canChooseFiles: false,
      canChooseDirectory: true,
      allowsMultipleSelection: false,
    }),
  )
  if (!folder) return { saved: false, path: null }
  const fileName =
    Array.from(title, (char) => (char.charCodeAt(0) < 32 || "\\/:".includes(char) ? "-" : char))
      .join("")
      .slice(0, 160) || "study"
  const path = join(folder, `${fileName}-study-${Date.now()}.md`)
  await Bun.write(path, exportStudyMarkdown(title, studyStore.snapshot(hash)))
  return { saved: true, path }
}
function createAppRpc() {
  return BrowserView.defineRPC<AppRPC>({
    maxRequestTime: 60_000,
    handlers: {
      requests: {
        "library.list": async (query) => library.list(query),
        "library.detail": async ({ documentHash: hash }) => library.detail(hash),
        "library.update": async ({ documentHash: hash, ...patch }) => {
          library.update(hash, patch)
          recordsChanged(hash)
          return { saved: true as const }
        },
        "library.openPdf": async ({ documentHash: hash, relink }) => {
          library.require(hash)
          let path = library.sourcePath(hash)
          if (relink || !path || !(await Bun.file(path).exists())) {
            path = restoreSingleSelectedPath(
              await Utils.openFileDialog({
                startingFolder: Utils.paths.home,
                allowedFileTypes: "pdf",
                canChooseFiles: true,
                canChooseDirectory: false,
                allowsMultipleSelection: false,
              }),
            )
          }
          if (!path) return null
          const source = await linkLibraryPdf(library, sourceBridge, hash, path)
          const result = restorePdf(source)
          recordsChanged(hash)
          return result
        },
        "library.progress": async ({ documentHash: hash, progress }) => {
          study.progress(library.require(hash), progress)
          recordsChanged(hash)
          return { saved: true as const }
        },
        "library.assess": async ({ documentHash: hash, ...params }) => {
          study.assess(
            library.require(hash),
            params.lessonId,
            params.stepIndex,
            params.choice,
            params.revealed,
          )
          recordsChanged(hash)
          return studyStore.snapshot(hash)
        },
        "library.capture": async ({ documentHash: hash, captureId }) =>
          captureStore.get(library.require(hash), captureId) ?? null,
        "library.export": async ({ documentHash: hash }) =>
          exportRecords(library.require(hash), library.detail(hash).document.title),
        "library.delete": async ({ documentHash: hash }) => {
          library.require(hash)
          if (study.isActive(hash)) throw new Error("생성을 중지한 뒤 자료를 삭제하세요.")
          captureStore.clear(hash)
          library.remove(hash)
          recordsChanged(hash)
          return { saved: true as const }
        },
        "app.settings.open": async ({ documentId }) => {
          openSettingsWindow(documentId)
          return { opened: true as const }
        },
        "app.settings.close": async () => {
          // Return the RPC response before its webview is destroyed.
          setTimeout(() => settingsWindow?.close(), 50)
          return { closed: true as const }
        },
        "app.settings.context": async () => {
          try {
            const source = settingsDocumentId ? sourceBridge.getSource(settingsDocumentId) : null
            return { document: source ? { id: source.documentId, fileName: source.fileName } : null }
          } catch {
            return { document: null }
          }
        },
        "study.snapshot": async ({ documentId }) => studyStore.snapshot(documentHash(documentId)),
        "study.index.begin": async ({ documentId, pageCount, outline }) => {
          const hash = documentHash(documentId)
          return {
            index: studyStore.begin(hash, pageCount, outline),
            completedPages: studyStore.completedPages(hash),
          }
        },
        "study.index.page": async ({ documentId, page }) => studyStore.ingest(documentHash(documentId), page),
        "study.generate": async (params) => study.start(documentHash(params.documentId), params),
        "study.job.status": async ({ documentId, requestId }) =>
          study.jobStatus(documentHash(documentId), requestId),
        "study.goal.save": async ({ documentId, goal }) => {
          study.saveGoal(documentHash(documentId), goal)
          return { saved: true as const }
        },
        "study.goal.delete": async ({ documentId, goalId }) => {
          studyStore.remove(documentHash(documentId), "goals", goalId)
          return { saved: true as const }
        },
        "study.goal.reorder": async ({ documentId, goalIds }) => {
          const hash = documentHash(documentId),
            goals = studyStore.snapshot(hash).goals
          if (
            goalIds.length !== goals.length ||
            new Set(goalIds).size !== goals.length ||
            goalIds.some((id) => !goals.some((g) => g.id === id))
          )
            throw new Error("목표 순서를 확인하세요.")
          studyStore.db.transaction(() => {
            goals.forEach((g) => {
              studyStore.remove(hash, "goals", g.id)
            })
            goalIds.forEach((id) => {
              studyStore.put(
                hash,
                "goals",
                id,
                goals.find((g) => g.id === id),
              )
            })
          })()
          return { saved: true as const }
        },
        "study.section.rename": async ({ documentId, sectionId, title }) => {
          const hash = documentHash(documentId),
            section = studyStore.sections(hash).find((s) => s.id === sectionId)
          if (!section || !title.trim() || title.length > 300) throw new Error("섹션 제목을 확인하세요.")
          studyStore.put(hash, "sectionEdits", sectionId, {
            ...section,
            title: title.trim(),
            userEdited: true,
          })
          return { saved: true as const }
        },
        "study.progress": async ({ documentId, progress }) => {
          study.progress(documentHash(documentId), progress)
          return { saved: true as const }
        },
        "study.section.splitPoints": async ({ documentId, sectionId }) =>
          studyStore.sectionSplitPoints(documentHash(documentId), sectionId),
        "study.section.split": async ({ documentId, blockId, title }) => {
          const hash = documentHash(documentId)
          if (study.isActive(hash)) throw new Error("생성이 끝난 뒤 섹션을 수정하세요.")
          studyStore.splitSection(hash, blockId, title)
          return { saved: true as const }
        },
        "study.section.merge": async ({ documentId, sectionId }) => {
          const hash = documentHash(documentId)
          if (study.isActive(hash)) throw new Error("생성이 끝난 뒤 섹션을 수정하세요.")
          studyStore.mergeSection(hash, sectionId)
          return { saved: true as const }
        },
        "study.assess": async ({ documentId, ...params }) => {
          const hash = documentHash(documentId)
          study.assess(hash, params.lessonId, params.stepIndex, params.choice, params.revealed)
          return studyStore.snapshot(hash)
        },
        "study.capture.save": async ({ documentId, capture }) =>
          captureStore.save(documentHash(documentId), capture),
        "study.capture.remove": async ({ documentId, captureId }) => {
          captureStore.removeUnused(documentHash(documentId), captureId)
          return { saved: true as const }
        },
        "study.export": async ({ documentId }) => {
          const source = sourceBridge.getSource(documentId)
          return exportRecords(source.documentHash, source.fileName.replace(/\.pdf$/i, ""))
        },
        "study.clear": async ({ documentId }) => {
          const hash = documentHash(documentId)
          if (study.isActive(hash)) throw new Error("생성을 중지한 뒤 기록을 삭제하세요.")
          captureStore.clear(hash)
          studyStore.clear(hash)
          for (const window of appWindows())
            window.webview.rpc?.proxy.send["study.records.changed"]({ documentHash: hash })
          return { saved: true as const }
        },
        "ai.provider.status": async () => refreshProviderStatus(),
        "ai.provider.login": async () => {
          const url = await codex.login()
          Utils.openExternal(url)
          void refreshProviderStatus()
          return { started: true as const }
        },
        "ai.provider.cancelLogin": async () => {
          await codex.cancelLogin()
          void refreshProviderStatus()
          return { cancelled: true as const }
        },
        "ai.provider.logout": async () => {
          await codex.logout()
          void refreshProviderStatus()
          return { loggedOut: true as const }
        },
        "app.ping": async () => ({ ok: true as const, renderer: "native" as const }),
        "pdf.openDialog": async () => choosePdf(),
        "pdf.prepareDrop": async ({ fileName, sizeBytes }) =>
          sourceBridge.prepareDropUpload(fileName, sizeBytes),
        "pdf.completeDrop": async ({ documentId }) => restorePdf(sourceBridge.getSource(documentId)),
        "pdf.close": async ({ documentId }) => {
          await study.stop(undefined, documentHash(documentId))
          return { closed: sourceBridge.closeDocument(documentId) }
        },
        "pdf.saveState": async ({ documentHash, ...patch }) => {
          await documentStates.save(documentHash, patch)
          return { saved: true as const }
        },
        "ai.settings.get": async () => aiSettings.status(),
        "ai.settings.update": async (params) => {
          const saved = await aiSettings.update(params)
          for (const window of appWindows()) window.webview.rpc?.proxy.send["ai.settings.changed"](saved)
          if (saved.provider === "codex" && (params.provider || params.selectedModel !== undefined))
            void refreshProviderStatus()
          return saved
        },
        "ai.models": async () => {
          const provider = aiSettings.status().provider
          return { models: await providers[provider].models(), provider }
        },
        "ai.stop": async ({ requestId }) => ({ stopped: await study.stop(requestId) }),
      },
      messages: {
        "app.log": ({ level, message }) => {
          console[level](`[view] ${message.slice(0, 500)}`)
        },
      },
    },
  })
}

const mainWindow = new BrowserWindow({
  title: "PDFie",
  url: "views://main/index.html",
  frame: { width: 1480, height: 940, x: 80, y: 60 },
  titleBarStyle: "default",
  rpc: createAppRpc(),
})

function appWindows() {
  return settingsWindow ? [mainWindow, settingsWindow] : [mainWindow]
}
let providerRefresh: ReturnType<CodexProvider["status"]> | null = null
let providerRefreshQueued = false
async function refreshProviderStatus() {
  if (providerRefresh) return providerRefresh
  const refresh = codex.status(aiSettings.status().selectedModel)
  providerRefresh = refresh
  try {
    const status = await refresh
    for (const window of appWindows()) window.webview.rpc?.proxy.send["ai.provider.changed"](status)
    return status
  } finally {
    if (providerRefresh === refresh) providerRefresh = null
    if (providerRefreshQueued) {
      providerRefreshQueued = false
      void refreshProviderStatus()
    }
  }
}
codex.accountListeners.add(() => {
  if (providerRefresh) providerRefreshQueued = true
  else void refreshProviderStatus()
})
function openSettingsWindow(documentId?: string) {
  settingsDocumentId = documentId
  const parent = mainWindow.getFrame()
  const size = settingsWindow?.getSize() ?? { width: 680, height: 650 }
  const frame = {
    ...size,
    x: Math.round(parent.x + (parent.width - size.width) / 2),
    y: Math.round(parent.y + (parent.height - size.height) / 2),
  }
  if (settingsWindow) {
    settingsWindow.setPosition(frame.x, frame.y)
    settingsWindow.webview.rpc?.proxy.send["app.settings.contextChanged"]({})
    settingsWindow.activate()
    return
  }
  const window = new BrowserWindow({
    title: "PDFie 설정",
    url: "views://main/settings.html",
    frame,
    titleBarStyle: "default",
    rpc: createAppRpc(),
  })
  settingsWindow = window
  const actualSize = window.getSize()
  window.setPosition(
    Math.round(parent.x + (parent.width - actualSize.width) / 2),
    Math.round(parent.y + (parent.height - actualSize.height) / 2),
  )
  window.webview.setNavigationRules(["^*", "views://main/*"])
  window.on("close", () => {
    if (settingsWindow === window) settingsWindow = null
  })
}

sendStudyEvent = (detail) => mainWindow.webview.rpc?.proxy.send["study.event"](detail)
mainWindow.webview.setNavigationRules(["^*", "views://main/*"])
installApplicationMenu(
  () => mainWindow.webview.rpc?.proxy.send["pdf.openRequested"]({}),
  () => openSettingsWindow(),
  () => mainWindow.webview.rpc?.proxy.send["library.openRequested"]({}),
)
mainWindow.on("close", () => settingsWindow?.close())

Electrobun.events.on("before-quit", () => {
  void study.stop()
  codex.close()
  sourceBridge.close()
})
