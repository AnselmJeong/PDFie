import { useState } from "react"
import type { EvidenceRef } from "../../../../shared/study/contracts"
export function CitationChip({
  evidence,
  onReveal,
}: {
  evidence: EvidenceRef
  onReveal: (evidence: EvidenceRef) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="citation-container">
      <button
        type="button"
        className="citation-chip"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => onReveal(evidence)}
        aria-label={`PDF ${evidence.pageIndex + 1}페이지 근거 확인`}
      >
        p. {evidence.pageIndex + 1}
      </button>
      {open && (
        <span className="evidence-preview" role="tooltip">
          <strong>
            {evidence.sectionTitle} · PDF p. {evidence.pageIndex + 1}
          </strong>
          <span>{evidence.quote.slice(0, 800)}</span>
          <small>
            {evidence.precision === "page-only"
              ? "정확한 위치를 찾지 못함 · 페이지 안내"
              : evidence.precision === "region"
                ? "선택한 이미지 영역 · 시각적 해석 확인 필요"
                : "PDF 원문에서 추출한 위치"}{" "}
            · {evidence.quality === "usable" ? "본문 추출" : "추출 확인 필요"}
          </small>
        </span>
      )}
    </span>
  )
}
