import type { EvidenceRef } from "../../../../../shared/study/contracts"
export function EvidenceOverlay({
  evidence,
  pageIndex,
  scale,
}: {
  evidence: EvidenceRef | null
  pageIndex: number
  scale: number
}) {
  if (!evidence || evidence.pageIndex !== pageIndex || evidence.precision === "page-only") return null
  return (
    <div className="evidence-overlay" aria-hidden="true">
      {evidence.rects.map((rect) => (
        <span
          key={`${evidence.id}-${rect.x}-${rect.y}-${rect.width}-${rect.height}`}
          style={{
            left: rect.x * scale,
            top: rect.y * scale,
            width: rect.width * scale,
            height: rect.height * scale,
          }}
        />
      ))}
    </div>
  )
}
