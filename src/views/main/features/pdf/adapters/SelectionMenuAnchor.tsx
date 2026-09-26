import type { ReactNode } from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { SelectionHighlightRect } from "./selection-highlight"

export type SelectionMenuRenderer = (anchor: DOMRect) => ReactNode

/** Measure the real paginated/rotated page, not the SDK's virtual scroll layout. */
export function SelectionMenuAnchor({
  rects,
  scale,
  rotation,
  children,
}: {
  rects: SelectionHighlightRect[]
  scale: number
  rotation: number
  children: SelectionMenuRenderer
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const left = Math.min(...rects.map((rect) => rect.origin.x))
  const top = Math.min(...rects.map((rect) => rect.origin.y))
  const right = Math.max(...rects.map((rect) => rect.origin.x + rect.size.width))
  const bottom = Math.max(...rects.map((rect) => rect.origin.y + rect.size.height))

  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-measure DOM after page geometry, scale or rotation changes.
  useLayoutEffect(() => {
    const element = ref.current
    const viewport = element?.closest(".pdf-viewport")
    if (!element || !viewport) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      const visible = viewport.getBoundingClientRect()
      setAnchor(
        bounds.bottom > visible.top &&
          bounds.top < visible.bottom &&
          bounds.right > visible.left &&
          bounds.left < visible.right
          ? bounds
          : null,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [left, top, right, bottom, scale, rotation])

  if (!rects.length) return null
  return (
    <>
      <span
        ref={ref}
        aria-hidden="true"
        style={{
          position: "absolute",
          pointerEvents: "none",
          left: left * scale,
          top: top * scale,
          width: (right - left) * scale,
          height: (bottom - top) * scale,
        }}
      />
      {anchor && createPortal(children(anchor), document.body)}
    </>
  )
}
