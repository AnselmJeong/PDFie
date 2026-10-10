import type { PdfOutlineNode } from "../pdf/domain"
import type { BlockStyle, SectionKind, StudyBlock, StudySection } from "./contracts"

// Heading names that papers use for their own structure. A leading number
// ("2.1", "IV.", "A.") and a trailing colon are removed before matching.
const BACK_MATTER =
  /^(?:references?(?: and notes)?|bibliography|literature cited|works cited|cited literature|acknowledg(?:e)?ments?|funding(?: information| sources?| statement)?|financial (?:support|disclosures?)|sources? of funding|competing (?:financial )?interests?(?: statement)?|conflicts? of interests?(?: statement)?|declarations?(?: of (?:competing )?interests?)?|disclosures?(?: statement)?|author(?:s'?|’s)? contributions?|contributions|credit authorship contribution statement|data (?:and code )?availability(?: statement)?|code availability|availability of data and materials|data sharing(?: statement)?|ethics(?: approval| statement| declarations?)?(?: and consent to participate)?|ethical (?:approval|statement)|consent for publication|abbreviations|lead contact|materials availability|resource availability|key resources table|supplementary (?:information|materials?|data|files?)|supporting information|additional information|reporting summary|peer review(?: information)?|publisher’?'?s note|author information|about the authors?|notes|endnotes|index|참고\s?문헌|인용\s?문헌|감사의\s?글|사사|이해\s?관계|연구비|저자\s?기여)$/u
const BODY_NAMES =
  /^(?:abstract|summary|graphical abstract|highlights|significance(?: statement)?|introduction|background|related works?|literature review|preliminar(?:y|ies)|theory|theoretical (?:background|framework)|motivation|problem (?:statement|formulation|definition|setting)|overview|(?:materials? and )?methods?(?: and materials?)?|methodology|online methods|star methods|method details|experimental(?: section| procedures?| setup| design| methods)?|experiments?|study design|participants|subjects|patients(?: and methods)?|data(?: collection| analysis| sets?)?|datasets?|statistical analys[ie]s|quantification and statistical analysis|procedures?|measures|implementation|evaluation|results?(?: and discussion)?|findings|analysis|discussion|general discussion|limitations|strengths and limitations|future (?:work|directions)|conclusions?(?: and (?:future work|outlook|perspectives))?|concluding remarks|summary and conclusions?|outlook|perspectives?|implications|clinical implications|appendi(?:x|ces)(?: [a-z0-9]{1,3})?|국문\s?초록|영문\s?초록|초록|요약|서론|머리말|들어가며|연구\s?배경|배경|이론적\s?배경|선행\s?연구|관련\s?연구|연구\s?방법|방법|재료\s?및\s?방법|대상\s?및\s?방법|실험|결과|연구\s?결과|고찰|논의|결론(?:\s?및\s?제언)?|맺음말|나가며|제한점|한계|부록)$/u
// The broad divisions of a paper; their typographic style marks top-level headings.
const MAJOR_NAMES =
  /^(?:abstract|introduction|background|(?:materials? and )?methods?|methodology|results?(?: and discussion)?|discussion|conclusions?|references|bibliography|acknowledg(?:e)?ments?|초록|서론|방법|연구\s?방법|결과|고찰|논의|결론|참고\s?문헌)$/u
export const CAPTION_PATTERN =
  /^(?:(?:supplementary|extended data|supporting)\s+)?(?:fig(?:ure)?s?\.?|table|scheme|chart|plate|box|그림|표)\s*[S]?\d/iu
const FRONT_LINE =
  /^(?:doi\b|https?:|www\.|e-?mail|correspond|received|accepted|revised|published|available online|keywords?\b|key words|©|\(c\)|copyright|citation:|cite this|open access|article history|editor|this article|licen[cs]e)/iu
const NUMBERING = /^(?:(\d{1,2}(?:\.\d{1,2}){0,3})\.?|([IVX]{1,5})\.|([A-H])\.)\s+(?=\S)/u

export function isBoldFont(font: { name?: string; familyName?: string; weight?: number }): boolean {
  if ((font.weight ?? 0) >= 600) return true
  // Many embedded Type1/TrueType fonts report weight 0; their names still say
  // Bold, Semibold, Black, Heavy, Nimbus "-Medi" or TeX "CMBX".
  return /bold|black|heavy|semibold|demi(?!-?light)|ultra(?!light)|[-,_ ]medi(?:um)?\b|\bcmbx|\bcmssbx|\bsfbx|[-,]bd\b/i.test(
    `${font.name ?? ""} ${font.familyName ?? ""}`,
  )
}
export function isItalicFont(font: { name?: string; familyName?: string; italic?: boolean }): boolean {
  return (
    !!font.italic ||
    /italic|oblique|[-,]it\b|[-,]ital|\bcmti|\bcmmi|\bcmsl/i.test(
      `${font.name ?? ""} ${font.familyName ?? ""}`,
    )
  )
}

export interface ParsedHeading {
  /** Arabic numbering components, e.g. [2, 1] for "2.1". */
  numbers: number[] | null
  /** Any leading numbering, including Roman numerals and appendix letters. */
  numbered: boolean
  /** Heading text without its numbering. */
  text: string
  /** The same text normalized for name matching. */
  name: string
}
export function parseHeading(raw: string): ParsedHeading {
  const clean = raw.normalize("NFKC").replace(/\s+/g, " ").trim()
  const match = clean.match(NUMBERING)
  const rest = match ? clean.slice(match[0].length) : clean
  // Numbering must introduce words, never a measurement or a list of values.
  const numbered = !!match && /^[\p{Lu}\p{Lo}]/u.test(rest)
  const text = numbered ? rest : clean
  return {
    numbers: numbered && match?.[1] ? match[1].split(".").map(Number) : null,
    numbered,
    text,
    name: text
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[:.\s]+$/u, "")
      .replace(/\s+/g, " "),
  }
}
export function headingNameKind(text: string): SectionKind | null {
  const { name } = parseHeading(text)
  if (BACK_MATTER.test(name)) return "back"
  if (BODY_NAMES.test(name)) return "body"
  return null
}
const isMajorName = (text: string) => MAJOR_NAMES.test(parseHeading(text).name)
export const isReferenceList = (title: string) =>
  /^(?:references?(?: and notes)?|bibliography|literature cited|works cited|참고\s?문헌|인용\s?문헌)$/u.test(
    parseHeading(title).name,
  )

