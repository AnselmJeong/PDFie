import { LockModeType, useAnnotationCapability } from "@embedpdf/plugin-annotation/react"
import { useHistoryCapability } from "@embedpdf/plugin-history/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { reviveAnnotation, serializeAnnotation } from "../../../../../shared/pdf/annotation-export"
import type { PdfMark } from "../../../../../shared/pdf/domain"

/** Mark tools offered in the toolbar, mapped to EmbedPDF annotation tool IDs. */
export const MARK_TOOLS = [
  { id: "ink", label: "펜" },
  { id: "inkHighlighter", label: "형광펜" },
  { id: "line", label: "직선" },
  { id: "lineArrow", label: "화살표" },
  { id: "square", label: "사각형" },
  { id: "circle", label: "원" },
  { id: "freeText", label: "텍스트" },
  { id: "textComment", label: "메모" },
] as const
export type MarkToolId = (typeof MARK_TOOLS)[number]["id"] | "select" | "eraser"

export const MARK_COLORS = ["#E11D48", "#2563EB", "#16A34A", "#F59E0B", "#111827"] as const
export const MARK_WIDTHS = [1, 2, 4] as const

const SAVE_DELAY_MS = 400

/** Apply color and stroke width to every drawing tool's defaults. */
function toolDefaults(toolId: string, color: string, width: number): Record<string, unknown> {
  switch (toolId) {
    case "inkHighlighter":
      return { strokeColor: color, color, strokeWidth: Math.max(8, width * 6) }
    case "freeText":
      return { fontColor: color }
    case "textComment":
      return { strokeColor: color, color }
    case "square":
    case "circle":
      return { strokeColor: color, strokeWidth: width }
    default:
      return { strokeColor: color, color, strokeWidth: width }
  }
}

/**
 * Pen strokes, shapes and notes drawn with the EmbedPDF annotation plugin.
 * Outside mark mode every annotation is locked, so clicks reach text
 * selection and links. Marks PDFie created (now or in an earlier session) are
 * tracked by ID and saved as JSON; the PDF's own annotations are shown but
 * never saved or offered for deletion.
 */
