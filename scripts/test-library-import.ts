import assert from "node:assert/strict"
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { backgroundIndexer } from "../src/bun/pdf/background-index"
import { restoreMultipleSelectedPaths } from "../src/bun/pdf/open-file-dialog"
import { StudyLibrary } from "../src/bun/persistence/study-library"
import { StudyStore } from "../src/bun/persistence/study-store"
import { LibraryImporter } from "../src/bun/study/library-importer"

const root = await mkdtemp(join(tmpdir(), "pdfie-import-"))
const path = join(root, "library.sqlite")
let store = new StudyStore(path)
let library = new StudyLibrary(store)
let importer: LibraryImporter | null = null
const classified: string[] = []
async function complete() {
  for (let n = 0; n < 1500; n++) {
    const phase = importer?.status().phase
    if (phase === "complete" || phase === "cancelled") {
      await Bun.sleep(10)
      return
    }
    await Bun.sleep(20)
  }
  throw new Error("Import timed out")
}
try {
  const files = join(root, "papers")
  const nested = join(files, "nested")
  await mkdir(nested, { recursive: true })
  const first = join(files, "paper, with comma.pdf")
  await copyFile(resolve("tests/fixtures/pdf/generated/single-column-en.pdf"), first)
  await copyFile(first, join(nested, "same-content.PDF"))
  await copyFile(resolve("tests/fixtures/pdf/generated/scanned-image.pdf"), join(nested, "scanned.pdf"))
  await writeFile(join(files, "broken.pdf"), "%PDF-1.7 invalid contents")
  await writeFile(join(files, "notes.txt"), "ignored")
  await symlink(files, join(nested, "loop"))
  const paths = new Set([first, join(nested, "scanned.pdf")])
  assert.deepEqual(
    await restoreMultipleSelectedPaths([...paths].join(",").split(","), async (p) => paths.has(p)),
    [...paths],
  )
  assert.deepEqual(await restoreMultipleSelectedPaths([""], async () => false), [])
  await assert.rejects(
    restoreMultipleSelectedPaths(["/a", "/b"], async () => true),
    /구분/,
  )
  importer = new LibraryImporter(
    store,
    library,
    backgroundIndexer(store),
    () => {},
    (hash) => classified.push(hash),
  )
  importer.start([files, first])
  await complete()
  let status = importer.status()
  assert.equal(status.total, 4)
  assert.equal(status.added, 2)
  assert.equal(status.duplicates, 1)
  assert.equal(status.failed, 1)
  assert.ok(status.issues.some((item) => item.error.includes("OCR")))
  assert.equal(library.list().total, 2) // Unopenable PDFs stay in the failure list, not the library.
  const valid = library
    .list()
    .items.find((doc) => doc.pageCount > 0 && store.blocks(doc.documentHash).length > 0)
  assert.ok(valid)
  const token = library.setClassification(valid.documentHash, { state: "running", reason: "test" })
  library.finishClassification(
    valid.documentHash,
    token,
    { state: "complete", reason: "test" },
    "테스트 주제",
  )
  assert.equal(importer.status().classifications.complete, 1)
  const snapshot = store.snapshot(valid.documentHash)
  library.update(valid.documentHash, { topic: "내 주제" })
  importer.start([first])
  await complete()
  status = importer.status()
  assert.equal(status.duplicates, 1)
  assert.equal(library.detail(valid.documentHash).document.topic, "내 주제")
  assert.deepEqual(store.snapshot(valid.documentHash), snapshot)

  // Cancellation leaves completed papers, resumes only interrupted work on app restart.
  await importer.close()
  const slowFile = join(root, "slow.pdf")
  await writeFile(slowFile, "%PDF-1.7\nunique slow fixture")
  importer = new LibraryImporter(
    store,
    library,
    async (_path, hash, signal) => {
      assert.ok(!library.classificationCandidates().includes(hash))
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("abort")), { once: true }),
      )
    },
    () => {},
    () => {},
  )
  importer.start([slowFile])
  for (let n = 0; n < 100 && !importer.status().active; n++) await Bun.sleep(10)
  await Bun.sleep(40)
  await importer.close()
  assert.equal(importer.status().pending, 1)
  store.db.close()
  store = new StudyStore(path)
  library = new StudyLibrary(store)
  let resumed = 0
  importer = new LibraryImporter(
    store,
    library,
    async (_path, hash) => {
      resumed++
      store.begin(hash, 1, [])
      store.ingest(hash, { pageIndex: 0, width: 600, height: 800, status: "needs-ocr", blocks: [] })
    },
    () => {},
    () => {},
  )
  importer.resume()
  await complete()
  assert.equal(resumed, 1)
  assert.equal(importer.status().added, 1)
  assert.equal(library.detail(valid.documentHash).document.topic, "내 주제")
  importer.start([first, join(nested, "scanned.pdf")])
  await importer.cancel()
  assert.equal(importer.status().phase, "cancelled")
  assert.deepEqual(store.snapshot(valid.documentHash), snapshot)
  assert.ok(classified.length >= 2)
  console.log(
    "Library import: real PDFium, recursive scan, commas, content duplicates, OCR/corrupt PDF, source preservation, cancellation and restart passed",
  )
} finally {
  await importer?.close()
  store.db.close()
  await rm(root, { recursive: true, force: true })
}
