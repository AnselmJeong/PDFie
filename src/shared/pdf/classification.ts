import type { DocumentType, PdfOutlineNode } from "./domain"

export interface PdfFastFacts {
  pageCount: number
  firstPagesText: string
  latePagesText: string
  outline: PdfOutlineNode[]
  metadataText?: string
}

export interface ClassificationEvidence {
  code: string
  weight: number
  target: "article" | "book"
  detail?: string
}

export interface ClassificationResult {
  documentType: DocumentType
  confidence: number
  articleScore: number
  bookScore: number
  evidence: ClassificationEvidence[]
}

function flattenOutline(nodes: PdfOutlineNode[]): PdfOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)])
}

export function classifyPdfDocument(facts: PdfFastFacts): ClassificationResult {
  const evidence: ClassificationEvidence[] = []
  const first = facts.firstPagesText.normalize("NFKC")
  const late = facts.latePagesText.normalize("NFKC")
  const metadata = facts.metadataText?.normalize("NFKC") ?? ""
  const outline = flattenOutline(facts.outline)
  const add = (target: "article" | "book", code: string, weight: number, detail?: string) =>
    evidence.push({ target, code, weight, detail })

  if (/\b10\.\d{4,9}\/[\w.()/:;-]+/i.test(first)) add("article", "doi-first-pages", 4)
  if (/\babstract\b/i.test(first) && /\b(author|affiliation|university|department)\b/i.test(first))
    add("article", "abstract-author-structure", 4)
  if (/\b(journal|conference|proceedings|volume\s+\d+)\b/i.test(`${metadata}\n${first}`))
    add("article", "scholarly-metadata", 3)
  if (/\b(references|bibliography)\b/i.test(late)) add("article", "late-references", 2)
  if (/\bISBN(?:-1[03])?\s*:?[\s\d-]{10,20}\b/i.test(`${metadata}\n${first}`)) add("book", "isbn", 4)

  const chapterNodes = outline.filter((node) => /^(chapter|chap\.?|제\s*\d+\s*장)\b/i.test(node.title))
  if (chapterNodes.length >= 3) add("book", "semantic-chapter-bookmarks", 5, String(chapterNodes.length))
  const hasPartChapter = facts.outline.some(
    (node) =>
      /^(part|book|volume|unit)\b/i.test(node.title) &&
      flattenOutline(node.children).some((child) => /chapter/i.test(child.title)),
  )
  if (hasPartChapter) add("book", "part-chapter-structure", 4)
  const outlineTitles = outline.map((node) => node.title).join("\n")
  if (/\b(preface|contents)\b/i.test(outlineTitles) && /\b(index|notes)\b/i.test(outlineTitles))
    add("book", "front-back-matter", 3)
  if (facts.pageCount >= 100) add("book", "pages-at-least-100", 1)
  if (facts.pageCount <= 40) add("article", "pages-at-most-40", 1)

  const articleScore = evidence
    .filter((item) => item.target === "article")
    .reduce((sum, item) => sum + item.weight, 0)
  const bookScore = evidence
    .filter((item) => item.target === "book")
    .reduce((sum, item) => sum + item.weight, 0)
  const winner = Math.max(articleScore, bookScore)
  const difference = Math.abs(articleScore - bookScore)
  const documentType: DocumentType =
    winner >= 6 && difference >= 3 ? (articleScore > bookScore ? "article" : "book") : "unknown"
  const confidence =
    documentType === "unknown" ? Math.min(0.79, winner / 10) : Math.min(0.99, 0.75 + difference * 0.04)
  return { documentType, confidence, articleScore, bookScore, evidence }
}
