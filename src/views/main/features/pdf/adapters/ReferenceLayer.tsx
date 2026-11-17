import { useCursor, usePointerHandlers } from "@embedpdf/plugin-interaction-manager/react"
import { useEffect, useRef, useState } from "react"
import { hitTest, type PageReference, type ReferenceIndex } from "./reference-index"

export interface ReferenceHover {
  reference: PageReference
  pageIndex: number
  clientX: number
  clientY: number
}

const CLICK_DISTANCE = 3

/**
 * Makes a page's PDF links and "Figure 3" / "[23]" references respond to the
 * pointer without blocking text selection: it listens alongside the selection
 * handlers, previews on hover and follows only a click that did not drag.
 */
export function ReferenceLayer({
  documentId,
  pageIndex,
  scale,
  index,
  onHover,
  onActivate,
}: {
  documentId: string
  pageIndex: number
  scale: number
  index: ReferenceIndex
  onHover: (hover: ReferenceHover | null) => void
  onActivate: (reference: PageReference, pageIndex: number) => void
}) {
  const [references, setReferences] = useState<PageReference[]>([])
  const [hovered, setHovered] = useState<PageReference | null>(null)
  const { register } = usePointerHandlers({ documentId, pageIndex, modeId: "pointerMode" })
  const { setCursor, removeCursor } = useCursor(documentId)
  const latest = useRef({ references, hovered, onHover, onActivate })
  latest.current = { references, hovered, onHover, onActivate }

  useEffect(() => {
    let cancelled = false
    const load = () =>
      void index.page(pageIndex).then((items) => {
        if (!cancelled) setReferences(index.visible(pageIndex, items))
      })
    load()
    const stop = index.subscribe(load)
    return () => {
      cancelled = true
      stop()
    }
  }, [index, pageIndex])

  useEffect(() => {
    const cursorToken = `pdfie-reference-${pageIndex}`
    let down: { x: number; y: number; reference: PageReference } | null = null
    const update = (reference: PageReference | null, clientX: number, clientY: number) => {
      const current = latest.current
      if (reference === current.hovered) return
      setHovered(reference)
      if (reference) setCursor(cursorToken, "pointer", 5)
      else removeCursor(cursorToken)
      current.onHover(reference ? { reference, pageIndex, clientX, clientY } : null)
    }
    const stop = register({
      onPointerMove: (position, event) => {
        // A drag in progress is a text selection, not a hover.
        if (down && Math.hypot(position.x - down.x, position.y - down.y) > CLICK_DISTANCE) down = null
        update(hitTest(latest.current.references, position), event.clientX, event.clientY)
      },
      onPointerDown: (position) => {
        const reference = hitTest(latest.current.references, position)
        down = reference ? { x: position.x, y: position.y, reference } : null
      },
      onPointerUp: (position) => {
        const pressed = down
        down = null
        if (!pressed || Math.hypot(position.x - pressed.x, position.y - pressed.y) > CLICK_DISTANCE) return
        if (hitTest(latest.current.references, position) !== pressed.reference) return
        latest.current.onActivate(pressed.reference, pageIndex)
      },
      onPointerLeave: (_position, event) => update(null, event.clientX, event.clientY),
    })
    return () => {
      stop?.()
      removeCursor(cursorToken)
    }
  }, [pageIndex, register, removeCursor, setCursor])

  if (!hovered) return null
  return (
    <div className="reference-layer" aria-hidden="true">
      {hovered.rects.map((rect) => (
        <span
          key={`${rect.x}-${rect.y}-${rect.width}-${rect.height}`}
          className="reference-hover"
          style={{
            left: rect.x * scale - 1,
            top: rect.y * scale - 1,
            width: rect.width * scale + 2,
            height: rect.height * scale + 2,
          }}
        />
      ))}
    </div>
  )
}
