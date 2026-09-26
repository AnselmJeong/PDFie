import type { PluginRegistry } from "@embedpdf/core"
import { EmbedPDF, useDocumentState } from "@embedpdf/core/react"
import { usePdfiumEngine } from "@embedpdf/engines/react"
import {
  PdfActionType,
  type PdfBookmarkObject,
  PdfErrorCode,
  Rotation,
  type SearchResult,
} from "@embedpdf/models"
import { useBookmarkCapability } from "@embedpdf/plugin-bookmark/react"
import { DocumentContent } from "@embedpdf/plugin-document-manager/react"
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react"
import { Rotate, useRotate } from "@embedpdf/plugin-rotate/react"
import { type PageLayout, useScroll } from "@embedpdf/plugin-scroll/react"
import { SearchLayer, useSearch } from "@embedpdf/plugin-search/react"
import { useSelectionCapability } from "@embedpdf/plugin-selection/react"
import { SpreadMode, useSpread } from "@embedpdf/plugin-spread/react"
import { TilingLayer } from "@embedpdf/plugin-tiling/react"
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react"
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Highlighter,
  ListTree,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  Search,
  Square,
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
  SelectionAiRequest,
} from "../../../../../shared/pdf/domain"
import { toPdfSelection } from "../../../../../shared/pdf/selection"
import { CleanSelectionLayer } from "./CleanSelectionLayer"
import { createPdfPlugins } from "./embedpdf-plugins"
import { collectPdfFastFacts } from "./fast-facts"
import type { FitMode } from "./fit-zoom"
import { HighlightsPanel } from "./HighlightsPanel"
import { PaginatedViewport } from "./PaginatedViewport"
import { clampPage, getPageGroup } from "./page-navigation"
import { SelectionActions } from "./SelectionActions"
import { getSelectedTextPreservingVisualHyphens } from "./selection-text"
import { addOrRestyleHighlight, createHighlightPages, findSelectionHighlight } from "./text-highlights"
import { useSelectionSpeech } from "./useSelectionSpeech"

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
  onSelectionAiRequest: (request: SelectionAiRequest) => void
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

export function getSearchResultScrollTarget(result: SearchResult) {
  const rect = result.rects[0]
  return {
    pageNumber: result.pageIndex + 1,
    ...(rect
      ? {
          pageCoordinates: {
            x: rect.origin.x + rect.size.width / 2,
            y: rect.origin.y + rect.size.height / 2,
          },
          alignX: 50,
          alignY: 35,
        }
      : {}),
    behavior: "smooth" as const,
  }
}

