import { IconButton } from "@astryxdesign/core/IconButton"
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Highlighter,
  type LucideIcon,
  Minus,
  MousePointer2,
  PenLine,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2,
  X,
} from "lucide-react"
import { MARK_COLORS, MARK_TOOLS, MARK_WIDTHS, type MarkToolId } from "./useMarks"

const ICONS: Record<MarkToolId, LucideIcon> = {
  select: MousePointer2,
  ink: PenLine,
  inkHighlighter: Highlighter,
  line: Minus,
  lineArrow: ArrowUpRight,
  square: Square,
  circle: Circle,
  freeText: Type,
  textComment: StickyNote,
  eraser: Eraser,
}
const COLOR_NAMES: Record<string, string> = {
  "#E11D48": "빨강",
  "#2563EB": "파랑",
  "#16A34A": "초록",
  "#F59E0B": "주황",
  "#111827": "검정",
}
const WIDTH_NAMES: Record<number, string> = { 1: "가늘게", 2: "보통", 4: "굵게" }

/** Floating toolbar for pen strokes, shapes and notes. */
export function MarksToolbar({
  tool,
  onTool,
  color,
  onColor,
  width,
  onWidth,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
}: {
  tool: MarkToolId
  onTool: (tool: MarkToolId) => void
  color: string
  onColor: (color: string) => void
  width: number
  onWidth: (width: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
}) {
  const tools: Array<{ id: MarkToolId; label: string }> = [
    { id: "select", label: "선택·이동" },
    ...MARK_TOOLS,
    { id: "eraser", label: "지우개" },
  ]
  return (
    <div className="marks-toolbar" role="toolbar" aria-label="필기 도구">
      {tools.map((item) => {
        const Icon = ICONS[item.id]
        return (
          <IconButton
            key={item.id}
            size="sm"
            variant="ghost"
            label={item.label}
            tooltip={item.label}
            icon={<Icon size={15} aria-hidden="true" />}
            aria-pressed={tool === item.id}
            onClick={() => onTool(item.id)}
          />
        )
      })}
      <span className="marks-toolbar-rule" aria-hidden="true" />
      {MARK_COLORS.map((value) => (
        <button
          key={value}
          type="button"
          className="marks-swatch"
          aria-label={`색: ${COLOR_NAMES[value] ?? value}`}
          title={COLOR_NAMES[value] ?? value}
          aria-pressed={color === value}
          style={{ color: value }}
          onClick={() => onColor(value)}
        />
      ))}
      <span className="marks-toolbar-rule" aria-hidden="true" />
      {MARK_WIDTHS.map((value) => (
        <button
          key={value}
          type="button"
          className="marks-width"
          aria-label={`선 굵기: ${WIDTH_NAMES[value]}`}
          title={WIDTH_NAMES[value]}
          aria-pressed={width === value}
          onClick={() => onWidth(value)}
        >
          <span style={{ height: value + 1 }} />
        </button>
      ))}
      <span className="marks-toolbar-rule" aria-hidden="true" />
      <IconButton
        size="sm"
        variant="ghost"
        label="실행 취소"
        tooltip="실행 취소 (⌘Z)"
        icon={<Undo2 size={15} aria-hidden="true" />}
        isDisabled={!canUndo}
        onClick={onUndo}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label="다시 실행"
        tooltip="다시 실행 (⇧⌘Z)"
        icon={<Redo2 size={15} aria-hidden="true" />}
        isDisabled={!canRedo}
        onClick={onRedo}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label="필기 끝내기"
        tooltip="필기 끝내기 (Esc)"
        icon={<X size={15} aria-hidden="true" />}
        onClick={onClose}
      />
    </div>
  )
}
