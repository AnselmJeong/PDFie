import type { PluginRegistry } from "@embedpdf/core"
import type { PdfDocumentObject, PdfPageGeometry, PdfTask, PdfTextRun } from "@embedpdf/models"
import type { PdfOutlineNode, PdfRect } from "../../../../../shared/pdf/domain"
import {
  analysisByteLength,
  type BlockStyle,
  INDEX_VERSION,
  MAX_PAGE_ANALYSIS_BYTES,
  MAX_PAGE_BLOCKS,
  type PageAnalysis,
  type StudyBlock,
} from "../../../../../shared/study/contracts"
import {
  CAPTION_PATTERN,
  headingScore,
  isBoldFont,
  isItalicFont,
} from "../../../../../shared/study/section-structure"

interface NativeAccess {
  getCoreDocument(id: string): { document?: PdfDocumentObject } | null
}
export function nativeDocument(registry: PluginRegistry, id: string) {
  const selection = registry.getPlugin("selection") as unknown as NativeAccess | null
  const document = selection?.getCoreDocument(id)?.document
  if (!document) throw new Error("PDF 원문 분석 기능을 준비하지 못했습니다.")
  return document
}
export function groupNativeRuns(
  geometry: PdfPageGeometry,
  texts: string[],
  width: number,
  height: number,
  richRuns?: PdfTextRun[],
): StudyBlock[] {
  // Some PDFs report a font size of 1 with a scaled text matrix. Visible glyph
  // height, weighted by character count, is stable across word/line-run PDFs.
  const sizes = geometry.runs
    .flatMap((run) => {
      const size = run.glyphs.find((g) => g.height > 3 && g.flags !== 2)?.height
      return size && size < 100 ? (Array(Math.min(run.glyphs.length, 200)).fill(size) as number[]) : []
    })
    .sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)] ?? 12
  // Typographic size: the run's font size when the page reports real sizes,
  // otherwise visible glyph height, which PDFium rounds to whole units.
  const textRuns = geometry.runs.filter((run) => run.glyphs.some((g) => g.flags !== 2 && g.height > 0))
  const reportsPoints =
    textRuns.length > 0 &&
    textRuns.filter((run) => (run.fontSize ?? 0) > 3 && (run.fontSize ?? 0) < 200).length >=
      textRuns.length * 0.8
  const runSize = (run: PdfPageGeometry["runs"][number]): number =>
    reportsPoints && run.fontSize
      ? run.fontSize
      : (run.glyphs.find((g) => g.height > 3 && g.flags !== 2)?.height ?? median)
  const bodySizes = reportsPoints
    ? textRuns
        .flatMap((run) => Array(Math.min(run.glyphs.length, 200)).fill(runSize(run)) as number[])
        .sort((a, b) => a - b)
    : sizes
  const bodySize = bodySizes[Math.floor(bodySizes.length / 2)] ?? median
  type Line = {
    text: string
    rects: PdfRect[]
    height: number
    size: number
    order: number
    characters: number
    bold: number
    colored: number
    italic: number
    style: string
  }
  const lines: Line[] = []
  let styleIndex = 0
  let separator = ""
  geometry.runs.forEach((run, order) => {
    const text = (texts[order] ?? "")?.replaceAll(String.fromCharCode(0), "").replace(/[\uFFFE\uFFFF]/g, "")
    if (!text.trim()) {
      separator += text
      return
    }
    while (
      richRuns?.[styleIndex] &&
      richRuns[styleIndex]!.charIndex + richRuns[styleIndex]!.charCount <= run.charStart
    )
      styleIndex++
    const style = richRuns?.[styleIndex]
    const matches =
      style &&
      style.charIndex < run.charStart + run.glyphs.length &&
      style.charIndex + style.charCount > run.charStart
    const characters = text.replace(/\s/g, "").length
    const bold = matches && isBoldFont(style.font) ? characters : 0
    const italic = matches && isItalicFont(style.font) ? characters : 0
    const color = matches ? style.color : undefined
    const colored =
      color &&
      Math.max(color.red, color.green, color.blue) - Math.min(color.red, color.green, color.blue) > 25
        ? characters
        : 0
    const styleKey = matches ? `${style.font.name}/${color?.red}/${color?.green}/${color?.blue}` : ""
    // Derive line rectangles from glyph positions, never one box across columns.
    const rects: PdfRect[] = []
    for (const glyph of run.glyphs) {
      if (glyph.flags === 2 || glyph.width <= 0 || glyph.height <= 0) continue
      const rect = {
        x: Math.max(0, glyph.x),
        y: Math.max(0, glyph.y),
        width: Math.min(glyph.width, width - Math.max(0, glyph.x)),
        height: Math.min(glyph.height, height - Math.max(0, glyph.y)),
      }
      if (rect.width <= 0 || rect.height <= 0) continue
      const previous = rects.at(-1)
      if (
        previous &&
        Math.abs(previous.y - rect.y) < Math.max(2, rect.height * 0.3) &&
        rect.x >= previous.x &&
        rect.x - previous.x - previous.width < median * 0.8
      ) {
        previous.width = Math.max(previous.width, rect.x + rect.width - previous.x)
        previous.height = Math.max(previous.height, rect.height)
      } else rects.push(rect)
    }
    const previous = lines.at(-1)
    const left = previous?.rects.at(-1),
      right = rects[0]
    const overlap =
      left && right ? Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) : 0
    const sameLine =
      left &&
      right &&
      previous?.rects.length === 1 &&
      rects.length === 1 &&
      overlap / Math.min(left.height, right.height) >= 0.45 &&
      right.x >= left.x &&
      right.x - left.x - left.width < median * 0.8
    if (
      previous &&
      left &&
      right &&
      sameLine &&
      previous.text.length + text.length + separator.length <= 12000
    ) {
      // Retain the engine's whitespace and punctuation, including superscripts.
      previous.text += separator + text
      const bottom = Math.max(left.y + left.height, right.y + right.height)
      left.width = Math.max(left.width, right.x + right.width - left.x)
      left.y = Math.min(left.y, right.y)
      left.height = bottom - left.y
      previous.height = Math.max(previous.height, right.height)
      previous.size = Math.max(previous.size, runSize(run))
      previous.characters += characters
      previous.bold += bold
      previous.colored += colored
      previous.italic += italic
      if (!previous.style) previous.style = styleKey
    } else {
      lines.push({
        text,
        rects,
        height: Math.max(0, ...rects.map((r) => r.height)),
        size: runSize(run),
        order,
        characters,
        bold,
        colored,
        italic,
        style: styleKey,
      })
    }
    separator = ""
  })
  const blocks: StudyBlock[] = []
  // Per-block typography accumulated over its lines.
  const totals = new Map<StudyBlock, { characters: number; bold: number; colored: number; italic: number }>()
  const emphasis = (line: Line) =>
    `${line.bold / Math.max(1, line.characters) >= 0.7}/${line.colored / Math.max(1, line.characters) >= 0.7}`
  const blockEmphasis = new Map<StudyBlock, string>()
  for (const line of lines) {
    const rawText = line.text.trim()
    if (!/[\p{L}\p{N}]/u.test(rawText)) continue
    const rect = line.rects[0]
    const share = (value: number) => Math.round((value / Math.max(1, line.characters)) * 100) / 100
    const lineStyle: BlockStyle = {
      size: Math.round(line.size * 100) / 100,
      bold: share(line.bold),
      colored: share(line.colored),
      italic: share(line.italic),
      font: line.style.slice(0, 300),
      top: rect ? Math.round((rect.y / height) * 1000) / 1000 : 0,
      left: rect ? Math.round((rect.x / width) * 1000) / 1000 : 0,
    }
    const caption = CAPTION_PATTERN.test(rawText)
    const reference = !caption && /^\[?\d+\]?\s+.+(?:doi|\d{4})/i.test(rawText)
    // A page-level estimate; the study index confirms headings against the
    // whole document's body style, numbering and bookmarks.
    const heading =
      !caption && !reference && headingScore(rawText, "paragraph", 1, lineStyle, { bodySize }) >= 3
    const role = heading ? "heading" : caption ? "caption" : reference ? "reference" : "paragraph"
    const quality =
      line.rects.length && rawText.length <= 12000 && !rawText.includes("�") && line.rects.length <= 300
        ? "usable"
        : "uncertain"
    const previous = blocks.at(-1)
    const first = previous?.rects[0],
      last = previous?.rects.at(-1),
      next = line.rects[0]
    // Only continue down the same column. Indentation, extra vertical space and
    // a change of emphasis start a new block; never union a rectangle across lines.
    if (
      previous &&
      first &&
      last &&
      next &&
      line.rects.length === 1 &&
      ((role === "paragraph" &&
        previous.role === "paragraph" &&
        blockEmphasis.get(previous) === emphasis(line)) ||
        (role === "heading" &&
          previous.role === "heading" &&
          line.style === previous.style?.font &&
          Math.abs(line.size - (previous.style?.size ?? 0)) <= Math.max(0.5, line.size * 0.06))) &&
      next.y - last.y >= Math.min(last.height, next.height) * 0.65 &&
      next.y - last.y <= Math.max(last.height, next.height) * 1.65 &&
      Math.abs(next.x - first.x) <= median * 0.6 &&
      Math.max(last.height, next.height) / Math.min(last.height, next.height) < 1.25 &&
      previous.rawText.length + rawText.length + 1 <= (role === "heading" ? 300 : 12000) &&
      previous.rects.length < 300
    ) {
      previous.rawText += `\n${rawText}`
      previous.rects.push(next)
      if (quality === "uncertain") previous.quality = quality
      const total = totals.get(previous)
      if (total) {
        total.characters += line.characters
        total.bold += line.bold
        total.colored += line.colored
        total.italic += line.italic
      }
      continue
    }
    const block: StudyBlock = {
      id: "",
      documentHash: "",
      revision: INDEX_VERSION,
      pageIndex: 0,
      rawText,
      normalizedText: "",
      rects: line.rects,
      order: line.order,
      role,
      quality,
      sectionId: "",
      style: lineStyle,
    }
    blocks.push(block)
    blockEmphasis.set(block, emphasis(line))
    totals.set(block, {
      characters: line.characters,
      bold: line.bold,
      colored: line.colored,
      italic: line.italic,
    })
  }
  for (const block of blocks) {
    const total = totals.get(block)
    if (!block.style || !total) continue
    const share = (value: number) => Math.round((value / Math.max(1, total.characters)) * 100) / 100
    block.style.bold = share(total.bold)
    block.style.colored = share(total.colored)
    block.style.italic = share(total.italic)
  }
  return blocks
}
export function beginNativeAnalysis(
  registry: PluginRegistry,
  sdkDocumentId: string,
  sourceId: string,
  pageCount: number,
  outline: PdfOutlineNode[],
  onChange: () => void,
  onError: (message: string) => void,
) {
  let cancelled = false
  let task: Pick<PdfTask<unknown>, "abort"> | null = null
  const run = async () => {
    const { rpc } = await import("../../../rpc")
    const document = nativeDocument(registry, sdkDocumentId)
    const begin = await rpc.request["study.index.begin"]({ documentId: sourceId, pageCount, outline })
    const cached = new Set(begin.completedPages)
    for (let pageIndex = 0; pageIndex < pageCount && !cancelled; pageIndex++) {
      if (cached.has(pageIndex)) continue
      const page = document.pages[pageIndex]
      if (!page) continue
      const data: PageAnalysis = {
        pageIndex,
        width: page.size.width,
        height: page.size.height,
        status: "failed",
        blocks: [],
      }
      try {
        const geometryTask = registry.getEngine().getPageGeometry(document, page)
        task = geometryTask
        const geometry = await geometryTask.toPromise()
        if (cancelled) return
        if (geometry.runs.length > 50000) throw new Error("페이지의 텍스트 조각이 처리 한도를 초과했습니다.")
        const textTask = registry.getEngine().getTextSlices(
          document,
          geometry.runs.map((run) => ({ pageIndex, charIndex: run.charStart, charCount: run.glyphs.length })),
        )
        task = textTask
        const texts = await textTask.toPromise()
        if (cancelled) return
        let richRuns: PdfTextRun[] | undefined
        try {
          const styleTask = registry.getEngine().getPageTextRuns(document, page)
          task = styleTask
          richRuns = (await styleTask.toPromise()).runs
        } catch {
          // Geometry remains usable when a PDF has no readable font metadata.
        }
        if (cancelled) return
        data.blocks = groupNativeRuns(geometry, texts, page.size.width, page.size.height, richRuns)
        data.status = data.blocks.length ? "ready" : "needs-ocr"
      } catch (cause) {
        if (cancelled) return
        data.error =
          cause instanceof Error ? cause.message.slice(0, 1000) : "원문 텍스트를 추출하지 못했습니다."
      }
      if (analysisByteLength(data) > MAX_PAGE_ANALYSIS_BYTES || data.blocks.length > MAX_PAGE_BLOCKS) {
        data.status = "failed"
        data.blocks = []
        data.error = "페이지 분석 데이터가 저장 한도를 초과했습니다."
      }
      await rpc.request["study.index.page"]({ documentId: sourceId, page: data })
      if (cancelled) return
      if (pageIndex % 3 === 0 || pageIndex === pageCount - 1) onChange()
      // Yield between pages so reading and selection keep priority.
      await new Promise<void>((resolve) => setTimeout(resolve, 15))
    }
    if (!cancelled) onChange()
  }
  void run().catch((cause) => {
    if (!cancelled) onError(cause instanceof Error ? cause.message : "문서 분석을 완료하지 못했습니다.")
  })
  return () => {
    cancelled = true
    task?.abort({ code: 5, message: "Document closed" })
  }
}
