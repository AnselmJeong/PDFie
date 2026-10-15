import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiSettingsRepository } from "../src/bun/ai/ai-settings-repository"
import type { GenerationInput, StudyProvider } from "../src/bun/ai/provider-contract"
import { StudyLibrary } from "../src/bun/persistence/study-library"
import { StudyStore } from "../src/bun/persistence/study-store"
import { TopicClassifier } from "../src/bun/study/topic-classifier"
import type { StudyBlock } from "../src/shared/study/contracts"

const root = await mkdtemp(join(tmpdir(), "pdfie-topics-"))
const path = join(root, "study.sqlite")
let store = new StudyStore(path)
let library = new StudyLibrary(store)
const settings = await AiSettingsRepository.open(join(root, "settings.json"), join(root, "key"))
await settings.update({ provider: "codex", selectedModel: "selected-model" })
let calls = 0,
  busy = false
let run: StudyProvider["generate"] = async (input, token) => {
  assert.equal(input.model, "selected-model")
  assert.match(input.prompt, /Working memory develops/)
  token(JSON.stringify({ topic: "인지 발달", reason: "제공된 본문은 작업 기억의 발달을 연구합니다." }))
}
const provider: StudyProvider = {
  id: "codex",
  models: async () => [],
  generate: async (input, token) => {
    calls++
    await run(input, token)
  },
}
let service = new TopicClassifier(
  store,
  library,
  settings,
  { codex: provider },
  () => busy,
  () => {},
  10,
)
const hash = (n: number) => n.toString(16).padStart(64, "0")
function paper(n: number, text = "Working memory develops with age and supports exploration. ".repeat(30)) {
  const h = hash(n)
  library.remember(h, "misleading-filename.pdf", null)
  store.begin(h, 1, [])
  const b: StudyBlock = {
    id: `${h}-b`,
    documentHash: h,
    revision: store.index(h).revision,
    pageIndex: 0,
    rawText: text,
    normalizedText: text,
    rects: [{ x: 10, y: 50, width: 500, height: 400 }],
    role: "paragraph",
    quality: "usable",
    order: 0,
    sectionId: "",
  }
  store.ingest(h, { pageIndex: 0, width: 600, height: 800, status: "ready", blocks: text ? [b] : [] })
  return h
}
async function until(check: () => boolean) {
  for (let n = 0; n < 300; n++) {
    if (check()) return
    await Bun.sleep(10)
  }
  throw new Error("Timed out waiting for classifier")
}
const state = (h: string) => library.classification(h)?.state
try {
  const first = paper(1)
  const before = store.snapshot(first)
  service.wake()
  service.wake()
  await until(() => state(first) === "complete")
  assert.equal(calls, 1)
  assert.equal(library.detail(first).document.topic, "인지 발달")
  assert.deepEqual(store.snapshot(first), before)
  assert.deepEqual(library.classification(first)?.pages, [1])
  library.update(first, { collectionIds: [] })
  assert.equal(state(first), "complete")
  const manual = paper(2)
  library.update(manual, { topic: "수동 주제" })
  const empty = paper(3, "")
  service.wake()
  await until(() => state(empty) === "insufficient")
  assert.equal(calls, 1)
  assert.equal(state(manual), "manual")

  // A pending result must not overwrite a human edit (including clearing a topic).
  let release = () => {}
  run = async (_input, token) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    token('{"topic":"AI 결과","reason":"test"}')
  }
  const race = paper(4)
  service.wake()
  await until(() => state(race) === "running")
  library.update(race, { topic: "" })
  release()
  await Bun.sleep(30)
  assert.equal(library.detail(race).document.topic, "")
  assert.equal(state(race), "manual")

  // Foreground generation defers work; cancellation requeues and releases the provider.
  const pause = paper(5)
  busy = true
  service.wake()
  const initialCalls = calls
  await Bun.sleep(40)
  assert.equal(calls, initialCalls)
  run = async (input: GenerationInput) =>
    new Promise<void>((_resolve, reject) =>
      input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
    )
  busy = false
  await until(() => state(pause) === "running")
  await service.pause()
  assert.equal(state(pause), "queued")
  run = async (_input, token) => token('{"topic":"인지 발달","reason":"본문에서 확인"}')
  service.resume()
  await until(() => state(pause) === "complete")

  // Invalid AI output is retained as a failure, never retried by list refresh alone.
  const failure = paper(6)
  run = async (_input, token) => token("not JSON")
  service.wake()
  await until(() => state(failure) === "failed")
  const failedCalls = calls
  service.wake()
  await Bun.sleep(50)
  assert.equal(calls, failedCalls)
  assert.equal(library.detail(failure).document.topic, "")
  run = async (_input, token) => token('{"topic":"인지 발달","reason":"본문에서 확인"}')
  service.request(failure)
  await until(() => state(failure) === "complete")

  const deleted = paper(7)
  run = async (_input, token) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    token('{"topic":"삭제됨","reason":"test"}')
  }
  service.wake()
  await until(() => state(deleted) === "running")
  library.remove(deleted)
  release()
  await Bun.sleep(30)
  assert.equal(library.classification(deleted), null)
  await service.close()
  const restart = paper(8)
  library.setClassification(restart, { state: "running", reason: "interrupted" })
  store.db.close()
  store = new StudyStore(path)
  library = new StudyLibrary(store)
  assert.equal(state(restart), "queued")
  assert.equal(state(race), "manual")
  assert.equal(state(first), "complete")
  run = async (_input, token) => token('{"topic":"인지 발달","reason":"본문에서 확인"}')
  service = new TopicClassifier(
    store,
    library,
    settings,
    { codex: provider },
    () => false,
    () => {},
    10,
  )
  service.wake()
  await until(() => state(restart) === "complete")
  assert.deepEqual(store.snapshot(first), before)
  console.log(
    "Topic classification: content/provider reuse, dedup, no-text, manual race, foreground priority, failure/retry, deletion and restart passed",
  )
} finally {
  await service.close()
  store.db.close()
  await rm(root, { recursive: true, force: true })
}
