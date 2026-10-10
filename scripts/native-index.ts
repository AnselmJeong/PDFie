import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PdfiumNative } from "@embedpdf/engines/pdfium"
import type { PdfBookmarkObject } from "@embedpdf/models"
import { init } from "@embedpdf/pdfium"
import type { StudyStore } from "../src/bun/persistence/study-store"
import type { PdfOutlineNode } from "../src/shared/pdf/domain"
import { analysisByteLength, type PageAnalysis } from "../src/shared/study/contracts"
import { groupNativeRuns } from "../src/views/main/features/pdf/adapters/study-analysis"

// Mirrors the viewer's bookmark normalization so bookmark-led sections are checked too.
function outlineOf(nodes: PdfBookmarkObject[], parent = "root"): PdfOutlineNode[] {
  return nodes.map((node, index) => {
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
      children: outlineOf(node.children ?? [], `${parent}-${index}`),
    }
  })
}

/** Indexes a PDF into a study store with the same native analysis the viewer runs. */
export async function indexPdf(path: string, store: StudyStore) {
  const bytes = await readFile(path)
  const documentHash = createHash("sha256").update(bytes).digest("hex")
  const engine = new PdfiumNative(
    await init({
      wasmBinary: await readFile(
        import.meta.resolve("@embedpdf/pdfium/pdfium.wasm").replace(/^file:\/\//, ""),
      ),
    }),
    { fontFallback: null },
  )
  try {
    const document = await engine
      .openDocumentBuffer({
        id: "native-check",
        content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      })
      .toPromise()
    const outline = outlineOf((await engine.getBookmarks(document).toPromise()).bookmarks)
    store.begin(documentHash, document.pages.length, outline)
    const pages = []
    for (const page of document.pages) {
      const geometry = await engine.getPageGeometry(document, page).toPromise()
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
      const richRuns = (await engine.getPageTextRuns(document, page).toPromise()).runs
      const blocks = groupNativeRuns(geometry, texts, page.size.width, page.size.height, richRuns)
      const data: PageAnalysis = {
        pageIndex: page.index,
        width: page.size.width,
        height: page.size.height,
        status: blocks.length ? "ready" : "needs-ocr",
        blocks,
      }
      store.ingest(documentHash, data)
      // Report counts and status, never source passages or account data.
      pages.push({
        page: page.index + 1,
        nativeRuns: geometry.runs.length,
        blocks: blocks.length,
        sourceCharacters: texts.join("").length,
        payloadBytes: analysisByteLength(data),
        status: data.status,
      })
    }
    return { documentHash, pages }
  } finally {
    await engine.destroy().toPromise()
  }
}
