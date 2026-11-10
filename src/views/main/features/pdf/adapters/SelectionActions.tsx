import { IconButton } from "@astryxdesign/core/IconButton"
import {
  BookA,
  Copy,
  Highlighter,
  List,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  Underline,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import type { PdfHighlightStyle } from "../../../../../shared/pdf/domain"
import { selectionMenuPosition } from "./selection-menu-position"

export const highlightChoices: Array<{
  style: PdfHighlightStyle
  label: string
  color: string
  underline?: boolean
}> = [
  { style: "yellow", label: "노란색 하이라이트", color: "#f2c94c" },
  { style: "green", label: "초록색 하이라이트", color: "#7ccf8a" },
  { style: "blue", label: "파란색 하이라이트", color: "#7fb2ea" },
  { style: "pink", label: "분홍색 하이라이트", color: "#ef9cc2" },
  { style: "red-underline", label: "빨간색 밑줄", color: "#e5484d", underline: true },
]

export const SELECTION_PROMPTS = {
  summarize: "선택한 구절을 3–5개의 핵심 항목으로 간결하게 요약해 주세요.",
  simplify: "선택한 구절을 처음 읽는 사람도 이해할 수 있게 쉬운 말로 풀어 설명해 주세요.",
  define: "선택한 구절에 나오는 핵심 용어와 개념을 정의하고, 이 문서에서 어떤 뜻으로 쓰였는지 설명해 주세요.",
} as const

type SelectionActionsProps = {
  anchor: DOMRect
  existingNote?: string
  existingStyle?: PdfHighlightStyle
  hasHighlight: boolean
  onNote: (note: string) => void
  onRead: () => void
  onRemoveHighlight: () => void
  onClose: () => void
  onAskAI: (prompt?: string) => void
  onHighlight: (style: PdfHighlightStyle) => void
  onCopy: () => void
}

function ToolButton({
  label,
  shortcut,
  onClick,
  pressed,
  children,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <IconButton
      className="selection-tool"
      variant="ghost"
      size="sm"
      label={label}
      tooltip={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed}
      icon={children}
      onClick={onClick}
    />
  )
}

function ActionRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button type="button" className="selection-action" onClick={onClick}>
      <span className="selection-action-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  )
}

export function SelectionActions({
  anchor,
  existingNote,
  existingStyle,
  hasHighlight,
  onNote,
  onRead,
  onRemoveHighlight,
  onClose,
  onAskAI,
  onHighlight,
  onCopy,
}: SelectionActionsProps) {
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
  const iconSize = 16

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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Pressing the card must not clear the PDF text selection. */}
      <div className="selection-card" onMouseDown={(event) => event.preventDefault()}>
        <div className="selection-tools" role="toolbar" aria-label="주석 도구">
          <ToolButton
            label="하이라이트"
            shortcut="H"
            pressed={!!existingStyle && existingStyle !== "red-underline"}
            onClick={() =>
              onHighlight(existingStyle && existingStyle !== "red-underline" ? existingStyle : "yellow")
            }
          >
            <Highlighter size={iconSize} aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label="밑줄"
            shortcut="U"
            pressed={existingStyle === "red-underline"}
            onClick={() => onHighlight("red-underline")}
          >
            <Underline size={iconSize} aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label="주석 달기"
            pressed={editingNote}
            onClick={() => setEditingNote((value) => !value)}
          >
            <MessageSquarePlus size={iconSize} aria-hidden="true" />
          </ToolButton>
          <ToolButton label="복사" shortcut="⌘C" onClick={onCopy}>
            <Copy size={iconSize} aria-hidden="true" />
          </ToolButton>
          {hasHighlight && (
            <ToolButton label="하이라이트와 주석 삭제" onClick={onRemoveHighlight}>
              <Trash2 size={iconSize} aria-hidden="true" />
            </ToolButton>
          )}
          <span className="selection-tools-spacer" />
          <IconButton
            className="selection-close"
            variant="ghost"
            size="sm"
            label="선택 메뉴 닫기"
            tooltip="닫기 (Esc)"
            icon={<X size={14} aria-hidden="true" />}
            onClick={onClose}
          />
        </div>
        <fieldset className="selection-swatches">
          <legend className="sr-only">하이라이트 색상</legend>
          {highlightChoices.map((choice) => (
            <button
              className="selection-swatch"
              type="button"
              key={choice.style}
              title={choice.label}
              aria-label={choice.label}
              aria-pressed={existingStyle === choice.style}
              data-underline={choice.underline ? "true" : undefined}
              style={{ "--swatch": choice.color } as React.CSSProperties}
              onClick={() => onHighlight(choice.style)}
            />
          ))}
        </fieldset>
        {editingNote ? (
          <form
            className="selection-note-editor"
            onSubmit={(event) => {
              event.preventDefault()
              onNote(note)
            }}
          >
            <textarea
              aria-label="선택한 구절에 주석"
              placeholder="이 구절에 대한 생각을 남기세요"
              value={note}
              // biome-ignore lint/a11y/noAutofocus: The note editor opens on an explicit request to write.
              autoFocus
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  onNote(note)
                }
              }}
              rows={3}
            />
            <div>
              <button type="button" onClick={() => setEditingNote(false)}>
                취소
              </button>
              <button type="submit" className="is-primary">
                주석 저장
              </button>
            </div>
          </form>
        ) : (
          <div className="selection-actions">
            <ActionRow icon={<Sparkles size={iconSize} />} label="AI에게 묻기" onClick={() => onAskAI()} />
            <ActionRow
              icon={<List size={iconSize} />}
              label="요약하기"
              onClick={() => onAskAI(SELECTION_PROMPTS.summarize)}
            />
            <ActionRow
              icon={<WandSparkles size={iconSize} />}
              label="쉽게 풀어 설명"
              onClick={() => onAskAI(SELECTION_PROMPTS.simplify)}
            />
            <ActionRow
              icon={<BookA size={iconSize} />}
              label="용어·개념 정의"
              onClick={() => onAskAI(SELECTION_PROMPTS.define)}
            />
            <hr />
            <ActionRow icon={<Volume2 size={iconSize} />} label="소리 내어 읽기" onClick={onRead} />
          </div>
        )}
      </div>
    </div>
  )
}
