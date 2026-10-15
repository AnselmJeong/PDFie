import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StudyLibrary } from "../src/bun/persistence/study-library"
import { StudyStore } from "../src/bun/persistence/study-store"

const directory = await mkdtemp(join(tmpdir(), "pdfie-organization-"))
const path = join(directory, "study.sqlite")
let store = new StudyStore(path)
const hash = (n: number) => n.toString(16).padStart(64, "0")
try {
  // Existing study records migrate without changing their identity or content.
  store.begin(hash(1), 12, [])
  const snapshot = store.snapshot(hash(1))
  let library = new StudyLibrary(store)
  assert.deepEqual(library.detail(hash(1)).snapshot, snapshot)
  assert.equal(library.detail(hash(1)).document.topic, "")
  const collection = library.saveCollection("  Brain   dynamics  ")
  const secondary = library.saveCollection("읽을 논문")
  assert.equal(collection.name, "Brain dynamics")
  assert.throws(() => library.saveCollection("brain DYNAMICS"), /같은 이름/)
  assert.throws(() => library.saveCollection(" "), /1~80/)
  assert.throws(() => library.saveCollection("x".repeat(81)), /1~80/)
  for (let n = 1; n <= 85; n++) {
    library.remember(hash(n), `논문 ${String(n).padStart(3, "0")}.pdf`, null)
    library.update(hash(n), { topic: n <= 81 ? "신경과학" : "통계", collectionIds: [collection.id] })
  }
  library.update(hash(1), { collectionIds: [collection.id, secondary.id, secondary.id], favorite: true })
  assert.equal(library.detail(hash(1)).document.collections.length, 2)
  assert.deepEqual(library.detail(hash(1)).snapshot, snapshot)
  assert.equal(library.list({ topic: "신경과학", collectionId: collection.id }).total, 81)
  assert.equal(library.list({ topic: "신경과학", collectionId: collection.id, offset: 80 }).items.length, 1)
  const first = library.list({ topic: "신경과학", sort: "title" })
  const second = library.list({ topic: "신경과학", sort: "title", offset: 40 })
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.documentHash)).size, 80)
  assert.equal(first.items[0]?.documentHash, hash(1))
  assert.equal(library.list({ query: "Brain dynamics" }).total, 85)
  assert.equal(library.list({ query: "신경과학" }).total, 81)
  assert.equal(library.list({ query: "%" }).total, 0)
  assert.equal(library.list({ topic: "' OR 1=1 --" }).total, 0)
  assert.throws(
    () => library.update(hash(1), { title: "변경되면 안 됨", collectionIds: ["missing"] }),
    /다시 선택/,
  )
  assert.equal(library.detail(hash(1)).document.title, "논문 001")
  library.update(hash(85), { archived: true })
  library.update(hash(84), { topic: "" })
  assert.equal(library.facets().total, 84)
  assert.equal(library.facets().unassigned, 1)
  assert.equal(library.facets().collections.find((c) => c.id === collection.id)?.count, 84)
  assert.equal(library.facets(true).collections.find((c) => c.id === collection.id)?.count, 1)
  assert.equal(library.list({ topic: "" }).items[0]?.documentHash, hash(84))
  assert.equal(library.list({ filter: "favorites", topic: "신경과학", collectionId: secondary.id }).total, 1)
  library.saveCollection("Brain networks", collection.id)
  store.db.close()
  store = new StudyStore(path)
  library = new StudyLibrary(store)
  new StudyLibrary(store)
  assert.equal(library.detail(hash(1)).document.topic, "신경과학")
  assert.equal(
    library.detail(hash(1)).document.collections.find((c) => c.id === collection.id)?.name,
    "Brain networks",
  )
  assert.deepEqual(library.detail(hash(1)).snapshot, snapshot)
  library.deleteCollection(collection.id)
  assert.equal(library.list().total, 84)
  assert.deepEqual(library.detail(hash(1)).snapshot, snapshot)
  assert.deepEqual(library.detail(hash(1)).document.collections, [secondary])
  library.remove(hash(1))
  assert.equal(library.facets().collections.find((c) => c.id === secondary.id)?.count, 0)
  console.log(
    "Library organization: additive migration, 85-paper paging, combined filters, collection lifecycle, restart and record preservation passed",
  )
} finally {
  store.db.close()
  await rm(directory, { recursive: true, force: true })
}
