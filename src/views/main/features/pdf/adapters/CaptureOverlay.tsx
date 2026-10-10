import type { PluginRegistry } from "@embedpdf/core"
import type { PdfTask } from "@embedpdf/models"
import { useEffect, useRef, useState } from "react"
import type { CaptureAsset } from "../../../../../shared/study/contracts"
import { dragRect, unrotatePoint } from "../../../../../shared/study/geometry"
import { nativeDocument } from "./study-analysis"

export function CaptureOverlay({
  registry,
  documentId,
  sourceId,
  documentHash,
  pageIndex,
  width,
  height,
  rotation,
  scale,
  onCapture,
  onError,
}: {
  registry: PluginRegistry
  documentId: string
  sourceId: string
  documentHash: string
  pageIndex: number
  width: number
  height: number
  rotation: number
  scale: number
  onCapture: (asset: CaptureAsset) => void
  onError: (message: string) => void
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const mounted = useRef(true)
  const rendering = useRef<Pick<PdfTask<unknown>, "abort"> | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      rendering.current?.abort({ code: 5, message: "Capture cancelled" })
    }
  }, [])
  const [display, setDisplay] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const point = (event: React.PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale }
  }
  const capture = async (end: { x: number; y: number }) => {
    const begin = start.current
    start.current = null
    if (!begin || busy) return
    const rect = dragRect(
      unrotatePoint(begin.x, begin.y, width, height, rotation),
      unrotatePoint(end.x, end.y, width, height, rotation),
      width,
      height,
    )
    if (rect.width < 8 || rect.height < 8) {
      setDisplay(null)
      return
    }
    setBusy(true)
    try {
      const { rpc } = await import("../../../rpc")
      const doc = nativeDocument(registry, documentId),
        page = doc.pages[pageIndex]
      if (!page) throw new Error("PDF 페이지를 찾지 못했습니다.")
      const factor = Math.min(3, 2048 / Math.max(rect.width, rect.height))
      const task = registry
        .getEngine()
        .renderPageRectRaw(
          doc,
          page,
          { origin: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } },
          { scaleFactor: factor, dpr: 1, rotation: 0 },
        )
      rendering.current = task
      const image = await task.toPromise()
      if (!mounted.current) return
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext("2d")
      if (!context) throw new Error("이미지 렌더러를 준비하지 못했습니다.")
      context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
      const asset = await rpc.request["study.capture.save"]({
        documentId: sourceId,
        capture: {
          id: "",
          documentHash,
          pageIndex,
          rect,
          width: image.width,
          height: image.height,
          dataUrl: canvas.toDataURL("image/png"),
          createdAt: new Date().toISOString(),
        },
      })
      if (mounted.current) onCapture(asset)
      else
        await rpc.request["study.capture.remove"]({ documentId: sourceId, captureId: asset.id }).catch(
          () => undefined,
        )
    } catch (cause) {
      if (mounted.current) onError(cause instanceof Error ? cause.message : "그림을 캡처하지 못했습니다.")
    } finally {
      rendering.current = null
      if (mounted.current) {
        setBusy(false)
        setDisplay(null)
      }
    }
  }
  return (
    <section
      className="capture-overlay"
      aria-label="그림이나 표 영역을 드래그하여 캡처"
      onPointerDown={(event) => {
        if (busy) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = point(event)
      }}
      onPointerMove={(event) => {
        if (!start.current) return
        const end = point(event)
        setDisplay(dragRect(start.current, end, rotation % 2 ? height : width, rotation % 2 ? width : height))
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void capture(point(event))
      }}
      onPointerCancel={() => {
        start.current = null
        setDisplay(null)
      }}
    >
      <span className="capture-instruction">
        {busy ? "이미지 준비 중…" : "그림·표 영역을 드래그하세요 · Esc 취소"}
      </span>
      {display && (
        <span
          className="capture-drag-rect"
          style={{
            left: display.x * scale,
            top: display.y * scale,
            width: display.width * scale,
            height: display.height * scale,
          }}
        />
      )}
    </section>
  )
}
