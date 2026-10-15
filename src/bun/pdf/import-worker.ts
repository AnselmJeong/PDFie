import { createHash } from "node:crypto"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import { PdfiumNative } from "@embedpdf/engines/pdfium"
import type { PdfBookmarkObject, PdfTextRun } from "@embedpdf/models"
import { init } from "@embedpdf/pdfium"
import type { PdfOutlineNode } from "../../shared/pdf/domain"
import {
  analysisByteLength,
  MAX_PAGE_ANALYSIS_BYTES,
  MAX_PAGE_BLOCKS,
  type PageAnalysis,
} from "../../shared/study/contracts"
import { groupNativeRuns } from "../../shared/study/native-page-analysis"

function outlineOf(nodes: PdfBookmarkObject[], parent = "root", depth = 0): PdfOutlineNode[] {
  if (depth > 32) return []
  return nodes.slice(0, 2000).map((node, index) => {
    const target = node.target
    const destination =
      target?.type === "destination"
        ? target.destination
        : target?.type === "action" && "destination" in target.action
          ? target.action.destination
          : undefined
    return {
      id: `${parent}-${index}`,
      title: node.title.trim() || "Untitled",
      pageNumber: destination ? destination.pageIndex + 1 : null,
      children: outlineOf(node.children ?? [], `${parent}-${index}`, depth + 1),
    }
  })
}
const [path, wasmPath, expectedHash, skipJSON = "[]"] = process.argv.slice(2)
if (!path || !wasmPath || !expectedHash) throw new Error("Missing PDF import arguments")
const emit = async (value: unknown) => {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) await once(process.stdout, "drain")
}
const bytes = await readFile(path)
if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
  throw new Error("가져오는 동안 PDF 파일이 변경되었습니다. 다시 추가하세요.")
const engine = new PdfiumNative(await init({ wasmBinary: await readFile(wasmPath) }), { fontFallback: null })
try {
  const document = await engine
    .openDocumentBuffer({
      id: "import",
      content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    .toPromise()
  if (document.pages.length < 1 || document.pages.length > 20000)
    throw new Error("지원하는 페이지 수를 초과했습니다.")
  let outline: PdfOutlineNode[] = []
  try {
    outline = outlineOf((await engine.getBookmarks(document).toPromise()).bookmarks)
  } catch {
    /* Text extraction does not require bookmarks. */
  }
  if (JSON.stringify(outline).length > 100000) outline = []
  await emit({ type: "begin", pageCount: document.pages.length, outline })
  const skip = new Set<number>(JSON.parse(skipJSON))
  for (const page of document.pages) {
    if (skip.has(page.index)) continue
    const data: PageAnalysis = {
      pageIndex: page.index,
      width: page.size.width,
      height: page.size.height,
      status: "failed",
      blocks: [],
    }
    try {
      const geometry = await engine.getPageGeometry(document, page).toPromise()
      if (geometry.runs.length > 50000) throw new Error("페이지의 텍스트 조각이 처리 한도를 초과했습니다.")
      const texts = await engine
        .getTextSlices(
          document,
          geometry.runs.map((run) => ({
            pageIndex: page.index,
            charIndex: run.charStart,
            charCount: run.glyphs.length,
          })),
        )
        .toPromise()
      let richRuns: PdfTextRun[] | undefined
      try {
        richRuns = (await engine.getPageTextRuns(document, page).toPromise()).runs
      } catch {
        /* Geometry remains usable. */
      }
      data.blocks = groupNativeRuns(geometry, texts, page.size.width, page.size.height, richRuns)
      data.status = data.blocks.length ? "ready" : "needs-ocr"
      if (analysisByteLength(data) > MAX_PAGE_ANALYSIS_BYTES || data.blocks.length > MAX_PAGE_BLOCKS)
        throw new Error("페이지 분석 데이터가 처리 한도를 초과했습니다.")
    } catch (cause) {
      data.status = "failed"
      data.blocks = []
      data.error = cause instanceof Error ? cause.message.slice(0, 1000) : "본문 분석에 실패했습니다."
    }
    await emit({ type: "page", page: data })
  }
  await emit({ type: "done" })
} finally {
  await engine.destroy().toPromise()
}
