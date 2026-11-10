import type { AnswerBlock, EvidenceRef } from "../../../../shared/study/contracts"
import { CitationChip } from "./CitationChip"

export const claimLabels: Record<AnswerBlock["kind"], string> = {
  "document-claim": "논문에서 확인",
  inference: "해석·추론",
  background: "배경 설명",
  illustration: "교육용 예시",
  unknown: "근거 부족",
}

/**
 * Explanations read as prose. Page citations sit inline at the end of the
 * sentence they support, and only claims that go beyond the document carry a
 * label, so the source-supported text reads without interruption.
 */
export function AnswerBlocks({
  blocks,
  evidence,
  onReveal,
  className = "answer-prose",
}: {
  blocks: AnswerBlock[]
  evidence: EvidenceRef[]
  onReveal: (evidence: EvidenceRef) => void
  className?: string
}) {
  return (
    <div className={className}>
      {blocks.map((block) => {
        const refs = block.evidenceIds
          .map((id) => evidence.find((ref) => ref.id === id))
          .filter((ref): ref is EvidenceRef => !!ref)
          // One chip per page keeps "(p. 4)" readable; its preview shows the first passage.
          .filter((ref, i, all) => all.findIndex((other) => other.pageIndex === ref.pageIndex) === i)
        return (
          <p className="answer-block" data-kind={block.kind} key={`${block.kind}-${block.text}`}>
            {block.kind !== "document-claim" && (
              <span className={`claim-kind is-${block.kind}`} title={claimLabels[block.kind]}>
                {claimLabels[block.kind]}
              </span>
            )}
            {block.text}
            {refs.length > 0 && (
              <span className="answer-citations">
                {refs.map((ref) => (
                  <CitationChip key={ref.id} evidence={ref} onReveal={onReveal} />
                ))}
              </span>
            )}
          </p>
        )
      })}
    </div>
  )
}
