import { PanelRightOpen } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { ClassificationResult } from "../../shared/pdf/classification"
import type { PdfSelection, PdfTextHighlight, PdfViewerSource } from "../../shared/pdf/domain"
import { AiSidebar } from "./components/AiSidebar"
import { EmptyLibrary } from "./components/EmptyLibrary"
import { EmbedPdfWorkspace, type ReaderStatus } from "./features/pdf/adapters/EmbedPdfWorkspace"
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
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PdfSelection | null>(null)
  const [status, setStatus] = useState<ReaderStatus>(initialStatus)
  const [chatOpen, setChatOpen] = useState(true)
  const [classification, setClassification] = useState(initialClassification)
  const [typeSource, setTypeSource] = useState<"auto" | "user">("auto")
  const [initialView, setInitialView] = useState({
    currentPage: 1,
    zoom: 0,
    rotation: 0,
    highlights: [] as PdfTextHighlight[],
  })

  const openPdf = useCallback(async () => {
    if (opening) return
    setOpening(true)
    setError(null)
    try {
      const result = await rpc.request["pdf.openDialog"]({})
      if (result) {
        if (source?.documentHash === result.source.documentHash) {
          await rpc.request["pdf.close"]({ documentId: result.source.documentId })
          return
        }
        if (source) await rpc.request["pdf.close"]({ documentId: source.documentId })
        setSource(result.source)
        setInitialView(result.restored)
        setStatus(initialStatus)
        setSelection(null)
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
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF를 열지 못했습니다.")
    } finally {
      setOpening(false)
    }
  }, [opening, source])

  const closePdf = useCallback(async () => {
    if (!source) return
    await rpc.request["pdf.close"]({ documentId: source.documentId })
    setSource(null)
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
    window.addEventListener("pdfie:open-requested", openFromMenu)
    return () => window.removeEventListener("pdfie:open-requested", openFromMenu)
  }, [openPdf])

  useEffect(() => {
    const handleSelectionAiAction = (event: Event) => {
      const prompt = (event as CustomEvent<string>).detail
      setChatOpen(true)
      window.setTimeout(
        () => window.dispatchEvent(new CustomEvent("pdfie:ai-submit", { detail: prompt })),
        60,
      )
    }
    window.addEventListener("pdfie:selection-ai-action", handleSelectionAiAction)
    return () => window.removeEventListener("pdfie:selection-ai-action", handleSelectionAiAction)
  }, [])

  useEffect(() => {
    const focusSelectionQuestion = () => {
      setChatOpen(true)
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("pdfie:ai-focus")), 60)
    }
    window.addEventListener("pdfie:selection-ai-focus-request", focusSelectionQuestion)
    return () => window.removeEventListener("pdfie:selection-ai-focus-request", focusSelectionQuestion)
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
        setChatOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [openPdf])

  if (!source) {
    return (
      <>
        <EmptyLibrary onOpen={() => void openPdf()} opening={opening} />
        {error && (
          <div className="toast-error" role="alert">
            {error}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="app-shell">
      <div className="reader-column">
        <EmbedPdfWorkspace
          key={source.documentId}
          source={source}
          initialView={initialView}
          onClose={() => void closePdf()}
          onSelectionChange={setSelection}
          onHighlightsChange={(highlights) =>
            void rpc.request["pdf.saveState"]({
              documentHash: source.documentHash,
              highlights,
            })
          }
          onStatusChange={setStatus}
          onClassificationChange={handleClassification}
        />
      </div>
      {chatOpen && (
        <AiSidebar
          selection={selection}
          activePage={status.page}
          documentTitle={source.fileName}
          onClose={() => setChatOpen(false)}
        />
      )}
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
    </div>
  )
}
