import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { StudyStore } from "../src/bun/persistence/study-store"
import { indexPdf } from "./native-index"

const path = process.argv[2]
if (!path) throw new Error("Usage: bun scripts/check-native-index.ts <PDF path> [report.json]")
const directory = await mkdtemp(join(tmpdir(), "pdfie-native-index-"))
const store = new StudyStore(join(directory, "index.sqlite"))
try {
  const { documentHash, pages } = await indexPdf(path, store)
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
      level: section.level,
      kind: section.kind,
      sourceUnits: indexedBlocks.filter((block) => block.sectionId === section.id).length,
    })),
  }
  if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ fileName: report.fileName, ...report.index }))
} finally {
  store.close()
  await rm(directory, { recursive: true, force: true })
}
