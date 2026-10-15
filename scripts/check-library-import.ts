import { Database } from "bun:sqlite"
import assert from "node:assert/strict"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { AiSettingsRepository } from "../src/bun/ai/ai-settings-repository"
import { CodexProvider } from "../src/bun/ai/providers/codex-provider"
import { OllamaProvider } from "../src/bun/ai/providers/ollama-provider"
import { backgroundIndexer } from "../src/bun/pdf/background-index"
import { StudyLibrary } from "../src/bun/persistence/study-library"
import { StudyStore } from "../src/bun/persistence/study-store"
import { LibraryImporter } from "../src/bun/study/library-importer"
import { TopicClassifier } from "../src/bun/study/topic-classifier"
import type { LibraryDocument } from "../src/shared/study/library"

if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live to use the configured AI connection with one linked library PDF; original records are read-only.",
  )
const userData = join(homedir(), "Library/Application Support/dev.aquatope.pdfie/stable")
const original = new Database(join(userData, "pdfie-study-v1.sqlite"), { readonly: true })
const source = original
  .query<{ source_path: string }, []>(
    "SELECT source_path FROM library_documents WHERE source_path IS NOT NULL ORDER BY rowid LIMIT 1",
  )
  .get()
original.close()
if (!source) throw new Error("A linked PDF is required")
const root = await mkdtemp(join(tmpdir(), "pdfie-live-import-"))
const settings = await AiSettingsRepository.open(
  join(userData, "pdfie-ai-settings-v1.json"),
  join(userData, "pdfie-secret-v1.key"),
)
const codex = new CodexProvider(join(userData, "codex"))
const store = new StudyStore(join(root, "library.sqlite"))
const library = new StudyLibrary(store)
const classifier = new TopicClassifier(
  store,
  library,
  settings,
  { codex, "ollama-cloud": new OllamaProvider(settings) },
  () => false,
  () => {},
  20,
)
const importer = new LibraryImporter(
  store,
  library,
  backgroundIndexer(store),
  () => {},
  (hash) => classifier.indexed(hash),
)
try {
  const manual = "e".repeat(64)
  library.remember(manual, "manual-protection.pdf", null)
  store.begin(manual, 1, [])
  library.update(manual, { topic: "직접 정한 기존 주제" })
  const before = library.detail(manual)
  await mkdir(join(root, "papers/nested"), { recursive: true })
  await copyFile(source.source_path, join(root, "papers/paper, original.pdf"))
  await copyFile(source.source_path, join(root, "papers/nested/duplicate.pdf"))
  importer.start([join(root, "papers")])
  const deadline = Date.now() + 150000
  let paper: LibraryDocument | undefined
  while (Date.now() < deadline) {
    paper = library.list().items.find((doc) => doc.documentHash !== manual)
    if (paper?.classification?.state === "failed") throw new Error(paper.classification.reason)
    if (importer.status().phase === "complete" && paper?.classification?.state === "complete") break
    await Bun.sleep(200)
  }
  assert.equal(importer.status().added, 1)
  assert.equal(importer.status().duplicates, 1)
  assert.equal(paper?.classification?.state, "complete")
  assert.ok(paper)
  assert.equal(importer.status().classifications.complete, 1)
  assert.deepEqual(library.detail(manual), before)
  const report = {
    import: importer.status(),
    topic: paper.topic,
    classification: paper.classification,
    pageCount: paper.pageCount,
    preservedManualAssignment: true,
  }
  console.log(JSON.stringify(report, null, 2))
  const destination = process.argv.find((arg) => arg.endsWith(".json"))
  if (destination) await Bun.write(destination, JSON.stringify(report, null, 2))
} finally {
  await importer.close()
  await classifier.close()
  codex.close()
  store.db.close()
  await rm(root, { recursive: true, force: true })
}
