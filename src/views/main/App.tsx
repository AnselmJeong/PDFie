import { BookOpen, PanelRightOpen } from "lucide-react"
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
import { PdfDropOverlay } from "./components/PdfDropOverlay"
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
  const [draggingFile, setDraggingFile] = useState(false)
  const [uploadingDrop, setUploadingDrop] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PdfSelection | null>(null)
  const [status, setStatus] = useState<ReaderStatus>(initialStatus)
  const [chatOpen, setChatOpen] = useState(true)
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
  const dragDepth = useRef(0)
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

  const openDroppedPdf = useCallback(
    async (file: File) => {
      if (openingRef.current) return
      openingRef.current = true
      setOpening(true)
      setUploadingDrop(true)
      setError(null)
      let uploadedDocumentId: string | null = null
      try {
        const { uploadUrl } = await rpc.request["pdf.prepareDrop"]({
          fileName: file.name,
          sizeBytes: file.size,
        })
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: file,
        })
        if (!response.ok) throw new Error("PDF를 앱으로 가져오지 못했습니다.")
        const uploaded = (await response.json()) as { documentId?: unknown }
        if (typeof uploaded.documentId !== "string") throw new Error("PDF 업로드 응답이 올바르지 않습니다.")
        uploadedDocumentId = uploaded.documentId
        const result = await rpc.request["pdf.completeDrop"]({ documentId: uploaded.documentId })
        await applyOpenResult(result)
        uploadedDocumentId = null
      } catch (cause) {
        if (uploadedDocumentId) {
          await rpc.request["pdf.close"]({ documentId: uploadedDocumentId }).catch(() => undefined)
        }
        setError(cause instanceof Error ? cause.message : "드롭한 PDF를 열지 못했습니다.")
      } finally {
        openingRef.current = false
        setOpening(false)
        setUploadingDrop(false)
      }
    },
    [applyOpenResult],
  )

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

  useEffect(() => {
    const containsFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

    const dragenter = (event: DragEvent) => {
      if (!containsFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragDepth.current += 1
      setDraggingFile(true)
    }
    const dragover = (event: DragEvent) => {
      if (!containsFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }
    const dragleave = (event: DragEvent) => {
      if (dragDepth.current === 0) return
      event.preventDefault()
      event.stopPropagation()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDraggingFile(false)
    }
    const drop = (event: DragEvent) => {
      if (!containsFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragDepth.current = 0
      setDraggingFile(false)

      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length !== 1) {
        setError("PDF 파일을 한 번에 하나씩 놓아 주세요.")
        return
      }
      const file = files[0]
      if (!file?.name.toLowerCase().endsWith(".pdf")) {
        setError("PDF 파일만 열 수 있습니다.")
        return
      }
      void openDroppedPdf(file)
    }

    window.addEventListener("dragenter", dragenter, true)
    window.addEventListener("dragover", dragover, true)
    window.addEventListener("dragleave", dragleave, true)
    window.addEventListener("drop", drop, true)
    return () => {
      window.removeEventListener("dragenter", dragenter, true)
      window.removeEventListener("dragover", dragover, true)
      window.removeEventListener("dragleave", dragleave, true)
      window.removeEventListener("drop", drop, true)
    }
  }, [openDroppedPdf])

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

  const libraryView = (
    <StudyLibrary
      onOpenPdf={() => void openPdf()}
      opening={opening}
      currentHash={source?.documentHash}
      initialHash={source?.documentHash}
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
    return (
      <>
        {libraryView}
        {(draggingFile || uploadingDrop) && <PdfDropOverlay uploading={uploadingDrop} />}
        {error && (
          <div className="toast-error" role="alert">
            {error}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {view === "library" && libraryView}
      <div className="app-shell" hidden={view === "library"}>
        <div className="reader-column">
          <EmbedPdfWorkspace
            key={source.documentId}
            source={source}
            initialView={initialView}
            revealRequest={revealRequest}
            captureRequest={captureRequest}
            onCapture={(asset) => {
              setCapture(asset)
              setChatOpen(true)
            }}
            onClose={() => void closePdf()}
            onSelectionChange={setSelection}
            onSelectionAiRequest={(request) => {
              setAiRequest(request)
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
          />
        </div>
        <div hidden={!chatOpen} className="ai-sidebar-container">
          <AiSidebar
            key={source.documentId}
            visible={chatOpen}
            request={aiRequest}
            selection={selection}
            activePage={status.page}
            source={source}
            capture={capture}
            onDismissCapture={dismissCapture}
            onStartCapture={() => setCaptureRequest(crypto.randomUUID())}
            onReveal={(evidence) => setRevealRequest({ id: crypto.randomUUID(), evidence })}
            onClose={() => setChatOpen(false)}
          />
        </div>
        {!chatOpen && (
          <button
            className="chat-reopen"
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label="AI sidebar 열기"
          >
            <PanelRightOpen size={16} />
          </button>
        )}
        <footer className="status-bar">
          <button type="button" className="reader-library-button" onClick={() => setView("library")}>
            <BookOpen size={14} /> 학습 서재 <kbd>⌘L</kbd>
          </button>
          <span>
            {status.phase === "ready"
              ? `Page ${status.page} of ${status.pageCount}`
              : status.phase === "error"
                ? "Viewer error"
                : "Preparing PDF"}
          </span>
          <span>
            {Math.round(status.zoom * 100)}% · {status.rotation * 90}°
          </span>
          <span className="status-type">
            <span>문서 유형</span>
            <button
              type="button"
              data-active={classification.documentType === "article"}
              onClick={() => {
                setClassification({ ...classification, documentType: "article", confidence: 1 })
                setTypeSource("user")
                void rpc.request["pdf.saveState"]({
                  documentHash: source.documentHash,
                  documentType: "article",
                  documentTypeSource: "user",
                })
              }}
            >
              논문
            </button>
            <button
              type="button"
              data-active={classification.documentType === "book"}
              onClick={() => {
                setClassification({ ...classification, documentType: "book", confidence: 1 })
                setTypeSource("user")
                void rpc.request["pdf.saveState"]({
                  documentHash: source.documentHash,
                  documentType: "book",
                  documentTypeSource: "user",
                })
              }}
            >
              책
            </button>
            {classification.documentType === "unknown" && <em>확인 필요</em>}
          </span>
          <span className="status-native">
            <i /> Native WebKit
          </span>
        </footer>
        {(draggingFile || uploadingDrop) && <PdfDropOverlay uploading={uploadingDrop} />}
        {error && (
          <div className="toast-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </>
  )
}
