import type { PluginRegistry } from "@embedpdf/core"
import { EmbedPDF } from "@embedpdf/core/react"
import { usePdfiumEngine } from "@embedpdf/engines/react"
import { PdfActionType, type PdfBookmarkObject, PdfErrorCode, Rotation } from "@embedpdf/models"
import { useBookmarkCapability } from "@embedpdf/plugin-bookmark/react"
import { DocumentContent } from "@embedpdf/plugin-document-manager/react"
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react"
import { useRotate } from "@embedpdf/plugin-rotate/react"
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react"
import { SearchLayer, useSearch } from "@embedpdf/plugin-search/react"
import { useSelectionCapability } from "@embedpdf/plugin-selection/react"
import { SpreadMode, useSpread } from "@embedpdf/plugin-spread/react"
import { ThumbImg, ThumbnailsPane } from "@embedpdf/plugin-thumbnail/react"
import { TilingLayer } from "@embedpdf/plugin-tiling/react"
import { Viewport } from "@embedpdf/plugin-viewport/react"
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react"
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FlaskConical,
  ListTree,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  Search,
  X,
  ZoomIn,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type ClassificationResult, classifyPdfDocument } from "../../../../../shared/pdf/classification"
import type {
  PdfHighlightStyle,
  PdfOutlineNode,
  PdfSelection,
  PdfTextHighlight,
  PdfViewerSource,
} from "../../../../../shared/pdf/domain"
import { toPdfSelection } from "../../../../../shared/pdf/selection"
import { type GoldenSelectionResult, runGoldenSelectionCases } from "../qa/golden-selection-runner"
import { CleanSelectionLayer } from "./CleanSelectionLayer"
import { createPdfPlugins } from "./embedpdf-plugins"
import { collectPdfFastFacts } from "./fast-facts"
import { SelectionActions } from "./SelectionActions"
import { getSelectedTextPreservingVisualHyphens } from "./selection-text"
import { addOrRestyleHighlight, createHighlightPages } from "./text-highlights"

interface EmbedPdfWorkspaceProps {
  source: PdfViewerSource
  initialView: {
    currentPage: number
    zoom: number
    rotation: number
    highlights: PdfTextHighlight[]
  }
  onClose: () => void
  onSelectionChange: (selection: PdfSelection | null) => void
  onHighlightsChange: (highlights: PdfTextHighlight[]) => void
  onStatusChange: (status: ReaderStatus) => void
  onClassificationChange: (classification: ClassificationResult) => void
}

export interface ReaderStatus {
  page: number
  pageCount: number
  zoom: number
  rotation: number
  phase: "loading-engine" | "loading-document" | "ready" | "error"
  message?: string
}

function bookmarkPage(bookmark: PdfBookmarkObject): number | null {
  if (!bookmark.target) return null
  if (bookmark.target.type === "destination") return bookmark.target.destination.pageIndex + 1
  const action = bookmark.target.action
  if (action.type === PdfActionType.Goto) return action.destination.pageIndex + 1
  return null
}

function normalizeBookmarks(nodes: PdfBookmarkObject[], parentId = "root"): PdfOutlineNode[] {
  return nodes.map((node, index) => {
    const id = `${parentId}-${index}`
    return {
      id,
      title:
        [...node.title]
          .filter((character) => {
            const code = character.charCodeAt(0)
            return code > 31 && code !== 127
          })
          .join("")
          .trim() || "Untitled",
      pageNumber: bookmarkPage(node),
      children: normalizeBookmarks(node.children ?? [], id),
    }
  })
}

export function getPageNavigationDirection(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "isComposing" | "key" | "metaKey" | "shiftKey">,
): -1 | 0 | 1 {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0

  const keys = new Set([event.code, event.key])
  if (keys.has("PageUp") || keys.has("ArrowLeft")) return -1
  if (keys.has("PageDown") || keys.has("ArrowRight")) return 1
  return 0
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
}

