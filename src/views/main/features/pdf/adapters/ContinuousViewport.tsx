import { type PageLayout, type ScrollerLayout, useScrollPlugin } from "@embedpdf/plugin-scroll/react"
import {
  useIsViewportGated,
  useViewportPlugin,
  ViewportElementContext,
} from "@embedpdf/plugin-viewport/react"
import { useZoomPlugin } from "@embedpdf/plugin-zoom/react"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import type { CropInsets } from "./auto-crop"
import { type FitMode, resolveViewportZoom } from "./fit-zoom"

/**
 * Continuous vertical scrolling through every page, virtualized by the scroll
 * plugin. With margin cropping on, the side margins are clipped and the fit
 * zoom uses the text width; top and bottom margins stay so page positions
 * keep matching the SDK's coordinates.
 */
export function ContinuousViewport({
  documentId,
  fitMode,
  crop,
  onManualZoom,
  renderPage,
}: {
  documentId: string
  fitMode: FitMode | null
  crop: CropInsets | null
  onManualZoom: () => void
  renderPage: (page: PageLayout) => ReactNode
}) {
  const { plugin: scrollPlugin } = useScrollPlugin()
  const { plugin: viewportPlugin } = useViewportPlugin()
  const { plugin: zoomPlugin } = useZoomPlugin()
  const gated = useIsViewportGated(documentId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<ScrollerLayout | null>(null)
  const applyingFit = useRef(false)
  const gap = viewportPlugin?.provides().getViewportGap() ?? 16

  const widest = layout ? Math.max(0, ...layout.items.map((item) => item.width)) : 0
  const insetLeft = crop ? crop.left * widest : 0
  const insetRight = crop ? crop.right * widest : 0
  const inset = useRef({ left: insetLeft, right: insetRight })
  inset.current = { left: insetLeft, right: insetRight }

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
    if (!scrollPlugin) return
    const stop = scrollPlugin.onScrollerData(documentId, setLayout)
    return () => {
      stop()
      setLayout(null)
      scrollPlugin.clearLayoutReady(documentId)
    }
  }, [documentId, scrollPlugin])

  useLayoutEffect(() => {
    if (scrollPlugin && layout) scrollPlugin.setLayoutReady(documentId)
  }, [documentId, layout, scrollPlugin])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!viewportPlugin || !container) return
    viewportPlugin.registerViewport(documentId)
    const metrics = () => ({
      width: container.offsetWidth,
      height: container.offsetHeight,
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft + inset.current.left,
      scrollWidth: container.scrollWidth + inset.current.left + inset.current.right,
      scrollHeight: container.scrollHeight,
      clientLeft: container.clientLeft,
      clientTop: container.clientTop,
    })
    const scroll = () =>
      viewportPlugin.setViewportScrollMetrics(documentId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft + inset.current.left,
      })
    const resize = () => viewportPlugin.setViewportResizeMetrics(documentId, metrics())
    container.addEventListener("scroll", scroll)
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    const stopRequests = viewportPlugin.onScrollRequest(documentId, ({ x, y, behavior = "auto" }) => {
      requestAnimationFrame(() =>
        container.scrollTo({ left: Math.max(0, x - inset.current.left), top: y, behavior }),
      )
    })
    resize()
    return () => {
      container.removeEventListener("scroll", scroll)
      observer.disconnect()
      stopRequests()
      viewportPlugin.unregisterViewport(documentId)
    }
  }, [documentId, viewportPlugin])

  // Report again when cropping changes what the viewport shows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The insets are read through a ref.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !viewportPlugin) return
    viewportPlugin.setViewportScrollMetrics(documentId, {
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft + insetLeft,
    })
  }, [documentId, insetLeft, viewportPlugin])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !zoomPlugin || !viewportPlugin || !layout) return
    const applyZoom = () => {
      if (!container.clientWidth || !container.clientHeight) return
      const zoom = zoomPlugin.provides().forDocument(documentId)
      const zoomState = zoom.getState()
      const initializing = viewportPlugin.provides().forDocument(documentId).hasGate("zoom")
      const current = zoomState.currentZoomLevel || 1
      const pageWidth = (widest - insetLeft - insetRight) / current
      const currentPage = scrollPlugin?.provides().forDocument(documentId).getCurrentPage() ?? 1
      const pageHeight =
        (layout.items.find((item) => item.pageNumbers.includes(currentPage))?.height ??
          Math.max(0, ...layout.items.map((item) => item.height))) / current
      let fitZoom: number | null = null
      if (fitMode && pageWidth > 0 && pageHeight > 0) {
        const width = (container.clientWidth - gap * 2) / pageWidth
        const value =
          fitMode === "fit-width" ? width : Math.min(width, (container.clientHeight - gap * 2) / pageHeight)
        fitZoom = Math.floor(Math.min(5, Math.max(0.25, value)) * 1000) / 1000
      }
      const target = resolveViewportZoom({
        fitZoom,
        savedZoom: typeof zoomState.zoomLevel === "number" ? zoomState.zoomLevel : null,
        currentZoom: zoomState.currentZoomLevel,
        initializing,
      })
      if (target === null) return
      applyingFit.current = true
      try {
        zoom.requestZoom(target)
      } finally {
        applyingFit.current = false
      }
    }
    applyZoom()
    const observer = new ResizeObserver(applyZoom)
    observer.observe(container)
    return () => observer.disconnect()
  }, [
    documentId,
    fitMode,
    gap,
    insetLeft,
    insetRight,
    layout,
    scrollPlugin,
    viewportPlugin,
    widest,
    zoomPlugin,
  ])

  return (
    <ViewportElementContext.Provider value={containerRef as React.RefObject<HTMLDivElement>}>
      <div ref={containerRef} className="pdf-viewport pdf-continuous-viewport" style={{ padding: gap }}>
        {!gated && layout && (
          <div
            className="pdf-continuous-clip"
            style={{ width: layout.totalWidth - insetLeft - insetRight, height: layout.totalHeight }}
          >
            <div
              className="pdf-continuous-content"
              style={{ width: layout.totalWidth, height: layout.totalHeight, marginLeft: -insetLeft }}
            >
              <div style={{ height: layout.startSpacing }} />
              <div className="pdf-continuous-pages" style={{ gap: layout.pageGap }}>
                {layout.items.map((item) => (
                  <div
                    key={item.pageNumbers.join("-")}
                    className="pdf-continuous-item"
                    style={{ gap: layout.pageGap }}
                  >
                    {item.pageLayouts.map((page) => (
                      <div
                        key={page.pageNumber}
                        style={{
                          position: "relative",
                          width: page.rotatedWidth,
                          height: page.rotatedHeight,
                          zIndex: page.elevated ? 1 : undefined,
                        }}
                      >
                        {renderPage(page)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ height: layout.endSpacing }} />
            </div>
          </div>
        )}
      </div>
    </ViewportElementContext.Provider>
  )
}