const singleLine = (text: string) => text.replace(/\s+/g, " ").trim()
const letters = (text: string) => text.replace(/[^\p{L}]/gu, "")
const compact = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
const headingKey = (text: string) => compact(parseHeading(text).name)
const emphasized = (value: number) => value >= 0.7

export interface HeadingContext {
  /** Dominant body text size of the page or document. */
  bodySize: number
  bodyBold?: boolean
  bodyColored?: boolean
  /** Font and color of body text; a short line set apart from it may be a heading. */
  bodyFont?: string
}
/**
 * Scores how strongly one block reads as a heading from its wording and
 * typography alone. Scores of 3 or more are heading candidates.
 */
export function headingScore(
  text: string,
  role: StudyBlock["role"],
  lineCount: number,
  style: BlockStyle | undefined,
  context: HeadingContext,
): number {
  // Body paragraphs are by far the most blocks; reject them before any pattern work.
  if (text.length > 300 || lineCount > 4) return -10
  const line = singleLine(text)
  if (role === "caption" || role === "reference" || CAPTION_PATTERN.test(line)) return -10
  if (line.length < 2 || line.length > 220 || lineCount > 4 || !/\p{L}/u.test(line)) return -10
  if (FRONT_LINE.test(line)) return -10
  if (style && (style.top < 0.05 || style.top > 0.95)) return -10
  const parsed = parseHeading(line)
  const known = headingNameKind(line)
  let score = known ? 3 : 0
  if (parsed.numbered) score += 2
  if (style) {
    const ratio = style.size / Math.max(1, context.bodySize)
    if (ratio >= 1.4) score += 3
    else if (ratio >= 1.12) score += 2
    else if (ratio < 0.9) score -= 2
    if (emphasized(style.bold) && !context.bodyBold) score += 2
    if (emphasized(style.colored) && !context.bodyColored) score += 1
    if (style.italic >= 0.9 && !emphasized(style.bold) && ratio < 1.12 && parsed.numbered) score += 1
    const cased = letters(line).replace(/[^\p{Lu}\p{Ll}]/gu, "")
    if (cased.length >= 4 && cased.replace(/\p{Ll}/gu, "").length / cased.length >= 0.9) score += 1
    if (
      context.bodyFont &&
      style.font !== context.bodyFont &&
      ratio >= 0.95 &&
      line.split(" ").length <= 12 &&
      !/[.!?。;,:]$/u.test(line)
    )
      score += 1
  } else if (role === "heading") score += 3
  // Sentences, author bylines and lists are not headings.
  if (/[.!?。;,]$/u.test(line) && !known) score -= 3
  if (/^\p{Ll}/u.test(parsed.text) && !known) score -= 2
  if (/\p{L}\d+(?:,\d+)*$/u.test(line) || /[*†‡§]$/u.test(line)) score -= 3
  if ((line.match(/,/g)?.length ?? 0) >= 2) score -= 2
  if (line.split(" ").length > 18) score -= 2
  return score
}

