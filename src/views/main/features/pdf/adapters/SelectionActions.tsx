import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react"
import { Copy, Highlighter, List, Sparkles } from "lucide-react"
import { useState } from "react"
import type { PdfHighlightStyle } from "../../../../../shared/pdf/domain"

const highlightChoices: Array<{
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

type SelectionActionsProps = SelectionSelectionMenuProps & {
  onAskAI: () => void
  onSummarize: () => void
  onHighlight: (style: PdfHighlightStyle) => void
  onCopy: () => void
}

export function SelectionActions({
  rect,
  menuWrapperProps,
  placement,
  onAskAI,
  onSummarize,
  onHighlight,
  onCopy,
}: SelectionActionsProps) {
  const [showHighlightChoices, setShowHighlightChoices] = useState(false)

  const placeAbove = (placement.spaceAbove ?? 0) >= 54
  const menuTop = placeAbove ? -54 : rect.size.height + 10
  const iconSize = 16

  return (
    <div {...menuWrapperProps} data-selection-menu="true" style={{ ...menuWrapperProps.style, zIndex: 50 }}>
      <div
        className="selection-popup"
        data-placement={placeAbove ? "top" : "bottom"}
        role="toolbar"
        aria-label="선택한 텍스트 작업"
        style={{ top: menuTop, left: rect.size.width / 2 }}
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
      </div>
    </div>
  )
}
