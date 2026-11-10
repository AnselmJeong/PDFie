import { IconButton } from "@astryxdesign/core/IconButton"
import { Highlighter, Trash2 } from "lucide-react"
import type { PdfTextHighlight } from "../../../../../shared/pdf/domain"
import { highlightChoices } from "./SelectionActions"

export function HighlightsPanel({
  highlights,
  onChange,
  onNavigate,
}: {
  highlights: PdfTextHighlight[]
  onChange: (highlights: PdfTextHighlight[]) => void
  onNavigate: (page: number) => void
}) {
  return (
    <section className="highlights-panel" aria-label="저장한 하이라이트와 주석">
      {!highlights.length && (
        <div className="rail-empty">
          <Highlighter size={18} />
          <p>구절을 선택해 하이라이트하거나 주석을 남기세요.</p>
        </div>
      )}
      {highlights.map((highlight) => {
        const color = highlightChoices.find((choice) => choice.style === highlight.style)?.color
        return (
          <article
            key={highlight.id}
            className="highlight-card"
            style={{ "--highlight": color } as React.CSSProperties}
          >
            <header>
              <button
                type="button"
                className="highlight-location"
                title="본문으로 이동"
                onClick={() => onNavigate(highlight.pages[0]?.pageNumber ?? 1)}
              >
                p. {highlight.pages.map((page) => page.pageNumber).join(", ")}
              </button>
              <fieldset className="highlight-swatches">
                <legend className="sr-only">하이라이트 스타일</legend>
                {highlightChoices.map((choice) => (
                  <button
                    type="button"
                    key={choice.style}
                    className="highlight-swatch"
                    title={choice.label}
                    aria-label={choice.label}
                    aria-pressed={highlight.style === choice.style}
                    data-underline={choice.underline ? "true" : undefined}
                    style={{ "--swatch": choice.color } as React.CSSProperties}
                    onClick={() =>
                      onChange(
                        highlights.map((item) =>
                          item.id === highlight.id ? { ...item, style: choice.style } : item,
                        ),
                      )
                    }
                  />
                ))}
              </fieldset>
              <IconButton
                size="sm"
                variant="ghost"
                label="하이라이트 삭제"
                tooltip="삭제"
                icon={<Trash2 size={13} />}
                onClick={() => onChange(highlights.filter((item) => item.id !== highlight.id))}
              />
            </header>
            <blockquote>{highlight.text}</blockquote>
            <textarea
              aria-label="주석 수정"
              placeholder="주석 추가…"
              defaultValue={highlight.note ?? ""}
              key={`${highlight.id}:${highlight.note ?? ""}`}
              rows={2}
              onBlur={(event) => {
                const note = event.target.value.trim()
                if (note !== (highlight.note ?? ""))
                  onChange(highlights.map((item) => (item.id === highlight.id ? { ...item, note } : item)))
              }}
            />
          </article>
        )
      })}
    </section>
  )
}
