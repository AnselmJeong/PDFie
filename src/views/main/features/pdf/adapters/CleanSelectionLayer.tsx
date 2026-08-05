import type { Rect, Rotation } from "@embedpdf/models"
import type { SelectionMenuPlacement } from "@embedpdf/plugin-selection"
import { type SelectionSelectionMenuRenderFn, useSelectionPlugin } from "@embedpdf/plugin-selection/react"
import { CounterRotate } from "@embedpdf/utils/react"
import { useEffect, useMemo, useState } from "react"
import type { PdfTextHighlight } from "../../../../../shared/pdf/domain"
import { createPreciseSelectionHighlightRects } from "./selection-highlight"

export function CleanSelectionLayer({
  documentId,
  pageIndex,
  scale,
  rotation,
  highlights,
  selectionMenu,
}: {
  documentId: string
  pageIndex: number
  scale: number
  rotation: Rotation
  highlights: PdfTextHighlight[]
  selectionMenu?: SelectionSelectionMenuRenderFn
}) {
  const { plugin } = useSelectionPlugin()
  const [rects, setRects] = useState<Rect[]>([])
  const [placement, setPlacement] = useState<SelectionMenuPlacement | null>(null)

  useEffect(() => {
    if (!plugin) return
    return plugin.registerSelectionOnPage({
      documentId,
      pageIndex,
      onRectsChange: ({ rects: nextRects }) => {
        if (nextRects.length === 0) {
          setRects([])
          return
        }
        const state = plugin.provides().forDocument(documentId).getState()
        setRects(
          createPreciseSelectionHighlightRects(state.geometry[pageIndex], state.slices[pageIndex], nextRects),
        )
      },
    })
  }, [documentId, pageIndex, plugin])

  useEffect(() => {
    if (!plugin) return
    return plugin.onMenuPlacement(documentId, setPlacement)
  }, [documentId, plugin])

  const savedHighlights = useMemo(
    () =>
      highlights.flatMap((highlight) =>
        (highlight.pages.find((page) => page.pageNumber === pageIndex + 1)?.rects ?? []).map((rect) => ({
          annotation: highlight,
          rect,
        })),
      ),
    [highlights, pageIndex],
  )
  return (
    <>
      <div className="clean-selection-layer" aria-hidden="true">
        {savedHighlights.map(({ annotation, rect }) => (
          <span
            key={`${annotation.id}-${rect.x}-${rect.y}-${rect.width}-${rect.height}`}
            className="saved-text-highlight"
            data-style={annotation.style}
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
            }}
          />
        ))}
        {rects.map((rect) => (
          <span
            key={`${rect.origin.x}-${rect.origin.y}-${rect.size.width}-${rect.size.height}`}
            className="clean-selection-highlight"
            style={{
              left: rect.origin.x * scale,
              top: rect.origin.y * scale,
              width: rect.size.width * scale,
              height: rect.size.height * scale,
            }}
          />
        ))}
      </div>
      {selectionMenu && placement?.pageIndex === pageIndex && placement.isVisible && (
        <CounterRotate
          rect={{
            origin: {
              x: placement.rect.origin.x * scale,
              y: placement.rect.origin.y * scale,
            },
            size: {
              width: placement.rect.size.width * scale,
              height: placement.rect.size.height * scale,
            },
          }}
          rotation={rotation}
        >
          {(props) =>
            selectionMenu({
              ...props,
              context: { type: "selection", pageIndex },
              selected: true,
              placement,
            })
          }
        </CounterRotate>
      )}
    </>
  )
}
