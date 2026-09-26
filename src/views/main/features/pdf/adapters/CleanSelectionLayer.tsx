import type { Rect } from "@embedpdf/models"
import { useSelectionPlugin } from "@embedpdf/plugin-selection/react"
import { useEffect, useMemo, useState } from "react"
import type { PdfTextHighlight } from "../../../../../shared/pdf/domain"
import { SelectionMenuAnchor, type SelectionMenuRenderer } from "./SelectionMenuAnchor"
import { createPreciseSelectionHighlightRects, selectionHighlightRectsOverlap } from "./selection-highlight"

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
  rotation: number
  highlights: PdfTextHighlight[]
  selectionMenu?: SelectionMenuRenderer
}) {
  const { plugin } = useSelectionPlugin()
  const [rects, setRects] = useState<Rect[]>([])

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
  const visibleSavedHighlights = useMemo(
    () =>
      savedHighlights.filter(({ rect }) => {
        const savedRect = {
          origin: { x: rect.x, y: rect.y },
          size: { width: rect.width, height: rect.height },
        }
        return !rects.some((selectionRect) => selectionHighlightRectsOverlap(savedRect, selectionRect))
      }),
    [rects, savedHighlights],
  )
  return (
    <>
      <div className="clean-selection-layer" aria-hidden="true">
        {visibleSavedHighlights.map(({ annotation, rect }) => (
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
      {selectionMenu && rects.length > 0 && (
        <SelectionMenuAnchor rects={rects} scale={scale} rotation={rotation}>
          {selectionMenu}
        </SelectionMenuAnchor>
      )}
    </>
  )
}
