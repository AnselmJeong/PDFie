import type { PdfSelection } from "../../shared/pdf/domain"
import type {
  EvidenceRef,
  StudyBlock,
  StudyGoal,
  StudyScope,
  StudySection,
} from "../../shared/study/contracts"

const compact = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")

// Index revisions can join or split paragraphs. Saved citations keep their text
// and page coordinates, so recover their current blocks without trusting old IDs.
export function resolveEvidenceBlocks(blocks: StudyBlock[], evidence: EvidenceRef[]): StudyBlock[] {
  const ids = new Set<string>()
  for (const ref of evidence) {
    if (ref.precision === "region") continue
    const quote = compact(ref.quote)
    for (const block of blocks) {
      if (block.documentHash !== ref.documentHash || block.pageIndex !== ref.pageIndex) continue
      const text = compact(block.rawText)
      const textMatch =
        Math.min(text.length, quote.length) >= 40 && (text.includes(quote) || quote.includes(text))
      const positionMatch = block.rects.some((a) =>
        ref.rects.some((b) => {
          const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
          const area = Math.min(a.width * a.height, b.width * b.height)
          return area > 0 && width * height >= area * 0.7
        }),
      )
      if (block.id === ref.id || textMatch || positionMatch) ids.add(block.id)
    }
  }
  return blocks.filter((block) => ids.has(block.id))
}

export function retrieveGoal(
  blocks: StudyBlock[],
  sections: StudySection[],
  goal: StudyGoal,
  evidence: EvidenceRef[],
  question: string,
  task: string,
) {
  const anchors = resolveEvidenceBlocks(blocks, evidence)
  const sectionIds = new Set(anchors.map((block) => block.sectionId))
  if (goal.sectionId && sections.some((section) => section.id === goal.sectionId))
    sectionIds.add(goal.sectionId)
  const candidates = sectionIds.size ? blocks.filter((block) => sectionIds.has(block.sectionId)) : blocks
  return retrieve(candidates, sections, { type: "document" }, question, task, "", undefined, anchors)
}

export function selectedSourceBlocks(
  blocks: StudyBlock[],
  selection: PdfSelection | null | undefined,
): StudyBlock[] {
  if (!selection?.text.trim() || !selection.pages.length) throw new Error("먼저 원문 구절을 선택하세요.")
  if (
    selection.pages.length > 100 ||
    selection.pages.some(
      (p) =>
        !Number.isInteger(p.pageNumber) ||
        p.pageNumber < 1 ||
        p.rects.length > 300 ||
        p.rects.some(
          (r) => ![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0,
        ),
    )
  )
    throw new Error("선택한 원문의 위치가 올바르지 않습니다.")
  return blocks.filter((block) => {
    const page = selection.pages.find((p) => p.pageNumber === block.pageIndex + 1)
    if (!page) return false
    return (
      block.rects.some((a) =>
        page.rects.some(
          (b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y,
        ),
      ) ||
      (!block.rects.length && selection.normalizedText.includes(block.normalizedText))
    )
  })
}

const TERMS: Record<string, string[]> = {
  방법: ["method", "design", "procedure"],
  결과: ["result", "finding", "outcome"],
  한계: ["limitation", "bias", "uncertainty"],
  가설: ["hypothesis"],
  질문: ["question", "aim", "objective"],
  표본: ["sample", "participant"],
  인과: ["causal", "causality"],
  통계: ["statistical", "significant"],
  그림: ["figure", "fig"],
  표: ["table"],
  정의: ["definition", "defined"],
  개념: ["concept", "theory"],
  요약: ["abstract", "conclusion"],
  배경: ["introduction", "background"],
  비교: ["compare", "difference"],
}
export function retrieve(
  blocks: StudyBlock[],
  sections: StudySection[],
  scope: StudyScope,
  question: string,
  task: string,
  selectedText = "",
  capturePage?: number,
  anchors: StudyBlock[] = [],
): { blocks: StudyBlock[]; eligibleCount: number } {
  const section = scope.type === "section" ? sections.find((s) => s.id === scope.sectionId) : null
  if (scope.type === "section" && !section) throw new Error("선택한 섹션을 찾지 못했습니다.")
  const eligible = blocks.filter((b) => !section || b.sectionId === section.id)
  const query = `${question} ${selectedText}`.toLowerCase()
  const tokens = new Set(query.match(/[\p{L}\p{N}]{2,}/gu) ?? [])
  for (const [korean, english] of Object.entries(TERMS))
    if (query.includes(korean))
      english.forEach((word) => {
        tokens.add(word)
      })
  const broad = task !== "chat"
  const anchorPositions = anchors
    .map((anchor) => ({
      anchor,
      index: eligible.findIndex((block) => block.id === anchor.id),
    }))
    .filter((entry) => entry.index >= 0)
  const ranked = eligible.map((block, index) => {
    const text = block.normalizedText.toLowerCase()
    // A heading can identify a relevant section, but cannot replace its body.
    let score = block.role === "heading" ? -1 : 0
    for (const term of tokens) if (text.includes(term)) score += 3
    const title = sections.find((s) => s.id === block.sectionId)?.title.toLowerCase() ?? ""
    for (const term of tokens) if (title.includes(term)) score += 2
    if (anchors.some((anchor) => anchor.id === block.id)) score += 100
    score += Math.max(
      0,
      ...anchorPositions
        .filter((entry) => entry.anchor.sectionId === block.sectionId)
        .map((entry) => 12 - Math.abs(entry.index - index)),
    )
    if (
      selectedText &&
      (text.includes(selectedText.toLowerCase().slice(0, 80)) ||
        selectedText.toLowerCase().includes(text.slice(0, 80)))
    )
      score += 30
    if (capturePage !== undefined && block.pageIndex === capturePage)
      score += block.role === "caption" ? 40 : 12
    if (block.quality === "uncertain") score -= 2
    if (block.role === "reference" && !/referenc|참고|인용|citation/.test(query)) score -= 10
    return { block, score, index }
  })
  if (!anchors.length && (broad || !ranked.some((entry) => entry.score > 0))) {
    // Round-robin across real sections gives long documents honest, distributed coverage.
    const queues = sections.map((s) =>
      ranked.filter((r) => r.block.sectionId === s.id).sort((a, b) => b.score - a.score || a.index - b.index),
    )
    const distributed: typeof ranked = []
    for (let i = 0; distributed.length < ranked.length; i++) {
      let added = false
      for (const queue of queues) {
        const entry = queue[i]
        if (entry) {
          distributed.push(entry)
          added = true
        }
      }
      if (!added) break
    }
    ranked.splice(0, ranked.length, ...distributed)
  } else ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  let used = 0
  const found: StudyBlock[] = []
  const included = new Set<string>()
  const budget = broad ? 42000 : 18000
  const add = (block: StudyBlock) => {
    if (included.has(block.id) || used + block.rawText.length > budget || found.length >= (broad ? 64 : 18))
      return
    found.push(block)
    included.add(block.id)
    used += block.rawText.length
  }
  for (const entry of ranked) {
    if (entry.block.role === "heading")
      eligible
        .filter(
          (block) =>
            block.sectionId === entry.block.sectionId &&
            block.role !== "heading" &&
            block.role !== "reference",
        )
        .slice(0, 2)
        .forEach(add)
    add(entry.block)
  }
  // Restore reading order after ranking so split sentences and cross-page
  // continuations are intelligible to the model.
  const order = new Map(eligible.map((block, index) => [block.id, index]))
  found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  return { blocks: found, eligibleCount: eligible.length }
}
