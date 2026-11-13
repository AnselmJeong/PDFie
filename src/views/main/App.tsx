import { useToast } from "@astryxdesign/core/Toast"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ClassificationResult } from "../../shared/pdf/classification"
import type {
  PdfOpenResult,
  PdfSelection,
  PdfTextHighlight,
  PdfViewerSource,
  SelectionAiRequest,
} from "../../shared/pdf/domain"
import type { CaptureAsset, EvidenceRef } from "../../shared/study/contracts"
import { AiSidebar } from "./components/AiSidebar"
import { EmbedPdfWorkspace, type ReaderStatus } from "./features/pdf/adapters/EmbedPdfWorkspace"
import { StudyLibrary } from "./features/study/StudyLibrary"
import { rpc } from "./rpc"

const initialStatus: ReaderStatus = { page: 1, pageCount: 0, zoom: 1, rotation: 0, phase: "loading-engine" }
const initialClassification: ClassificationResult = {
  documentType: "unknown",
  confidence: 0,
  articleScore: 0,
  bookScore: 0,
  evidence: [],
}

export function App() {
  const [source, setSource] = useState<PdfViewerSource | null>(null)
  const [view, setView] = useState<"library" | "reader">("library")
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PdfSelection | null>(null)
  const [status, setStatus] = useState<ReaderStatus>(initialStatus)
  const [chatOpen, setChatOpen] = useState(true)
  const [focusMode, setFocusMode] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [aiRequest, setAiRequest] = useState<SelectionAiRequest | null>(null)
  const [classification, setClassification] = useState(initialClassification)
  const [typeSource, setTypeSource] = useState<"auto" | "user">("auto")
  const [initialView, setInitialView] = useState({
    currentPage: 1,
    zoom: 0,
    rotation: 0,
    highlights: [] as PdfTextHighlight[],
  })
  const openingRef = useRef(false)
  const [capture, setCapture] = useState<CaptureAsset | null>(null)
  const [captureRequest, setCaptureRequest] = useState<string | null>(null)
  const [revealRequest, setRevealRequest] = useState<{ id: string; evidence: EvidenceRef } | null>(null)
  const dismissCapture = useCallback(() => {
    if (capture && source)
      void rpc.request["study.capture.remove"]({
        documentId: source.documentId,
        captureId: capture.id,
      }).catch(() => undefined)
    setCapture(null)
  }, [capture, source])

  const applyOpenResult = useCallback(
    async (result: PdfOpenResult) => {
      setView("reader")
      if (source?.documentHash === result.source.documentHash) {
        await rpc.request["pdf.close"]({ documentId: result.source.documentId })
        return
      }
      if (source) await rpc.request["pdf.close"]({ documentId: source.documentId })
      setSource(result.source)
      setInitialView(result.restored)
      setStatus(initialStatus)
      setSelection(null)
      setCapture(null)
      setCaptureRequest(null)
      setRevealRequest(null)
      setAiRequest(null)
      if (result.persistedType.source === "user") {
        setClassification({
          ...initialClassification,
          documentType: result.persistedType.documentType,
          confidence: 1,
        })
        setTypeSource("user")
      } else {
        setClassification(initialClassification)
        setTypeSource("auto")
      }
    },
    [source],
  )

  const openPdf = useCallback(async () => {
    if (openingRef.current) return
    openingRef.current = true
    setOpening(true)
    setError(null)
    try {
      const result = await rpc.request["pdf.openDialog"]({})
      if (result) await applyOpenResult(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF를 열지 못했습니다.")
    } finally {
      openingRef.current = false
      setOpening(false)
    }
  }, [applyOpenResult])

  // Files macOS asked PDFie to open (Open With, double-click, the Dock icon).
  // They may arrive before this view loads, so take them on mount and on notice.
  const takeOpenRequests = useCallback(async () => {
    try {
      const { opened, failed } = await rpc.request["pdf.takeOpenRequests"]({})
      for (const result of opened) await applyOpenResult(result)
      if (failed.length) setError(failed.join("\n"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF를 열지 못했습니다.")
    }
  }, [applyOpenResult])
  const takeOpenRequestsRef = useRef(takeOpenRequests)
  takeOpenRequestsRef.current = takeOpenRequests
  useEffect(() => {
    const pending = () => void takeOpenRequestsRef.current()
    window.addEventListener("pdfie:open-requests-pending", pending)
    pending()
    return () => window.removeEventListener("pdfie:open-requests-pending", pending)
  }, [])

  const closePdf = useCallback(async () => {
    if (!source) return
    await rpc.request["pdf.close"]({ documentId: source.documentId })
    setSource(null)
    setView("library")
    setCapture(null)
    setCaptureRequest(null)
    setRevealRequest(null)
    setSelection(null)
  }, [source])

  const handleClassification = useCallback(
    (result: ClassificationResult) => {
      if (typeSource === "auto") {
        setClassification(result)
        if (source)
          void rpc.request["pdf.saveState"]({
            documentHash: source.documentHash,
            documentType: result.documentType,
            documentTypeSource: "auto",
          })
      }
    },
    [source, typeSource],
  )

  useEffect(() => {
    const openFromMenu = () => void openPdf()
    const libraryFromMenu = () => setView("library")
    window.addEventListener("pdfie:open-requested", openFromMenu)
    window.addEventListener("pdfie:library-requested", libraryFromMenu)
    return () => {
      window.removeEventListener("pdfie:open-requested", openFromMenu)
      window.removeEventListener("pdfie:library-requested", libraryFromMenu)
    }
  }, [openPdf])

  // Files dropped on the window would only reach the page as anonymous bytes,
  // so the library could not reopen them; point to the ways that keep the path.
  useEffect(() => {
    const containsFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
    const dragover = (event: DragEvent) => {
      if (!containsFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
    }
    const drop = (event: DragEvent) => {
      if (!containsFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      setNotice(
        "PDF는 ⌘O(추가 → PDF 열기)로 열거나, Finder에서 ‘다음으로 열기 → PDFie’ 또는 Dock의 PDFie 아이콘에 끌어다 놓아 여세요.",
      )
    }
    window.addEventListener("dragover", dragover, true)
    window.addEventListener("drop", drop, true)
    return () => {
      window.removeEventListener("dragover", dragover, true)
      window.removeEventListener("drop", drop, true)
    }
  }, [])

  useEffect(() => {
    if (!source || status.phase !== "ready") return
    const timeout = window.setTimeout(() => {
      void rpc.request["pdf.saveState"]({
        documentHash: source.documentHash,
        currentPage: status.page,
        zoom: status.zoom,
        rotation: status.rotation,
      })
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [source, status])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault()
        void openPdf()
      }
      if (mod && event.code === "Slash") {
        event.preventDefault()
        setFocusMode(false)
        setChatOpen((value) => !value)
      }
      if (mod && event.key.toLowerCase() === "l") {
        event.preventDefault()
        setView("library")
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [openPdf])

  const toast = useToast()
  // Messages surface as toasts; errors persist until dismissed.
  useEffect(() => {
    if (!error) return
    toast({ body: error, type: "error", uniqueID: `error:${error}` })
    setError(null)
  }, [error, toast])
  useEffect(() => {
    if (!notice) return
    toast({ body: notice, uniqueID: `notice:${notice}` })
    setNotice(null)
  }, [notice, toast])

  const setDocumentType = useCallback(
    (documentType: "article" | "book") => {
      if (!source) return
      setClassification((current) => ({ ...current, documentType, confidence: 1 }))
      setTypeSource("user")
      void rpc.request["pdf.saveState"]({
        documentHash: source.documentHash,
        documentType,
        documentTypeSource: "user",
      })
    },
    [source],
  )
  const toggleFocus = useCallback(() => setFocusMode((value) => !value), [])

  const libraryView = (
    <StudyLibrary
      onOpenPdf={() => void openPdf()}
      opening={opening}
      currentHash={source?.documentHash}
      onReturn={source ? () => setView("reader") : undefined}
      onDeleted={(hash) => {
        if (hash === source?.documentHash) void closePdf().catch(() => setSource(null))
      }}
      onOpenResult={async (result, evidence) => {
        await applyOpenResult(result)
        if (evidence) setRevealRequest({ id: crypto.randomUUID(), evidence })
      }}
    />
  )

  if (!source) {
    return <>{libraryView}</>
  }

  return (
    <>
      {view === "library" && libraryView}
      <div className="app-shell" hidden={view === "library"} data-focus={focusMode || undefined}>
        <div className="reader-column">
          <EmbedPdfWorkspace
            key={source.documentId}
            source={source}
            initialView={initialView}
            revealRequest={revealRequest}
            captureRequest={captureRequest}
            onCapture={(asset) => {
              setCapture(asset)
              setFocusMode(false)
              setChatOpen(true)
            }}
            onClose={() => void closePdf()}
            onSelectionChange={setSelection}
            onSelectionAiRequest={(request) => {
              setAiRequest(request)
              setFocusMode(false)
              setChatOpen(true)
            }}
            onHighlightsChange={(highlights) =>
              void rpc.request["pdf.saveState"]({
                documentHash: source.documentHash,
                highlights,
              }).catch(() =>
                setError("하이라이트와 주석을 저장하지 못했습니다. 앱을 닫기 전에 다시 시도해 주세요."),
              )
            }
            onStatusChange={setStatus}
            onClassificationChange={handleClassification}
            chrome={{
              aiOpen: chatOpen && !focusMode,
              onToggleAi: () => {
                setFocusMode(false)
                setChatOpen((value) => (focusMode ? true : !value))
              },
              onOpenLibrary: () => setView("library"),
              documentType: classification.documentType,
              onDocumentTypeChange: setDocumentType,
              onOpenSettings: () =>
                void rpc.request["app.settings.open"]({ documentId: source.documentId }).catch(() =>
                  setError("설정 창을 열지 못했습니다."),
                ),
              onExport: () =>
                void rpc.request["study.export"]({ documentId: source.documentId })
                  .then((result) => {
                    if (result.saved) setNotice("학습 기록을 Markdown으로 저장했습니다.")
                  })
                  .catch((cause) =>
                    setError(cause instanceof Error ? cause.message : "학습 기록을 내보내지 못했습니다."),
                  ),
              focusMode,
              onToggleFocus: toggleFocus,
            }}
          />
        </div>
        <div hidden={!chatOpen || focusMode} className="ai-sidebar-container">
          <AiSidebar
            key={source.documentId}
            visible={chatOpen && !focusMode}
            request={aiRequest}
            selection={selection}
            source={source}
            capture={capture}
            onDismissCapture={dismissCapture}
            onStartCapture={() => setCaptureRequest(crypto.randomUUID())}
            onReveal={(evidence) => setRevealRequest({ id: crypto.randomUUID(), evidence })}
            onClose={() => setChatOpen(false)}
          />
        </div>
      </div>
    </>
  )
}
