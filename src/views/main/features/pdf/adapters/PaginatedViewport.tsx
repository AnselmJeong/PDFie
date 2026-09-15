import { useDocumentState } from "@embedpdf/core/react"
import { type LayoutChangePayload, type PageLayout, useScrollPlugin } from "@embedpdf/plugin-scroll/react"
import {
  useIsViewportGated,
  useViewportPlugin,
  ViewportElementContext,
} from "@embedpdf/plugin-viewport/react"
import { useZoomPlugin } from "@embedpdf/plugin-zoom/react"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { calculateFitZoom, type FitMode, resolveViewportZoom } from "./fit-zoom"

/**
 * Present one spread, while translating local scroll offsets into the SDK's
 * document coordinates. Search, tiling and zoom still use the same scroll API.
 */
export function PaginatedViewport({
  documentId,
  initialPage,
  fitMode,
  onManualZoom,
  onPageChange,
  renderPage,
}: {
  documentId: string
  initialPage: number
  fitMode: FitMode | null
  onManualZoom: () => void
  onPageChange: (page: number) => void
  renderPage: (page: PageLayout) => ReactNode
}) {
  const { plugin: scrollPlugin } = useScrollPlugin()
  const { plugin: viewportPlugin } = useViewportPlugin()
  const { plugin: zoomPlugin } = useZoomPlugin()
  const applyingFit = useRef(false)
  const documentState = useDocumentState(documentId)
  const scale = documentState?.scale ?? 1
  const gated = useIsViewportGated(documentId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pageNumber, setPageNumber] = useState(initialPage)
  const [layout, setLayout] = useState<LayoutChangePayload | null>(null)
  const pendingScroll = useRef<{ x: number; y: number } | null>(null)
  const pageRef = useRef(initialPage)
  const reportRef = useRef(() => {})
  const item =
    layout?.virtualItems.find((item) => item.pageNumbers.includes(pageNumber)) ?? layout?.virtualItems[0]
  const contentWidth = (item?.width ?? 0) * scale
  const documentWidth = (layout?.totalContentSize.width ?? 0) * scale
  const contentHeight = (layout?.totalContentSize.height ?? 0) * scale
  const gap = viewportPlugin?.provides().getViewportGap() ?? 16

  useLayoutEffect(() => {
    if (!zoomPlugin) return
    return zoomPlugin
      .provides()
      .forDocument(documentId)
      .onZoomChange((event) => {
        if (!applyingFit.current && event.oldZoom !== event.newZoom) onManualZoom()
      })
  }, [documentId, onManualZoom, zoomPlugin])

  useLayoutEffect(() => {
    if (!scrollPlugin || !viewportPlugin) return
    const scope = scrollPlugin.provides().forDocument(documentId)
    viewportPlugin.registerViewport(documentId)
    setLayout(scope.getLayout())
    const stopLayout = scope.onLayoutChange(setLayout)
    let lastPageChange = scope.getPageChangeState()
    const stopRequests = viewportPlugin.onScrollRequest(documentId, ({ x, y }) => {
      const change = scope.getPageChangeState()
      if (change !== lastPageChange) {
        lastPageChange = change
        pageRef.current = change.targetPage
        setPageNumber(change.targetPage)
      }
      pendingScroll.current = { x, y }
      // Also handles requests within the current spread (search and zoom).
      requestAnimationFrame(() => reportRef.current())
    })
    return () => {
      stopLayout()
      stopRequests()
      scrollPlugin.clearLayoutReady(documentId)
      viewportPlugin.unregisterViewport(documentId)
    }
  }, [documentId, scrollPlugin, viewportPlugin])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !viewportPlugin || !scrollPlugin || !item) return
    const report = () => {
      // Wait for React to mount the target spread before applying its offset.
      if (!item.pageNumbers.includes(pageRef.current)) return
      const centerY = Math.max(0, (container.clientHeight - gap * 2 - item.height * scale) / 2)
      const offsetY = item.y * scale - centerY
      const centerX = Math.max(0, (container.clientWidth - gap * 2 - contentWidth) / 2)
      const offsetX = (documentWidth - contentWidth) / 2 - centerX
      const requested = pendingScroll.current
      if (requested) {
        pendingScroll.current = null
        container.scrollTo({
          left: Math.max(0, requested.x - offsetX),
          top: Math.max(0, requested.y - offsetY),
          behavior: "instant",
        })
      }
      const previous = viewportPlugin.provides().forDocument(documentId).getMetrics()
      const metrics = {
        width: container.offsetWidth,
        height: container.offsetHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        scrollLeft: container.scrollLeft + offsetX,
        scrollTop: container.scrollTop + offsetY,
        scrollWidth: Math.max(container.clientWidth, documentWidth + gap * 2),
        scrollHeight: Math.max(container.clientHeight, contentHeight + gap * 2),
        clientLeft: container.clientLeft,
        clientTop: container.clientTop,
      }
      if (
        previous.clientWidth !== metrics.clientWidth ||
        previous.clientHeight !== metrics.clientHeight ||
        previous.scrollWidth !== metrics.scrollWidth ||
        previous.scrollHeight !== metrics.scrollHeight
      ) {
        viewportPlugin.setViewportResizeMetrics(documentId, metrics)
      } else {
        viewportPlugin.setViewportScrollMetrics(documentId, metrics)
      }
    }
    const applyZoom = () => {
      if (!zoomPlugin || !container.clientWidth || !container.clientHeight) return
      const zoom = zoomPlugin.provides().forDocument(documentId)
      const zoomState = zoom.getState()
      const initializing = viewportPlugin.provides().forDocument(documentId).hasGate("zoom")
      // Numeric defaults do not initialize the SDK's zoom plugin automatically.
      // Apply the saved level once the viewport is measured, even at 100%, so
      // the zoom plugin releases its render gate through its normal request API.
      const target = resolveViewportZoom({
        fitZoom: fitMode
          ? calculateFitZoom(
              fitMode,
              item,
              { width: container.clientWidth, height: container.clientHeight },
              gap,
            )
          : null,
        savedZoom: typeof zoomState.zoomLevel === "number" ? zoomState.zoomLevel : null,
        currentZoom: zoomState.currentZoomLevel,
        initializing,
      })
      if (target === null) return
      applyingFit.current = true
      try {
        zoom.requestZoom(target)
        // Initial and fit zoom start at the top and left of the visible spread. Its
        // centering margins are added by the viewport, not the document layout.
        const centerY = Math.max(0, (container.clientHeight - gap * 2 - item.height * target) / 2)
        const centerX = Math.max(0, (container.clientWidth - gap * 2 - item.width * target) / 2)
        pendingScroll.current = {
          x: (((layout?.totalContentSize.width ?? item.width) - item.width) * target) / 2 - centerX,
          y: item.y * target - centerY,
        }
      } finally {
        applyingFit.current = false
      }
    }
    reportRef.current = report
    report()
    scrollPlugin.setLayoutReady(documentId)
    onPageChange(pageNumber)
    container.addEventListener("scroll", report)
    const observer = new ResizeObserver(() => {
      report()
      applyZoom()
    })
    observer.observe(container)
    applyZoom()
    return () => {
      reportRef.current = () => {}
      container.removeEventListener("scroll", report)
      observer.disconnect()
    }
  }, [
    contentHeight,
    contentWidth,
    documentWidth,
    fitMode,
    layout,
    zoomPlugin,
    documentId,
    gap,
    item,
    scale,
    onPageChange,
    pageNumber,
    scrollPlugin,
    viewportPlugin,
  ])

  return (
    <ViewportElementContext.Provider value={containerRef}>
      <div ref={containerRef} className="pdf-viewport pdf-paginated-viewport" style={{ padding: gap }}>
        {!gated && item && (
          <div className="pdf-spread" style={{ width: contentWidth, height: item.height * scale }}>
            {item.pageLayouts.map((page) => (
              <div
                key={page.pageIndex}
                style={{
                  position: "absolute",
                  left: page.x * scale,
                  top: page.y * scale,
                  width: page.rotatedWidth * scale,
                  height: page.rotatedHeight * scale,
                }}
              >
                {renderPage({
                  ...page,
                  width: page.width * scale,
                  height: page.height * scale,
                  rotatedWidth: page.rotatedWidth * scale,
                  rotatedHeight: page.rotatedHeight * scale,
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </ViewportElementContext.Provider>
  )
}