export interface StructureBoundary {
  title: string
  level: number
  source: "bookmark" | "heading"
  /** The block is the heading line itself, not merely the first block after a bookmark. */
  isHeading: boolean
}
export interface DocumentStructure {
  /** Section starts by block ID. A Part and its first Chapter can share one block. */
  boundaries: Map<string, StructureBoundary[]>
  /** The paper title, used to name the front matter instead of a generic label. */
  documentTitle?: string
  documentTitleBlockId?: string
  /** Running headers/footers repeated across pages. */
  furniture: Set<string>
}

const emphasisOf = (style: BlockStyle, text: string) => {
  const cased = letters(text).replace(/[^\p{Lu}\p{Ll}]/gu, "")
  const caps = cased.length >= 4 && cased.replace(/\p{Ll}/gu, "").length / cased.length >= 0.9
  return {
    key: `${emphasized(style.bold)}|${emphasized(style.colored)}|${caps}|${style.italic >= 0.9}`,
    bonus:
      (emphasized(style.bold) ? 1.2 : 0) +
      (caps ? 0.8 : 0) +
      (emphasized(style.colored) ? 0.6 : 0) -
      (style.italic >= 0.9 ? 0.3 : 0),
  }
}

function weightedMode(values: Array<[number, number]>): number | undefined {
  const totals = new Map<number, number>()
  for (const [value, weight] of values) totals.set(value, (totals.get(value) ?? 0) + weight)
  let best: number | undefined
  let bestWeight = -1
  for (const [value, weight] of totals)
    if (weight > bestWeight) {
      best = value
      bestWeight = weight
    }
  return best
}

/** Running headers and footers: the same words near the same page edge on many pages. */
function findFurniture(blocks: StudyBlock[]): Set<string> {
  const pages = new Set(blocks.map((block) => block.pageIndex)).size
  const furniture = new Set<string>()
  if (pages < 3) return furniture
  const byKey = new Map<string, { pages: Set<number>; ids: string[] }>()
  for (const block of blocks) {
    if (!block.style || (block.style.top > 0.1 && block.style.top < 0.9) || block.rawText.length > 200)
      continue
    const key = `${block.style.top < 0.5 ? "top" : "bottom"}:${compact(block.rawText).replace(/\d+/g, "")}`
    if (key.length < 8) continue
    const entry = byKey.get(key) ?? { pages: new Set(), ids: [] }
    entry.pages.add(block.pageIndex)
    entry.ids.push(block.id)
    byKey.set(key, entry)
  }
  const minimum = Math.max(2, Math.ceil(pages * 0.3))
  for (const entry of byKey.values())
    if (entry.pages.size >= minimum)
      entry.ids.forEach((id) => {
        furniture.add(id)
      })
  return furniture
}

function flattenBookmarks(
  nodes: PdfOutlineNode[],
  depth = 0,
): Array<{ title: string; page: number; depth: number }> {
  return nodes.flatMap((node) => [
    ...(node.pageNumber && node.title.trim() && node.title !== "Untitled"
      ? [{ title: singleLine(node.title), page: node.pageNumber, depth }]
      : []),
    ...flattenBookmarks(node.children, depth + 1),
  ])
}

/** Arabic numbering must continue the previous accepted heading's sequence. */
function continuesNumbering(numbers: number[], last: number[]): boolean {
  for (const [k, value] of numbers.entries()) {
    const previous = last[k]
    const rest = numbers.slice(k + 1)
    if (previous === undefined) return value <= 3 && rest.every((n) => n <= 3)
    if (value !== previous) return value > previous && value - previous <= 3 && rest.every((n) => n <= 3)
  }
  // Same number repeated (e.g. "2" after "2.3") is a restatement, not progress.
  return false
}

