import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { PdfiumNative } from "@embedpdf/engines/pdfium"
import { init } from "@embedpdf/pdfium"
import { StudyStore } from "../src/bun/persistence/study-store"
import { analysisByteLength, type PageAnalysis } from "../src/shared/study/contracts"
import { groupNativeRuns } from "../src/views/main/features/pdf/adapters/study-analysis"

const path = process.argv[2]
if (!path) throw new Error("Usage: bun scripts/check-native-index.ts <PDF path> [report.json]")
const bytes = await readFile(path)
const documentHash = createHash("sha256").update(bytes).digest("hex")
const directory = await mkdtemp(join(tmpdir(), "pdfie-native-index-"))
const store = new StudyStore(join(directory, "index.sqlite"))
const engine = new PdfiumNative(
  await init({
    wasmBinary: await readFile(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm").replace(/^file:\/\//, "")),
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
  store.begin(documentHash, document.pages.length, [])
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
  const indexedBlocks = store.blocks(documentHash)
  const sections = store.sections(documentHash, indexedBlocks)
  const report = {
    fileName: basename(path),
    documentHash,
    engine: "EmbedPDF/PDFium 2.14.4",
    index: store.index(documentHash),
    pages,
    sections: sections.map((section) => ({
      title: section.title,
      pageStart: section.pageStart,
      pageEnd: section.pageEnd,
      source: section.source,
      sourceUnits: indexedBlocks.filter((block) => block.sectionId === section.id).length,
    })),
  }
  if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ fileName: report.fileName, ...report.index }))
} finally {
  await engine.destroy().toPromise()
  store.close()
  await rm(directory, { recursive: true, force: true })
}