export function useMarks({
  documentId,
  initialMarks,
  onChange,
}: {
  documentId: string
  initialMarks: PdfMark[]
  onChange: (marks: PdfMark[]) => void
}) {
  const { provides: annotation } = useAnnotationCapability()
  const { provides: history } = useHistoryCapability()
  const [active, setActive] = useState(false)
  const [tool, setTool] = useState<MarkToolId>("ink")
  const [color, setColor] = useState<string>(MARK_COLORS[0])
  const [width, setWidth] = useState<number>(MARK_WIDTHS[1])
  const [marks, setMarks] = useState<PdfMark[]>(initialMarks)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const ours = useRef(new Map<string, PdfMark>(initialMarks.map((mark) => [mark.id, mark])))
  const imported = useRef(new Set<string>())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const saveTimer = useRef<number | undefined>(undefined)

  const publish = useCallback(() => {
    const next = [...ours.current.values()]
    setMarks(next)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => onChangeRef.current(next), SAVE_DELAY_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  /** Recreate stored marks in the open document (queued until its annotations load). */
  const importMarks = useCallback(
    (items: PdfMark[]) => {
      const scope = annotation?.forDocument(documentId)
      if (!scope) return
      const fresh = items.filter((mark) => !imported.current.has(mark.id))
      if (!fresh.length) return
      for (const mark of fresh) {
        imported.current.add(mark.id)
        ours.current.set(mark.id, mark)
      }
      scope.importAnnotations(
        fresh.map((mark) => ({
          annotation: reviveAnnotation({ ...mark.annotation, id: mark.id, pageIndex: mark.pageIndex }),
        })) as unknown as Parameters<typeof scope.importAnnotations>[0],
      )
      setMarks([...ours.current.values()])
    },
    [annotation, documentId],
  )
  const initialRef = useRef(initialMarks)
  useEffect(() => {
    importMarks(initialRef.current)
  }, [importMarks])

  useEffect(() => {
    const scope = annotation?.forDocument(documentId)
    if (!scope) return
    return scope.onAnnotationEvent((event) => {
      if (event.type === "loaded") return
      const id = event.annotation.id
      if (event.type === "delete") {
        if (ours.current.delete(id)) publish()
        return
      }
      if (event.type === "update" && !ours.current.has(id)) return
      const current = scope.getAnnotationById(id)?.object ?? event.annotation
      ours.current.set(id, { id, pageIndex: event.pageIndex, annotation: serializeAnnotation(current) })
      publish()
    })
  }, [annotation, documentId, publish])

  // Lock everything outside mark mode so text selection and links keep working.
  useEffect(() => {
    const scope = annotation?.forDocument(documentId)
    if (!scope) return
    if (!active) {
      scope.setActiveTool(null)
      scope.deselectAnnotation()
      scope.setLocked({ type: LockModeType.All })
      return
    }
    scope.setLocked({ type: LockModeType.None })
    scope.setActiveTool(tool === "select" || tool === "eraser" ? null : tool)
  }, [active, annotation, documentId, tool])

  useEffect(() => {
    if (!annotation) return
    for (const item of MARK_TOOLS) annotation.setToolDefaults(item.id, toolDefaults(item.id, color, width))
  }, [annotation, color, width])

  // The eraser deletes a mark PDFie created as soon as it is picked.
  useEffect(() => {
    const scope = annotation?.forDocument(documentId)
    if (!scope || !active || tool !== "eraser") return
    return scope.onStateChange((state) => {
      for (const uid of state.selectedUids) {
        const tracked = state.byUid[uid]
        if (tracked && ours.current.has(uid)) scope.deleteAnnotation(tracked.object.pageIndex, uid)
      }
      if (state.selectedUids.length) scope.deselectAnnotation()
    })
  }, [active, annotation, documentId, tool])

  useEffect(() => {
    if (!history) return
    const scope = history.forDocument(documentId)
    const update = () => setHistoryState({ canUndo: scope.canUndo(), canRedo: scope.canRedo() })
    update()
    return scope.onHistoryChange(update)
  }, [documentId, history])

  const isOurs = useCallback((id: string) => ours.current.has(id), [])
  const remove = useCallback(
    (pageIndex: number, id: string) => {
      if (!ours.current.has(id)) return
      annotation?.forDocument(documentId).deleteAnnotation(pageIndex, id)
    },
    [annotation, documentId],
  )
  /** Recolor the selected marks, or set the color for the next ones. */
  const chooseColor = useCallback(
    (next: string) => {
      setColor(next)
      const scope = annotation?.forDocument(documentId)
      for (const tracked of scope?.getSelectedAnnotations() ?? []) {
        if (!ours.current.has(tracked.object.id)) continue
        const isText = tracked.object.type === 3
        scope?.updateAnnotation(
          tracked.object.pageIndex,
          tracked.object.id,
          (isText ? { fontColor: next } : { strokeColor: next, color: next }) as never,
        )
      }
    },
    [annotation, documentId],
  )
  const deleteSelected = useCallback(() => {
    const scope = annotation?.forDocument(documentId)
    let removed = false
    for (const tracked of scope?.getSelectedAnnotations() ?? []) {
      if (!ours.current.has(tracked.object.id)) continue
      scope?.deleteAnnotation(tracked.object.pageIndex, tracked.object.id)
      removed = true
    }
    return removed
  }, [annotation, documentId])
  const undo = useCallback(() => history?.forDocument(documentId).undo(), [documentId, history])
  const redo = useCallback(() => history?.forDocument(documentId).redo(), [documentId, history])

  return {
    active,
    setActive,
    tool,
    setTool,
    color,
    chooseColor,
    width,
    setWidth,
    marks,
    importMarks,
    isOurs,
    remove,
    deleteSelected,
    undo,
    redo,
    ...historyState,
  }
}
