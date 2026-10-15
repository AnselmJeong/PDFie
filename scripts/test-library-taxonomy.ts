import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StudyLibrary } from "../src/bun/persistence/study-library"
import { StudyStore } from "../src/bun/persistence/study-store"

const root = await mkdtemp(join(tmpdir(), "pdfie-taxonomy-"))
let store = new StudyStore(join(root, "library.sqlite"))
let library = new StudyLibrary(store)
const hash = (n: number) => n.toString(16).padStart(64, "0")
try {
  for (let i = 1; i <= 3; i++) {
    library.remember(hash(i), `${i}.pdf`, null)
    store.begin(hash(i), 1, [])
  }
  library.update(hash(1), { topic: "作業記憶", archived: true })
  library.update(hash(2), { topic: "인지 발달" })
  let token = library.setClassification(hash(3), { state: "running", reason: "test" })
  library.finishClassification(hash(3), token, { state: "complete", reason: "본문 근거" }, "作業記憶")
  const snapshot = store.snapshot(hash(1))
  const preview = library.taxonomy.preview("作業記憶", "인지 발달")
  assert.equal(preview.count, 2)
  assert.equal(preview.manualCount, 1)
  assert.equal(preview.merge, true)
  library.taxonomy.apply(preview.source, preview.target, preview.token)
  assert.equal(library.detail(hash(1)).document.topic, "인지 발달")
  assert.equal(library.classification(hash(1))?.state, "manual")
  assert.equal(library.taxonomy.resolve("作業記憶"), "인지 발달")
  assert.deepEqual(store.snapshot(hash(1)), snapshot)
  library.taxonomy.undo()
  assert.equal(library.detail(hash(1)).document.topic, "作業記憶")
  assert.equal(library.taxonomy.resolve("作業記憶"), "作業記憶")
  const stale = library.taxonomy.preview("作業記憶", "인지 발달")
  library.update(hash(3), { topic: "수동 수정" })
  assert.throws(() => library.taxonomy.apply(stale.source, stale.target, stale.token), /다시 확인/)
  const rename = library.taxonomy.preview("作業記憶", "작업 기억")
  library.taxonomy.apply(rename.source, rename.target, rename.token)
  const merge = library.taxonomy.preview("작업 기억", "인지 발달")
  library.taxonomy.apply(merge.source, merge.target, merge.token)
  assert.equal(library.taxonomy.resolve("作業記憶"), "인지 발달")
  library.remember(hash(4), "new.pdf", null)
  token = library.setClassification(hash(4), { state: "running", reason: "test" })
  library.finishClassification(hash(4), token, { state: "complete", reason: "AI used old label" }, "作業記憶")
  assert.equal(library.detail(hash(4)).document.topic, "인지 발달")
  assert.equal(library.detail(hash(3)).document.topic, "수동 수정")
  assert.throws(() => library.taxonomy.undo(), /이후 분류/)
  store.db.close()
  store = new StudyStore(join(root, "library.sqlite"))
  library = new StudyLibrary(store)
  assert.equal(library.taxonomy.resolve("作業記憶"), "인지 발달")
  assert.deepEqual(library.taxonomy.snapshot().topics.sort(), ["수동 수정", "인지 발달"].sort())
  assert.deepEqual(store.snapshot(hash(1)), snapshot)
  console.log(
    "Library taxonomy: preview incl archived/manual, explicit merge/rename, safe undo, stale preview guard, alias reuse and restart passed",
  )
} finally {
  store.db.close()
  await rm(root, { recursive: true, force: true })
}
