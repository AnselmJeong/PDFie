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
      {!highlights.length && <p>구절을 선택해 하이라이트하거나 주석을 남기세요.</p>}
      {highlights.map((highlight) => (
        <article key={highlight.id}>
          <button
            type="button"
            className="highlight-location"
            onClick={() => onNavigate(highlight.pages[0]?.pageNumber ?? 1)}
          >
            p. {highlight.pages.map((page) => page.pageNumber).join(", ")} · 본문으로 이동
          </button>
          <blockquote>{highlight.text}</blockquote>
          <select
            aria-label="하이라이트 스타일"
            value={highlight.style}
            onChange={(event) => {
              const style = highlightChoices.find((choice) => choice.style === event.target.value)?.style
              if (style)
                onChange(highlights.map((item) => (item.id === highlight.id ? { ...item, style } : item)))
            }}
          >
            {highlightChoices.map((choice) => (
              <option key={choice.style} value={choice.style}>
                {choice.label}
              </option>
            ))}
          </select>
          <textarea
            aria-label="주석 수정"
            placeholder="주석을 남기세요…"
            defaultValue={highlight.note ?? ""}
            key={`${highlight.id}:${highlight.note ?? ""}`}
            rows={3}
            onBlur={(event) => {
              const note = event.target.value.trim()
              if (note !== (highlight.note ?? ""))
                onChange(highlights.map((item) => (item.id === highlight.id ? { ...item, note } : item)))
            }}
          />
          <button
            type="button"
            onClick={() => onChange(highlights.filter((item) => item.id !== highlight.id))}
          >
            삭제
          </button>
        </article>
      ))}
    </section>
  )
}
