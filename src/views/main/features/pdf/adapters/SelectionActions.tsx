import { Copy, Headphones, Highlighter, List, MessageSquarePlus, Sparkles, Trash2, X } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import type { PdfHighlightStyle } from "../../../../../shared/pdf/domain"
import { selectionMenuPosition } from "./selection-menu-position"

export const highlightChoices: Array<{
  style: PdfHighlightStyle
  label: string
  color: string
  underline?: boolean
}> = [
  { style: "yellow", label: "노란색 하이라이트", color: "#e9bb3f" },
  { style: "green", label: "초록색 하이라이트", color: "#78b978" },
  { style: "blue", label: "파란색 하이라이트", color: "#5e9bd3" },
  { style: "pink", label: "분홍색 하이라이트", color: "#d978a3" },
  { style: "red-underline", label: "빨간색 밑줄", color: "#d9473f", underline: true },
]

type SelectionActionsProps = {
  anchor: DOMRect
  existingNote?: string
  hasHighlight: boolean
  onNote: (note: string) => void
  onRead: () => void
  onRemoveHighlight: () => void
  onClose: () => void
  onAskAI: () => void
  onSummarize: () => void
  onHighlight: (style: PdfHighlightStyle) => void
  onCopy: () => void
}

export function SelectionActions({
  anchor,
  existingNote,
  hasHighlight,
  onNote,
  onRead,
  onRemoveHighlight,
  onClose,
  onAskAI,
  onSummarize,
  onHighlight,
  onCopy,
}: SelectionActionsProps) {
  const [showHighlightChoices, setShowHighlightChoices] = useState(false)

  const [editingNote, setEditingNote] = useState(false)
  const [note, setNote] = useState(existingNote ?? "")
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    const measure = () =>
      setPosition(
        selectionMenuPosition(
          anchor,
          { width: element.offsetWidth, height: element.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [anchor])
  const iconSize = 14

  return (
    <div
      role="dialog"
      aria-label="선택한 텍스트 작업"
      ref={menuRef}
      className="selection-menu-portal"
      data-selection-menu="true"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        className="selection-popup"
        role="toolbar"
        aria-label="선택한 텍스트 작업"
        onMouseDown={(event) => event.preventDefault()}
      >
        <button className="selection-popup-primary" type="button" onClick={onAskAI}>
          <Sparkles size={iconSize} aria-hidden="true" />
          <span>Ask AI</span>
        </button>
        <span className="selection-popup-divider" aria-hidden="true" />
        <button type="button" onClick={onSummarize}>
          <List size={iconSize} aria-hidden="true" />
          <span>Summarize</span>
        </button>
        <span className="selection-popup-divider" aria-hidden="true" />
        <div className="selection-highlight-control">
          <button
            type="button"
            aria-expanded={showHighlightChoices}
            aria-haspopup="menu"
            onClick={() => setShowHighlightChoices((current) => !current)}
          >
            <Highlighter size={iconSize} aria-hidden="true" />
            <span>Highlight</span>
          </button>
          {showHighlightChoices && (
            <div className="selection-highlight-palette" role="menu" aria-label="하이라이트 색상">
              {highlightChoices.map((choice) => (
                <button
                  className="selection-highlight-swatch"
                  type="button"
                  role="menuitem"
                  key={choice.style}
                  title={choice.label}
                  aria-label={choice.label}
                  onClick={() => onHighlight(choice.style)}
                >
                  <span
                    data-underline={choice.underline ? "true" : "false"}
                    style={
                      choice.underline
                        ? { borderBottomColor: choice.color }
                        : { backgroundColor: choice.color }
                    }
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="selection-popup-divider" aria-hidden="true" />
        <button type="button" onClick={onCopy}>
          <Copy size={iconSize} aria-hidden="true" />
          <span>Copy</span>
        </button>
        <button type="button" onClick={onRead}>
          <Headphones size={iconSize} />
          Read
        </button>
        <button type="button" onClick={() => setEditingNote((value) => !value)} aria-expanded={editingNote}>
          <MessageSquarePlus size={iconSize} />
          주석
        </button>
        {hasHighlight && (
          <button
            type="button"
            onClick={onRemoveHighlight}
            title="선택한 하이라이트와 주석 삭제"
            aria-label="선택한 하이라이트와 주석 삭제"
          >
            <Trash2 size={iconSize} />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="선택 메뉴 닫기">
          <X size={iconSize} />
        </button>
      </div>
      {editingNote && (
        <form
          className="selection-note-editor"
          onSubmit={(event) => {
            event.preventDefault()
            onNote(note)
          }}
        >
          <label>
            선택한 구절에 주석
            <textarea
              aria-label="선택한 구절에 주석"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
            />
          </label>
          <button type="submit">주석 저장</button>
        </form>
      )}
    </div>
  )
}