function groupSearchResultsByPage(results: SearchResult[]) {
  const groups = new Map<number, Array<{ index: number; result: SearchResult }>>()
  results.forEach((result, index) => {
    const pageResults = groups.get(result.pageIndex) ?? []
    pageResults.push({ index, result })
    groups.set(result.pageIndex, pageResults)
  })
  return [...groups.entries()].map(([pageIndex, pageResults]) => ({ pageIndex, pageResults }))
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
  onSelectionAiRequest,
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
  const [railMode, setRailMode] = useState<"search" | "outline" | "highlights">("outline")
  const [outline, setOutline] = useState<PdfOutlineNode[]>([])
  const [outlineLoaded, setOutlineLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectionMenu, setSelectionMenu] = useState<PdfSelection | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const speech = useSelectionSpeech(setActionError)
  const selectionRevision = useRef(0)
  const [previousHighlights, setPreviousHighlights] = useState<PdfTextHighlight[] | null>(null)
  const [highlights, setHighlights] = useState<PdfTextHighlight[]>(initialView.highlights)
  const [fitMode, setFitMode] = useState<FitMode | null>(initialView.zoom > 0 ? null : "fit-page")
  const clearFitMode = useCallback(() => setFitMode(null), [])
  const [spreadPage, setSpreadPage] = useState(initialView.currentPage || 1)
  const documentState = useDocumentState(documentId)
  const currentPage = clampPage(spreadPage, scrollState.totalPages)
  const pageGroup = getPageGroup(currentPage, scrollState.totalPages, spreadMode !== SpreadMode.None)
  const navigatePage = useCallback(
    (direction: -1 | 1) => {
      if (!scroll) return
      const target = direction < 0 ? pageGroup.previous : pageGroup.next
      if (target) scroll.scrollToPage({ pageNumber: target, behavior: "instant" })
    },
    [pageGroup.next, pageGroup.previous, scroll],
  )
  const restoredViewApplied = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchResultsRef = useRef<HTMLDivElement>(null)
  const lastAutoNavigatedResult = useRef("")

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
    const invalidate = () => {
      selectionRevision.current += 1
      setSelectionMenu(null)
      onSelectionChange(null)
    }
    const stopBegin = scope.onBeginSelection(invalidate)
    const stopEndSelection = scope.onEndSelection(async () => {
      const revision = ++selectionRevision.current
      const formatted = scope.getFormattedSelection()
      // The SDK also ends drags that never intersected a second glyph.
      if (!formatted.length) {
        invalidate()
        return
      }
      setActionError(null)
      try {
        const textLines = await getSelectedTextPreservingVisualHyphens(registry, documentId, scope)
        if (revision !== selectionRevision.current) return
        const result = toPdfSelection(textLines, formatted)
        setSelectionMenu(result)
        onSelectionChange(result)
      } catch {
        if (revision !== selectionRevision.current) return
        invalidate()
        setActionError("선택한 텍스트를 읽지 못했습니다. 다시 선택해 주세요.")
      }
    })
    const stopEmptySpaceClick = scope.onEmptySpaceClick(invalidate)
    return () => {
      selectionRevision.current += 1
      stopBegin()
      stopEndSelection()
      stopEmptySpaceClick()
    }
  }, [documentId, onSelectionChange, registry, selection])

  useEffect(() => {
    onStatusChange({
      page: currentPage || 1,
      pageCount: scrollState.totalPages || 0,
      zoom: zoomState.currentZoomLevel || 1,
      rotation,
      phase: "ready",
    })
  }, [onStatusChange, rotation, currentPage, scrollState.totalPages, zoomState.currentZoomLevel])

  const openSearch = useCallback(() => {
    setRailOpen(true)
    setRailMode("search")
  }, [])

  const closeSearch = useCallback(() => {
    search?.stopSearch()
    setSearchQuery("")
    setRailMode("outline")
  }, [search])

  useEffect(() => {
    if (!railOpen || railMode !== "search") return
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [railMode, railOpen])

  const scrollToSearchResult = useCallback(
    (result: SearchResult) => scroll?.scrollToPage(getSearchResultScrollTarget(result)),
    [scroll],
  )

  const activateSearchResult = useCallback(
    (index: number) => {
      const result = searchState.results[index]
      if (!search || !result) return
      search.goToResult(index)
      scrollToSearchResult(result)
    },
    [scrollToSearchResult, search, searchState.results],
  )

  useEffect(() => {
    const result = searchState.results[searchState.activeResultIndex]
    if (railMode !== "search" || !result) return
    const resultKey = `${searchState.query}:${searchState.activeResultIndex}:${result.pageIndex}:${result.charIndex}`
    if (lastAutoNavigatedResult.current === resultKey) return
    lastAutoNavigatedResult.current = resultKey
    scrollToSearchResult(result)
    requestAnimationFrame(() => {
      const activeItem = searchResultsRef.current?.querySelector<HTMLElement>(
        `[data-search-result-index="${searchState.activeResultIndex}"]`,
      )
      activeItem?.scrollIntoView({ block: "nearest" })
    })
  }, [railMode, scrollToSearchResult, searchState.activeResultIndex, searchState.query, searchState.results])

  const runSearch = useCallback(() => {
    const query = searchQuery.trim()
    if (!query || !search) return
    openSearch()
    search.searchAllPages(query)
  }, [openSearch, search, searchQuery])

  const navigateSearchResult = useCallback(
    (direction: -1 | 1) => {
      if (!search) return
      const index = direction < 0 ? search.previousResult() : search.nextResult()
      const result = searchState.results[index]
      if (result) scrollToSearchResult(result)
    },
    [scrollToSearchResult, search, searchState.results],
  )

  const searchResultGroups = useMemo(
    () => groupSearchResultsByPage(searchState.results),
    [searchState.results],
  )

  const toggleSpread = useCallback(() => {
    if (!spread || !zoom) return
    spread.setSpreadMode(spreadMode === SpreadMode.None ? SpreadMode.Odd : SpreadMode.None)
    requestAnimationFrame(() => {
      setFitMode("fit-page")
      scroll?.scrollToPage({ pageNumber: currentPage, behavior: "instant" })
    })
  }, [currentPage, scroll, spread, spreadMode, zoom])

  const clearSelection = useCallback(() => {
    selectionRevision.current += 1
    selection?.forDocument(documentId).clear()
    setSelectionMenu(null)
    onSelectionChange(null)
  }, [documentId, onSelectionChange, selection])

  // biome-ignore lint/correctness/useExhaustiveDependencies: A newly displayed spread invalidates the previous selection and pending extraction.
  useEffect(() => clearSelection(), [currentPage, clearSelection])

  const askAboutSelection = useCallback(
    (prompt: string | null = null) => {
      if (!selectionMenu) return
      onSelectionAiRequest({ id: crypto.randomUUID(), selection: selectionMenu, prompt })
      clearSelection()
    },
    [clearSelection, onSelectionAiRequest, selectionMenu],
  )

  const copySelection = useCallback(async () => {
    if (!selectionMenu) return
    try {
      await navigator.clipboard.writeText(selectionMenu.text)
      clearSelection()
    } catch {
      setActionError("클립보드에 복사하지 못했습니다. 다시 시도해 주세요.")
    }
  }, [clearSelection, selectionMenu])

  const updateHighlights = useCallback(
    (next: PdfTextHighlight[]) => {
      setPreviousHighlights(highlights)
      setHighlights(next)
      onHighlightsChange(next)
    },
    [highlights, onHighlightsChange],
  )

  const highlightPages =
    selectionMenu && selection
      ? createHighlightPages(selectionMenu, selection.forDocument(documentId).getState())
      : []
  const existingHighlight = selectionMenu
    ? findSelectionHighlight(highlights, selectionMenu, highlightPages)
    : undefined

  const highlightSelection = useCallback(
    (style: PdfHighlightStyle, note?: string) => {
      if (!selection || !selectionMenu) return
      const pages = createHighlightPages(selectionMenu, selection.forDocument(documentId).getState())
      let next = addOrRestyleHighlight(highlights, selectionMenu, pages, style)
      if (note !== undefined) {
        const saved = findSelectionHighlight(next, selectionMenu, pages)
        next = next.map((item) => (item.id === saved?.id ? { ...item, note: note.trim() } : item))
      }
      updateHighlights(next)
      clearSelection()
    },
    [clearSelection, documentId, highlights, updateHighlights, selection, selectionMenu],
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

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault()
        openSearch()
      }
      if (mod && event.shiftKey && event.code === "KeyT") {
        event.preventDefault()
        setRailOpen((value) => !value)
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
        speech.stop()
        if (selectionMenu) clearSelection()
        else if (railMode === "search") closeSearch()
      }
      if (
        mod &&
        event.key.toLowerCase() === "c" &&
        selectionMenu &&
        !isEditableKeyboardTarget(event.target)
      ) {
        event.preventDefault()
        void copySelection()
      }

      if (
        !mod &&
        !event.altKey &&
        !event.isComposing &&
        !isEditableKeyboardTarget(event.target) &&
        selectionMenu
      ) {
        if (event.key.toLowerCase() === "h" || event.key.toLowerCase() === "u") {
          event.preventDefault()
          highlightSelection(event.key.toLowerCase() === "u" ? "red-underline" : "yellow")
          return
        }
      }
      const pageDirection = getPageNavigationDirection(event)
      if (!pageDirection || isEditableKeyboardTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      navigatePage(pageDirection)
    }
    window.addEventListener("keydown", keydown, true)
    return () => window.removeEventListener("keydown", keydown, true)
  }, [
    clearSelection,
    closeSearch,
    openSearch,
    railMode,
    navigatePage,
    selectionMenu,
    zoom,
    copySelection,
    highlightSelection,
    speech.stop,
  ])

  const renderPage = (page: PageLayout) => (
    <div
      className="pdf-page"
      style={{ width: page.rotatedWidth, height: page.rotatedHeight }}
      data-page-number={page.pageNumber}
    >
      <Rotate documentId={documentId} pageIndex={page.pageIndex}>
        <PagePointerProvider
          documentId={documentId}
          pageIndex={page.pageIndex}
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
            rotation={((documentState?.document?.pages[page.pageIndex]?.rotation ?? 0) + rotation) % 4}
            highlights={highlights}
            selectionMenu={
              selectionMenu?.pages[0]?.pageNumber === page.pageNumber
                ? (anchor) => (
                    <SelectionActions
                      anchor={anchor}
                      key={selectionKey}
                      onAskAI={() => askAboutSelection()}
                      onSummarize={() =>
                        askAboutSelection("선택한 구절을 3–5개의 핵심 항목으로 간결하게 요약해 주세요.")
                      }
                      hasHighlight={Boolean(existingHighlight)}
                      existingNote={existingHighlight?.note}
                      onNote={(note) => highlightSelection(existingHighlight?.style ?? "yellow", note)}
                      onRead={() => {
                        speech.read(selectionMenu.text)
                        clearSelection()
                      }}
                      onRemoveHighlight={() => {
                        updateHighlights(highlights.filter((item) => item.id !== existingHighlight?.id))
                        clearSelection()
                      }}
                      onClose={clearSelection}
                      onHighlight={highlightSelection}
                      onCopy={copySelection}
                    />
                  )
                : undefined
            }
          />
        </PagePointerProvider>
      </Rotate>
    </div>
  )

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
            onClick={() => navigatePage(-1)}
            disabled={pageGroup.previous === null}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <label className="page-input">
            <span className="sr-only">현재 페이지</span>
            <input
              value={currentPage || 1}
              inputMode="numeric"
              onChange={(event) =>
                scroll?.scrollToPage({
                  pageNumber: clampPage(Number(event.target.value), scrollState.totalPages),
                })
              }
            />
            <span>/ {scrollState.totalPages || "—"}</span>
          </label>
          <IconButton label="다음 페이지" onClick={() => navigatePage(1)} disabled={pageGroup.next === null}>
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
          <select
            className="zoom-value"
            aria-label="확대/축소 배율"
            value={fitMode ?? String(zoomState.currentZoomLevel)}
            onChange={(event) => {
              const value = event.target.value
              if (value === ZoomMode.FitPage || value === ZoomMode.FitWidth) setFitMode(value)
              else {
                setFitMode(null)
                zoom?.requestZoom(Number(value))
              }
            }}
          >
            <option value={ZoomMode.FitPage}>
              페이지 맞춤 (Fit Page)
              {fitMode === "fit-page" ? ` · ${Math.round(zoomState.currentZoomLevel * 100)}%` : ""}
            </option>
            <option value={ZoomMode.FitWidth}>
              너비 맞춤 (Fit Width)
              {fitMode === "fit-width" ? ` · ${Math.round(zoomState.currentZoomLevel * 100)}%` : ""}
            </option>
            {!fitMode &&
              ![0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5].includes(zoomState.currentZoomLevel) && (
                <option value={zoomState.currentZoomLevel}>
                  {Math.round(zoomState.currentZoomLevel * 100)}%
                </option>
              )}
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {level * 100}%
              </option>
            ))}
          </select>
          <IconButton label="확대" onClick={() => zoom?.zoomIn()}>
            <ZoomIn size={16} />
          </IconButton>
          <IconButton label="시계 방향으로 회전" onClick={() => rotate?.rotateForward()}>
            <RotateCw size={16} />
          </IconButton>
          <IconButton label="문서 검색" onClick={openSearch}>
            <Search size={16} />
          </IconButton>
          <IconButton label="문서 닫기" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </header>

      {previousHighlights && (
        <div className="reader-action-status" role="status">
          하이라이트·주석 변경됨
          <button
            type="button"
            onClick={() => {
              setHighlights(previousHighlights)
              onHighlightsChange(previousHighlights)
              setPreviousHighlights(null)
            }}
          >
            되돌리기
          </button>
        </div>
      )}
      {actionError && (
        <div className="reader-action-status" role="alert">
          {actionError}
          <button type="button" onClick={() => setActionError(null)}>
            닫기
          </button>
        </div>
      )}
      {speech.reading && (
        <div className="reader-action-status" role="status">
          선택한 구절 읽는 중
          <button type="button" onClick={speech.stop}>
            <Square size={12} /> 읽기 중지
          </button>
        </div>
      )}
      <div className="reader-content">
        {railOpen && (
          <aside className="navigation-rail">
            <div className="rail-tabs" role="tablist" aria-label="문서 탐색">
              <button type="button" role="tab" aria-selected={railMode === "search"} onClick={openSearch}>
                <Search size={14} /> 검색
              </button>
              <button type="button" role="tab" aria-selected={railMode === "outline"} onClick={closeSearch}>
                <ListTree size={14} /> 목차
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={railMode === "highlights"}
                onClick={() => setRailMode("highlights")}
              >
                <Highlighter size={14} /> 주석
              </button>
            </div>
            {railMode === "highlights" ? (
              <HighlightsPanel
                highlights={highlights}
                onChange={updateHighlights}
                onNavigate={(pageNumber) => scroll?.scrollToPage({ pageNumber, behavior: "instant" })}
              />
            ) : railMode === "search" ? (
              <section className="search-panel" aria-label="PDF 검색 결과">
                <form
                  className="rail-search-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    runSearch()
                  }}
                >
                  <div className="search-query-row">
                    <Search size={14} aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="PDF에서 검색"
                      aria-label="PDF 검색어"
                    />
                    <IconButton label="검색 닫기" onClick={closeSearch}>
                      <X size={14} />
                    </IconButton>
                  </div>
                  <div className="search-result-controls">
                    <span aria-live="polite">
                      {searchState.loading
                        ? "검색 중…"
                        : searchState.query
                          ? `${searchState.total}개 결과`
                          : "검색어를 입력하세요"}
                    </span>
                    <div>
                      <IconButton
                        label="이전 검색 결과"
                        onClick={() => navigateSearchResult(-1)}
                        disabled={!searchState.total}
                      >
                        <ChevronLeft size={14} />
                      </IconButton>
                      <IconButton
                        label="다음 검색 결과"
                        onClick={() => navigateSearchResult(1)}
                        disabled={!searchState.total}
                      >
                        <ChevronRight size={14} />
                      </IconButton>
                    </div>
                  </div>
                </form>

                <div className="search-results" ref={searchResultsRef}>
                  {searchResultGroups.map(({ pageIndex, pageResults }) => (
                    <section className="search-page-group" key={pageIndex}>
                      <header>
                        <strong>p. {pageIndex + 1}</strong>
                        <span>{pageResults.length}개</span>
                      </header>
                      <ol>
                        {pageResults.map(({ index, result }) => (
                          <li key={`${result.pageIndex}-${result.charIndex}`}>
                            <button
                              type="button"
                              className="search-result-item"
                              aria-current={searchState.activeResultIndex === index ? "true" : undefined}
                              data-search-result-index={index}
                              onClick={() => activateSearchResult(index)}
                            >
                              <span>
                                {result.context.truncatedLeft ? "…" : ""}
                                {result.context.before}
                                <mark>{result.context.match}</mark>
                                {result.context.after}
                                {result.context.truncatedRight ? "…" : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                  {!searchState.loading && searchState.query && !searchState.total && (
                    <div className="search-empty">
                      <Search size={18} />
                      <p>일치하는 구절이 없습니다.</p>
                    </div>
                  )}
                </div>
              </section>
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
          <PaginatedViewport
            documentId={documentId}
            initialPage={spreadPage}
            fitMode={fitMode}
            onManualZoom={clearFitMode}
            onPageChange={setSpreadPage}
            renderPage={renderPage}
          />
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