function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function OutlineTree({
  nodes,
  onNavigate,
  depth = 0,
}: {
  nodes: PdfOutlineNode[]
  onNavigate: (page: number) => void
  depth?: number
}) {
  return (
    <ul className="outline-tree" data-depth={depth}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className="outline-item"
            disabled={node.pageNumber === null}
            onClick={() => node.pageNumber && onNavigate(node.pageNumber)}
          >
            <span>{node.title}</span>
            {node.pageNumber && <span className="outline-page">{node.pageNumber}</span>}
          </button>
          {node.children.length > 0 && (
            <OutlineTree nodes={node.children} onNavigate={onNavigate} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

function ReaderChrome({
  documentId,
  registry,
  source,
  initialView,
  onClose,
  onSelectionChange,
  onHighlightsChange,
  onStatusChange,
  onClassificationChange,
}: EmbedPdfWorkspaceProps & { documentId: string; registry: PluginRegistry }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId)
  const { provides: zoom, state: zoomState } = useZoom(documentId)
  const { provides: rotate, rotation } = useRotate(documentId)
  const { provides: search, state: searchState } = useSearch(documentId)
  const { provides: spread, spreadMode } = useSpread(documentId)
  const { provides: selection } = useSelectionCapability()
  const { provides: bookmark } = useBookmarkCapability()
  const [railOpen, setRailOpen] = useState(true)
  const [railMode, setRailMode] = useState<"thumbnails" | "outline">("thumbnails")
  const [outline, setOutline] = useState<PdfOutlineNode[]>([])
  const [outlineLoaded, setOutlineLoaded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectionMenu, setSelectionMenu] = useState<PdfSelection | null>(null)
  const [highlights, setHighlights] = useState<PdfTextHighlight[]>(initialView.highlights)
  const [qaResults, setQaResults] = useState<GoldenSelectionResult[] | null>(null)
  const [qaRunning, setQaRunning] = useState(false)
  const restoredViewApplied = useRef(false)

  useEffect(() => {
    if (restoredViewApplied.current || !scroll || !rotate || !scrollState.totalPages) return
    restoredViewApplied.current = true
    const restoredPage = Math.min(Math.max(1, initialView.currentPage), scrollState.totalPages)
    if (restoredPage > 1) {
      requestAnimationFrame(() => scroll.scrollToPage({ pageNumber: restoredPage }))
    }
    if (
      [Rotation.Degree0, Rotation.Degree90, Rotation.Degree180, Rotation.Degree270].includes(
        initialView.rotation,
      )
    )
      rotate.setRotation(initialView.rotation as Rotation)
  }, [initialView.currentPage, initialView.rotation, rotate, scroll, scrollState.totalPages])

  useEffect(() => {
    if (!bookmark) return
    const task = bookmark.forDocument(documentId).getBookmarks()
    task.wait(
      ({ bookmarks }) => {
        setOutline(normalizeBookmarks(bookmarks))
        setOutlineLoaded(true)
      },
      () => {
        setOutline([])
        setOutlineLoaded(true)
      },
    )
    return () => task.abort({ code: PdfErrorCode.Cancelled, message: "Bookmark load cancelled" })
  }, [bookmark, documentId])

  useEffect(() => {
    if (!outlineLoaded || !scrollState.totalPages) return
    let cancelled = false
    void collectPdfFastFacts(registry, documentId, scrollState.totalPages, outline)
      .then((facts) => {
        if (!cancelled) onClassificationChange(classifyPdfDocument(facts))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [documentId, onClassificationChange, outline, outlineLoaded, registry, scrollState.totalPages])

  useEffect(() => {
    if (!selection) return
    const scope = selection.forDocument(documentId)
    const stopEndSelection = scope.onEndSelection(async () => {
      try {
        const textLines = await getSelectedTextPreservingVisualHyphens(registry, documentId, scope)
        const result = toPdfSelection(textLines, scope.getFormattedSelection())
        setSelectionMenu(result)
        onSelectionChange(result)
      } catch {
        setSelectionMenu(null)
        onSelectionChange(null)
      }
    })
    const stopEmptySpaceClick = scope.onEmptySpaceClick(() => {
      setSelectionMenu(null)
      onSelectionChange(null)
    })
    return () => {
      stopEndSelection()
      stopEmptySpaceClick()
    }
  }, [documentId, onSelectionChange, registry, selection])

  useEffect(() => {
    onStatusChange({
      page: scrollState.currentPage || 1,
      pageCount: scrollState.totalPages || 0,
      zoom: zoomState.currentZoomLevel || 1,
      rotation,
      phase: "ready",
    })
  }, [onStatusChange, rotation, scrollState.currentPage, scrollState.totalPages, zoomState.currentZoomLevel])

  const runSearch = useCallback(() => {
    const query = searchQuery.trim()
    if (!query || !search) return
    search.searchAllPages(query)
  }, [search, searchQuery])

  const toggleSpread = useCallback(() => {
    if (!spread || !zoom) return
    spread.setSpreadMode(spreadMode === SpreadMode.None ? SpreadMode.Even : SpreadMode.None)
    requestAnimationFrame(() => zoom.requestZoom(ZoomMode.FitWidth))
  }, [spread, spreadMode, zoom])

  const clearSelection = useCallback(() => {
    selection?.forDocument(documentId).clear()
    setSelectionMenu(null)
    onSelectionChange(null)
  }, [documentId, onSelectionChange, selection])

  const hideSelectionMenu = useCallback(() => setSelectionMenu(null), [])

  const askAboutSelection = useCallback(() => {
    window.dispatchEvent(new CustomEvent("pdfie:selection-ai-focus-request"))
    hideSelectionMenu()
  }, [hideSelectionMenu])

  const summarizeSelection = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("pdfie:selection-ai-action", {
        detail: "선택한 구절의 핵심 주장과 논리 흐름을 간결하게 요약해 주세요.",
      }),
    )
    hideSelectionMenu()
  }, [hideSelectionMenu])

  const copySelection = useCallback(() => {
    if (!selectionMenu) return
    void navigator.clipboard.writeText(selectionMenu.text)
    clearSelection()
  }, [clearSelection, selectionMenu])

  const highlightSelection = useCallback(
    (style: PdfHighlightStyle) => {
      if (!selection || !selectionMenu) return
      const state = selection.forDocument(documentId).getState()
      const pages = createHighlightPages(selectionMenu, state)
      const next = addOrRestyleHighlight(highlights, selectionMenu, pages, style)
      setHighlights(next)
      onHighlightsChange(next)
      clearSelection()
    },
    [clearSelection, documentId, highlights, onHighlightsChange, selection, selectionMenu],
  )

  const selectionKey = useMemo(
    () =>
      selectionMenu
        ? `${selectionMenu.normalizedText}:${selectionMenu.pages
            .flatMap((page) => page.rects.map((rect) => `${page.pageNumber}:${rect.x}:${rect.y}`))
            .join("|")}`
        : "",
    [selectionMenu],
  )

  const runGoldenQa = useCallback(async () => {
    if (qaRunning) return
    setQaRunning(true)
    try {
      const results = await runGoldenSelectionCases(registry, documentId, source.fileName)
      setQaResults(results)
      const previous = JSON.parse(
        localStorage.getItem("pdfie.phase0.golden-results") ?? "[]",
      ) as GoldenSelectionResult[]
      const merged = new Map(previous.map((result) => [`${result.fixture}:${result.caseId}`, result]))
      for (const result of results) merged.set(`${result.fixture}:${result.caseId}`, result)
      localStorage.setItem("pdfie.phase0.golden-results", JSON.stringify([...merged.values()]))
    } finally {
      setQaRunning(false)
    }
  }, [documentId, qaRunning, registry, source.fileName])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (mod && event.shiftKey && event.code === "KeyT") {
        event.preventDefault()
        setRailOpen((value) => !value)
      }
      if (mod && event.altKey && event.code === "KeyG") {
        event.preventDefault()
        void runGoldenQa()
      }
      if (mod && event.key === "=") {
        event.preventDefault()
        zoom?.zoomIn()
      }
      if (mod && event.key === "-") {
        event.preventDefault()
        zoom?.zoomOut()
      }
      if (event.key === "Escape") {
        if (selectionMenu) clearSelection()
        else setSearchOpen(false)
      }
      if (mod && event.key.toLowerCase() === "c" && selectionMenu) {
        event.preventDefault()
        void navigator.clipboard.writeText(selectionMenu.text)
      }

      const pageDirection = getPageNavigationDirection(event)
      if (!pageDirection || isEditableKeyboardTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      if (pageDirection < 0) scroll?.scrollToPreviousPage("smooth")
      else scroll?.scrollToNextPage("smooth")
    }
    window.addEventListener("keydown", keydown, true)
    return () => window.removeEventListener("keydown", keydown, true)
  }, [clearSelection, runGoldenQa, scroll, selectionMenu, zoom])

  return (
    <section className="reader-shell" aria-label={`PDF reader: ${source.fileName}`}>
      <header className="pdf-toolbar">
        <div className="toolbar-group toolbar-title">
          <IconButton
            label={railOpen ? "탐색 패널 닫기" : "탐색 패널 열기"}
            onClick={() => setRailOpen((value) => !value)}
          >
            {railOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </IconButton>
          <div className="document-heading">
            <strong>{source.fileName}</strong>
            <span>
              {source.sizeBytes < 1_000_000
                ? `${Math.round(source.sizeBytes / 1000)} KB`
                : `${(source.sizeBytes / 1_000_000).toFixed(1)} MB`}
            </span>
          </div>
        </div>

        <div className="toolbar-group page-controls">
          <IconButton
            label="이전 페이지"
            onClick={() => scroll?.scrollToPreviousPage("smooth")}
            disabled={scrollState.currentPage <= 1}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <label className="page-input">
            <span className="sr-only">현재 페이지</span>
            <input
              value={scrollState.currentPage || 1}
              inputMode="numeric"
              onChange={(event) => scroll?.scrollToPage({ pageNumber: Number(event.target.value) || 1 })}
            />
            <span>/ {scrollState.totalPages || "—"}</span>
          </label>
          <IconButton
            label="다음 페이지"
            onClick={() => scroll?.scrollToNextPage("smooth")}
            disabled={scrollState.currentPage >= scrollState.totalPages}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>

        <div className="toolbar-group toolbar-actions">
          <IconButton
            label={spreadMode === SpreadMode.None ? "두 페이지 보기" : "한 페이지 보기"}
            onClick={toggleSpread}
          >
            <Columns2 size={16} />
          </IconButton>
          <IconButton label="축소" onClick={() => zoom?.zoomOut()}>
            <Minus size={16} />
          </IconButton>
          <button className="zoom-value" type="button" onClick={() => zoom?.requestZoom(ZoomMode.FitWidth)}>
            {Math.round((zoomState.currentZoomLevel || 1) * 100)}%
          </button>
          <IconButton label="확대" onClick={() => zoom?.zoomIn()}>
            <ZoomIn size={16} />
          </IconButton>
          <IconButton label="시계 방향으로 회전" onClick={() => rotate?.rotateForward()}>
            <RotateCw size={16} />
          </IconButton>
          <IconButton label="문서 검색" onClick={() => setSearchOpen((value) => !value)}>
            <Search size={16} />
          </IconButton>
          <IconButton label="Selection golden QA" onClick={() => void runGoldenQa()}>
            <FlaskConical size={15} />
          </IconButton>
          <IconButton label="문서 닫기" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </header>

      {searchOpen && (
        <form
          className="search-bar"
          onSubmit={(event) => {
            event.preventDefault()
            runSearch()
          }}
        >
          <Search size={14} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="PDF에서 검색"
            aria-label="PDF 검색어"
          />
          <span>
            {searchState.total ? `${searchState.activeResultIndex + 1} / ${searchState.total}` : ""}
          </span>
          <IconButton label="이전 검색 결과" onClick={() => search?.previousResult()}>
            <ChevronLeft size={14} />
          </IconButton>
          <IconButton label="다음 검색 결과" onClick={() => search?.nextResult()}>
            <ChevronRight size={14} />
          </IconButton>
          <IconButton
            label="검색 닫기"
            onClick={() => {
              search?.stopSearch()
              setSearchOpen(false)
            }}
          >
            <X size={14} />
          </IconButton>
        </form>
      )}

      <div className="reader-content">
        {railOpen && (
          <aside className="navigation-rail">
            <div className="rail-tabs" role="tablist" aria-label="문서 탐색">
              <button
                type="button"
                role="tab"
                aria-selected={railMode === "thumbnails"}
                onClick={() => setRailMode("thumbnails")}
              >
                <BookOpen size={14} /> 페이지
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={railMode === "outline"}
                onClick={() => setRailMode("outline")}
              >
                <ListTree size={14} /> 목차
              </button>
            </div>
            {railMode === "thumbnails" ? (
              <ThumbnailsPane documentId={documentId} className="thumbnail-list">
                {(meta) => (
                  <button
                    type="button"
                    key={meta.pageIndex}
                    className={`thumbnail-item ${meta.pageIndex + 1 === scrollState.currentPage ? "is-active" : ""}`}
                    onClick={() =>
                      scroll?.scrollToPage({ pageNumber: meta.pageIndex + 1, behavior: "smooth" })
                    }
                  >
                    <ThumbImg documentId={documentId} meta={meta} />
                    <span>{meta.pageIndex + 1}</span>
                  </button>
                )}
              </ThumbnailsPane>
            ) : outline.length ? (
              <nav className="outline-panel" aria-label="PDF 목차">
                <OutlineTree
                  nodes={outline}
                  onNavigate={(page) => scroll?.scrollToPage({ pageNumber: page, behavior: "smooth" })}
                />
              </nav>
            ) : (
              <div className="rail-empty">
                <ListTree size={18} />
                <p>이 문서에는 사용할 수 있는 목차가 없습니다.</p>
              </div>
            )}
          </aside>
        )}

        <main className="pdf-surface">
          <Viewport documentId={documentId} className="pdf-viewport">
            <Scroller
              documentId={documentId}
              className="pdf-scroller"
              renderPage={(page) => (
                <div
                  className="pdf-page"
                  style={{ width: page.rotatedWidth, height: page.rotatedHeight }}
                  data-page-number={page.pageNumber}
                >
                  <PagePointerProvider
                    documentId={documentId}
                    pageIndex={page.pageIndex}
                    rotation={rotation}
                    scale={zoomState.currentZoomLevel}
                  >
                    <TilingLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                      scale={zoomState.currentZoomLevel}
                    />
                    <SearchLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                      scale={zoomState.currentZoomLevel}
                    />
                    <CleanSelectionLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                      scale={zoomState.currentZoomLevel}
                      rotation={rotation}
                      highlights={highlights}
                      selectionMenu={
                        selectionMenu
                          ? (props) => (
                              <SelectionActions
                                {...props}
                                key={selectionKey}
                                onAskAI={askAboutSelection}
                                onSummarize={summarizeSelection}
                                onHighlight={highlightSelection}
                                onCopy={copySelection}
                              />
                            )
                          : undefined
                      }
                    />
                  </PagePointerProvider>
                </div>
              )}
            />
          </Viewport>

          {(qaRunning || qaResults) && (
            <aside className="qa-results" aria-live="polite">
              <div>
                <strong>Selection golden QA</strong>
                <span>
                  {qaRunning
                    ? "실행 중…"
                    : `${qaResults?.filter((result) => result.passed).length ?? 0}/${qaResults?.length ?? 0} 통과`}
                </span>
              </div>
              {qaResults && (
                <ul>
                  {qaResults.map((result) => (
                    <li key={result.caseId} data-passed={result.passed}>
                      {result.passed ? "PASS" : "FAIL"} · {result.caseId}
                      {result.error ? ` · ${result.error}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              <div className="qa-actions">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(localStorage.getItem("pdfie.phase0.golden-results") ?? "[]")
                  }
                >
                  누적 결과 복사
                </button>
                <button type="button" onClick={() => setQaResults(null)}>
                  닫기
                </button>
              </div>
            </aside>
          )}
        </main>
      </div>
    </section>
  )
}

export function EmbedPdfWorkspace(props: EmbedPdfWorkspaceProps) {
  const { engine, isLoading, error } = usePdfiumEngine({
    wasmUrl: "views://main/assets/pdfium.wasm",
    worker: true,
    fontFallback: null,
  })
  const plugins = useMemo(
    () => createPdfPlugins(props.source, props.initialView),
    [props.initialView, props.source],
  )
  const [registry, setRegistry] = useState<PluginRegistry | null>(null)

  useEffect(() => {
    if (isLoading)
      props.onStatusChange({ page: 1, pageCount: 0, zoom: 1, rotation: 0, phase: "loading-engine" })
    if (error)
      props.onStatusChange({
        page: 1,
        pageCount: 0,
        zoom: 1,
        rotation: 0,
        phase: "error",
        message: error.message,
      })
  }, [error, isLoading, props.onStatusChange])

  if (error) {
    return (
      <div className="reader-error">
        <strong>PDF engine을 시작하지 못했습니다.</strong>
        <p>{error.message}</p>
      </div>
    )
  }
  if (isLoading || !engine) {
    return (
      <div className="reader-loading">
        <span className="loading-mark" />
        <p>PDF engine을 준비하고 있습니다.</p>
      </div>
    )
  }

  return (
    <EmbedPDF
      engine={engine}
      plugins={plugins}
      onInitialized={async (initializedRegistry) => setRegistry(initializedRegistry)}
    >
      {({ activeDocumentId }) => (
        <DocumentContent documentId={activeDocumentId}>
          {({ isLoading: loadingDocument, isError, isLoaded }) => {
            if (loadingDocument)
              return (
                <div className="reader-loading">
                  <span className="loading-mark" />
                  <p>{props.source.fileName}을 여는 중입니다.</p>
                </div>
              )
            if (isError)
              return (
                <div className="reader-error">
                  <strong>PDF를 열 수 없습니다.</strong>
                  <p>암호, 파일 손상 또는 WebKit worker 상태를 확인하세요.</p>
                </div>
              )
            if (isLoaded && activeDocumentId && registry)
              return <ReaderChrome {...props} documentId={activeDocumentId} registry={registry} />
            return null
          }}
        </DocumentContent>
      )}
    </EmbedPDF>
  )
}