/**
 * Derives a document's section structure from the whole index rather than a
 * single page: body text style, repeated page furniture, numbering sequences,
 * heading style tiers and, when usable, the PDF's own bookmarks.
 */
export function analyzeStructure(blocks: StudyBlock[], outline: PdfOutlineNode[] = []): DocumentStructure {
  const furniture = findFurniture(blocks)
  const boundaries = new Map<string, StructureBoundary[]>()
  const addBoundary = (blockId: string, boundary: StructureBoundary) =>
    boundaries.set(blockId, [...(boundaries.get(blockId) ?? []), boundary])
  const styled = blocks.some((block) => block.style)
  const bodyLines: Array<[number, number]> = []
  const fonts = new Map<string, number>()
  let bodyChars = 0,
    boldChars = 0,
    coloredChars = 0
  for (const block of blocks) {
    if (!block.style || block.role === "heading" || furniture.has(block.id)) continue
    const chars = block.rawText.length
    bodyLines.push([Math.round(block.style.size * 2) / 2, chars])
    fonts.set(block.style.font, (fonts.get(block.style.font) ?? 0) + chars)
    bodyChars += chars
    boldChars += block.style.bold * chars
    coloredChars += block.style.colored * chars
  }
  const context: HeadingContext = {
    bodySize: weightedMode(bodyLines) ?? 10,
    bodyBold: bodyChars > 0 && boldChars / bodyChars > 0.5,
    bodyColored: bodyChars > 0 && coloredChars / bodyChars > 0.5,
    ...(fonts.size ? { bodyFont: [...fonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] } : {}),
  }

  // 1. Score each block on its own.
  type Candidate = { index: number; block: StudyBlock; score: number; parsed: ParsedHeading; known: boolean }
  const candidates: Candidate[] = []
  blocks.forEach((block, index) => {
    if (furniture.has(block.id)) return
    const score = styled
      ? headingScore(block.rawText, block.role, block.rects.length, block.style, context)
      : block.role === "heading"
        ? 3
        : -10
    if (score >= 3)
      candidates.push({
        index,
        block,
        score,
        parsed: parseHeading(block.rawText),
        known: !!headingNameKind(block.rawText),
      })
  })
  const isCandidate = new Set(candidates.map((candidate) => candidate.index))
  // Figure labels and table cells: short text that does not end a sentence.
  const isShort = (block: StudyBlock | undefined) =>
    !!block && singleLine(block.rawText).length < 60 && !/[.!?。]$/u.test(block.rawText.trim())

  // 2. Reject candidates that their surroundings contradict.
  const accepted: Candidate[] = []
  let lastNumbers: number[] = []
  for (const candidate of candidates) {
    const { index, block, parsed, known } = candidate
    if (styled && !known) {
      // Figures and tables: runs of short labels and cells.
      let start = index,
        end = index
      while (start > 0 && isShort(blocks[start - 1]) && blocks[start - 1]?.pageIndex === block.pageIndex)
        start--
      while (isShort(blocks[end + 1]) && blocks[end + 1]?.pageIndex === block.pageIndex) end++
      const followedByBody = (from: number) => {
        for (let i = from + 1; i < Math.min(blocks.length, from + 5); i++) {
          const next = blocks[i]
          if (!next) break
          // Skip page furniture and margins when a heading ends a page.
          if (furniture.has(next.id) || (next.style && (next.style.top < 0.1 || next.style.top > 0.92)))
            continue
          if (isCandidate.has(i)) continue
          const body = singleLine(next.rawText)
          return (
            next.role === "paragraph" && (body.length >= 60 || (body.length >= 20 && /[.!?。]$/u.test(body)))
          )
        }
        return false
      }
      if (end - start + 1 >= 4 && !(index === end && followedByBody(index))) continue
      // A heading introduces text; a lone label is followed by more labels or a caption.
      if (!followedByBody(index)) continue
    }
    if (parsed.numbers && !known) {
      if (!continuesNumbering(parsed.numbers, lastNumbers)) continue
    }
    if (parsed.numbers) lastNumbers = parsed.numbers
    accepted.push(candidate)
  }

  // 3. The title and byline area before the first structural heading.
  const firstPage = blocks[0]?.pageIndex ?? 0
  const anchorIndex = accepted.find(
    (c) => (c.known || c.parsed.numbered) && c.block.pageIndex <= firstPage + 1,
  )?.index
  let documentTitle: string | undefined
  let documentTitleBlockId: string | undefined
  if (styled) {
    const titleCandidates = blocks
      .slice(0, anchorIndex ?? blocks.length)
      .filter(
        (block) =>
          block.pageIndex === firstPage &&
          block.style &&
          block.style.top < 0.55 &&
          block.style.size >= context.bodySize * 1.25 &&
          !furniture.has(block.id) &&
          !CAPTION_PATTERN.test(block.rawText) &&
          !FRONT_LINE.test(singleLine(block.rawText)) &&
          letters(block.rawText).length >= 4 &&
          block.rawText.length <= 300,
      )
    const title = titleCandidates.sort((a, b) => (b.style?.size ?? 0) - (a.style?.size ?? 0))[0]
    if (title && !headingNameKind(title.rawText)) {
      documentTitle = singleLine(title.rawText)
      documentTitleBlockId = title.id
    }
  }
  const structural = accepted.filter((candidate) => {
    if (candidate.block.id === documentTitleBlockId) return false
    // Journal labels, author names and affiliations above the first real heading.
    if (anchorIndex !== undefined && candidate.index < anchorIndex) return candidate.known
    return true
  })

  // 4. Heading levels: numbering depth first, then typographic tiers. Headings
  // share a style when their emphasis matches and their sizes are within
  // measurement noise of each other.
  const signatures = new Map<string, { prominence: number; depths: number[]; major: number }>()
  const signatureKey = new Map<Candidate, string>()
  const byEmphasis = new Map<string, Array<{ candidate: Candidate; size: number; bonus: number }>>()
  for (const candidate of structural) {
    const style = candidate.block.style
    const emphasis = style ? emphasisOf(style, candidate.block.rawText) : { key: "plain", bonus: 0 }
    const group = byEmphasis.get(emphasis.key) ?? []
    group.push({ candidate, size: style?.size ?? 0, bonus: emphasis.bonus })
    byEmphasis.set(emphasis.key, group)
  }
  for (const [emphasis, group] of byEmphasis) {
    group.sort((a, b) => a.size - b.size)
    let cluster = 0
    let members: typeof group = []
    const close = () => {
      if (!members.length) return
      const key = `${emphasis}#${cluster}`
      const mean = members.reduce((sum, member) => sum + member.size, 0) / members.length
      const entry = { prominence: mean + (members[0]?.bonus ?? 0), depths: [] as number[], major: 0 }
      for (const { candidate } of members) {
        signatureKey.set(candidate, key)
        if (candidate.parsed.numbers) entry.depths.push(candidate.parsed.numbers.length)
        if (isMajorName(candidate.block.rawText)) entry.major++
      }
      signatures.set(key, entry)
      cluster++
      members = []
    }
    for (const member of group) {
      const previous = members.at(-1)
      if (previous && member.size - previous.size > Math.max(0.6, previous.size * 0.07)) close()
      members.push(member)
    }
    close()
  }
  const ordered = [...signatures.entries()].sort((a, b) => b[1].prominence - a[1].prominence)
  const tierOf = new Map<string, number>()
  let tier = 0
  ordered.forEach(([key, entry], position) => {
    const previous = ordered[position - 1]?.[1]
    if (previous && previous.prominence - entry.prominence >= 0.6) tier++
    tierOf.set(key, tier)
  })
  // The tier holding the paper's broad divisions (Introduction, Methods…) is level 1.
  const majorTier = ordered
    .filter(([, entry]) => entry.major > 0)
    .sort((a, b) => b[1].major - a[1].major)[0]?.[0]
  const offset = majorTier ? (tierOf.get(majorTier) ?? 0) : 0
  const levelOfSignature = (key: string) => {
    const entry = signatures.get(key)
    const depths = entry?.depths ?? []
    if (depths.length) {
      const counts = new Map<number, number>()
      for (const depth of depths) counts.set(depth, (counts.get(depth) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1
    }
    return Math.max(1, (tierOf.get(key) ?? 0) - offset + 1)
  }

  // 5. Bookmarks are the author's own structure; use them when they are usable.
  const bookmarks = flattenBookmarks(outline)
  const usable = new Set(bookmarks.map((bookmark) => bookmark.page)).size >= 2 || bookmarks.length >= 3
  const used = new Set<string>()
  const pageBlocks = new Map<number, Array<{ block: StudyBlock; index: number }>>()
  blocks.forEach((block, index) => {
    const entries = pageBlocks.get(block.pageIndex) ?? []
    entries.push({ block, index })
    pageBlocks.set(block.pageIndex, entries)
  })
  const bookmarkKeys = new Set(bookmarks.map((bookmark) => `${bookmark.page}:${headingKey(bookmark.title)}`))
  const bookmarkLevels: Array<{ index: number; level: number }> = []
  if (usable)
    for (const bookmark of bookmarks) {
      const title = compact(bookmark.title)
      const key = headingKey(bookmark.title)
      const page = pageBlocks.get(bookmark.page - 1) ?? []
      const onPage = page.filter(({ block }) => !furniture.has(block.id))
      const matches = ({ block }: { block: StudyBlock }) => {
        if (block.rawText.length > 300) return false
        const text = compact(block.rawText)
        const blockKey = headingKey(block.rawText)
        return [
          [text, title],
          [blockKey, key],
        ].some(
          ([a, b]) =>
            !!a &&
            !!b &&
            (a === b || a.startsWith(b) || (b.startsWith(a) && a.length >= Math.max(4, b.length * 0.6))),
        )
      }
      const level = Math.min(6, bookmark.depth + 1)
      // Without a matching heading line the bookmark starts at the top of its page.
      // A deeper bookmark may share that start (Part 1 › Chapter 1); a sibling may not.
      const match =
        onPage.find((entry) => !used.has(entry.block.id) && matches(entry) && isCandidate.has(entry.index)) ??
        onPage.find((entry) => !used.has(entry.block.id) && matches(entry)) ??
        (page[0] && (boundaries.get(page[0].block.id) ?? []).every((boundary) => boundary.level < level)
          ? page[0]
          : undefined)
      if (!match) continue
      used.add(match.block.id)
      bookmarkLevels.push({ index: match.index, level })
      addBoundary(match.block.id, {
        title: bookmark.title,
        level,
        source: "bookmark",
        isHeading: matches(match),
      })
    }
  bookmarkLevels.sort((a, b) => a.index - b.index)

  // 6. Native headings, nested below the enclosing bookmark when there is one.
  let previousLevel = 0
  for (const candidate of structural) {
    if (used.has(candidate.block.id)) continue
    // A bookmark already names this heading (e.g. on the same page with the same words).
    if (bookmarkKeys.has(`${candidate.block.pageIndex + 1}:${headingKey(candidate.block.rawText)}`)) continue
    const enclosing = bookmarkLevels.filter((entry) => entry.index < candidate.index).at(-1)?.level ?? 0
    let level = enclosing + levelOfSignature(signatureKey.get(candidate) ?? "plain")
    // Levels descend one step at a time; a first heading is always top level.
    level = Math.max(enclosing + 1, Math.min(level, Math.max(enclosing, previousLevel) + 1, 6))
    previousLevel = level
    addBoundary(candidate.block.id, {
      title: singleLine(candidate.block.rawText),
      level,
      source: "heading",
      isHeading: true,
    })
  }
  return {
    boundaries,
    furniture,
    ...(documentTitle ? { documentTitle } : {}),
    ...(documentTitleBlockId ? { documentTitleBlockId } : {}),
  }
}

/** Kind of a section by its own title, inheriting back matter from its parent. */
export function sectionKind(title: string, parentKind: SectionKind | null): SectionKind {
  if (parentKind === "back") return "back"
  return headingNameKind(title) === "back" ? "back" : "body"
}

/** The section and every section nested inside it. */
export function sectionSubtree(sections: StudySection[], sectionId: string): Set<string> {
  const ids = new Set<string>()
  const index = sections.findIndex((section) => section.id === sectionId)
  if (index < 0) return ids
  const root = sections[index]
  if (!root) return ids
  ids.add(root.id)
  for (const section of sections.slice(index + 1)) {
    if (section.level <= root.level) break
    ids.add(section.id)
  }
  return ids
}
