import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiSettingsRepository } from "../src/bun/ai/ai-settings-repository"
import type { StudyProvider } from "../src/bun/ai/provider-contract"
import { CaptureStore } from "../src/bun/assets/capture-store"
import { PdfSourceBridge } from "../src/bun/pdf/document-source-bridge"
import { StudyLibrary } from "../src/bun/persistence/study-library"
import { StudyStore } from "../src/bun/persistence/study-store"
import { linkLibraryPdf } from "../src/bun/study/library-source"
import { exportStudyMarkdown } from "../src/bun/study/study-export"
import { StudyService } from "../src/bun/study/study-service"
import type { LessonSpec, StudyGoal, StudyMessage } from "../src/shared/study/contracts"

const directory = await mkdtemp(join(tmpdir(), "pdfie-library-test-"))
const pdf = "%PDF-1.7\nLibrary fixture\n%%EOF"
const hash = createHash("sha256").update(pdf).digest("hex")
const path = join(directory, "source.pdf")
const movedPath = join(directory, "moved.pdf")
let store = new StudyStore(join(directory, "study.sqlite"))
const bridge = new PdfSourceBridge()
const lesson: LessonSpec = {
  schemaVersion: 1,
  id: "lesson-1",
  title: "표본오차 탐구",
  objectives: ["표본 크기와 오차의 관계"],
  prerequisites: ["표본"],
  steps: [
    {
      type: "explanation",
      title: "표본오차",
      text: "표본이 커지면 표준오차가 작아집니다.",
      evidenceIds: ["E-1"],
    },
    {
      type: "experiment",
      title: "직접 조절하기",
      formula: "sampling-error",
      min: 1,
      max: 100,
      step: 1,
      initial: 16,
      unit: "명",
      text: "교육용 가상값입니다.",
      evidenceIds: [],
    },
    {
      type: "quiz",
      title: "이해 점검",
      question: "표본 크기가 커지면?",
      options: ["표준오차 감소", "표준오차 증가"],
      correctIndex: 0,
      feedback: "표준오차는 1/√n에 비례합니다.",
      evidenceIds: ["E-1"],
    },
  ],
  evidence: [
    {
      id: "E-1",
      documentHash: hash,
      revision: `${hash}:legacy`,
      quote: "Standard error is inversely proportional to the square root of sample size.",
      pageIndex: 0,
      rects: [],
      sectionTitle: "Methods",
      precision: "page-only",
      quality: "usable",
    },
  ],
  revision: `${hash}:legacy`,
  model: "test",
  provider: "codex",
  goalId: "goal-1",
  dataKind: "illustrative",
  coverage: "1페이지 근거 · 교육용 예시",
  createdAt: "2026-10-09T00:00:00.000Z",
}
const message: StudyMessage = {
  id: "message-1",
  role: "assistant",
  text: "분산에 대한 저장된 설명",
  task: "summary",
  state: "completed",
  origin: "action",
  createdAt: lesson.createdAt,
  model: "test",
  provider: "codex",
  scope: { type: "document" },
  blocks: [{ text: "분산과 표준오차를 구분합니다.", kind: "document-claim", evidenceIds: ["E-1"] }],
  evidence: lesson.evidence,
  coverage: lesson.coverage,
}
const goal: StudyGoal = {
  id: "goal-1",
  question: "표본 크기는 오차에 어떤 영향을 주는가?",
  prerequisites: "표본",
  sectionId: null,
  evidenceIds: ["E-1"],
  difficulty: "introductory",
  checkQuestion: "표본이 커지면?",
  userEdited: false,
  explored: true,
  checked: false,
  revision: lesson.revision,
}
try {
  // Simulate a real pre-catalog database. Migration must be additive and idempotent.
  store.begin(hash, 1, [])
  store.put(hash, "lessons", lesson.id, lesson)
  store.put(hash, "messages", message.id, message)
  store.put(hash, "goals", goal.id, goal)
  const before = store.snapshot(hash)
  let library = new StudyLibrary(store)
  assert.deepEqual(library.detail(hash).snapshot, before)
  assert.equal(library.list().total, 1)
  assert.equal(library.list({ query: "표준오차" }).items[0]?.documentHash, hash)
  assert.equal(library.list({ query: "분산" }).total, 1)
  assert.equal(library.list({ query: "%" }).total, 0)
  assert.equal(library.list({ query: "' OR 1=1 --" }).total, 0)
  assert.equal(library.detail(hash).document.sourceAvailable, false)
  new StudyLibrary(store)
  assert.equal(library.list().total, 1)

  await writeFile(path, pdf)
  await linkLibraryPdf(library, bridge, hash, path)
  library.update(hash, { title: "나의 통계 논문", favorite: true })
  assert.equal(library.list({ filter: "favorites" }).total, 1)
  assert.equal(library.list({ query: "통계" }).total, 1)
  assert.equal(library.detail(hash).document.sourceAvailable, true)
  await writeFile(join(directory, "wrong.pdf"), "%PDF-1.7\nWrong paper\n%%EOF")
  await assert.rejects(linkLibraryPdf(library, bridge, hash, join(directory, "wrong.pdf")), /다른 PDF/)
  assert.equal(library.sourcePath(hash), path)
  assert.deepEqual(library.detail(hash).snapshot, before)

  await rm(path)
  assert.equal(library.detail(hash).document.sourceAvailable, false)
  assert.equal(library.detail(hash).snapshot.lessons[0]?.steps[1]?.type, "experiment")
  const settings = await AiSettingsRepository.open(
    join(directory, "settings.json"),
    join(directory, "secret.key"),
  )
  let providerCalls = 0
  const provider: StudyProvider = {
    id: "codex",
    models: async () => {
      providerCalls++
      throw new Error("No AI allowed during review")
    },
    generate: async () => {
      providerCalls++
      throw new Error("No AI allowed during review")
    },
  }
  const captures = new CaptureStore(store)
  const service = new StudyService(
    store,
    settings,
    { codex: provider, "ollama-cloud": { ...provider, id: "ollama-cloud" } },
    captures,
    () => undefined,
  )
  service.progress(library.require(hash), { lessonId: lesson.id, stepIndex: 1, parameters: { "1": 36 } })
  assert.throws(() => service.progress(hash, { lessonId: lesson.id, stepIndex: 1, parameters: { "1": 101 } }))
  assert.throws(() =>
    service.progress(hash, { lessonId: lesson.id, stepIndex: 0, parameters: {}, completedAt: "invented" }),
  )
  service.assess(hash, lesson.id, 2, 0, false)
  assert.equal(store.snapshot(hash).goals[0]?.checked, true)
  service.progress(hash, {
    lessonId: lesson.id,
    stepIndex: 2,
    parameters: { "1": 36 },
    completedAt: new Date().toISOString(),
  })
  service.progress(hash, { lessonId: lesson.id, stepIndex: 0, parameters: { "1": 36 } })
  assert.equal(library.detail(hash).document.completedLessonCount, 1)
  assert.equal(providerCalls, 0)
  const exported = exportStudyMarkdown("나의 통계 논문", store.snapshot(hash))
  assert.match(exported, /Standard error/)
  assert.match(exported, /저장한 입력: 36/)
  assert.match(exported, /표준오차 감소/)
  assert.match(exported, /수업 마침/)
  library.update(hash, { archived: true })
  assert.equal(library.list().total, 0)
  assert.equal(library.list({ filter: "archived" }).total, 1)
  store.close()
  store = new StudyStore(join(directory, "study.sqlite"))
  library = new StudyLibrary(store)
  assert.equal(library.detail(hash).snapshot.progress[0]?.parameters["1"], 36)
  assert.equal(library.detail(hash).snapshot.attempts[0]?.correct, true)
  assert.equal(library.detail(hash).snapshot.lessons[0]?.evidence[0]?.quote, lesson.evidence[0]?.quote)
  await writeFile(movedPath, pdf)
  await linkLibraryPdf(library, bridge, hash, movedPath)
  assert.equal(library.sourcePath(hash), movedPath)
  assert.equal(library.detail(hash).document.title, "나의 통계 논문")

  for (let i = 0; i < 45; i++) {
    const extra = createHash("sha256").update(`other-${i}`).digest("hex")
    store.begin(extra, 1, [])
    library.remember(extra, `Paper ${i}.pdf`, null)
  }
  assert.equal(library.list().total, 45)
  assert.equal(library.list().items.length, 40)
  assert.equal(library.list({ offset: 40 }).items.length, 5)
  const first = library.list({ sort: "title" }).items[0]
  assert.equal(first?.title, "Paper 0")
  assert.ok(first)
  const otherHash = first.documentHash
  assert.throws(() => library.detail("not-a-hash"))
  assert.throws(() => library.update(hash, { title: "   " }))
  library.remove(hash)
  assert.throws(() => library.detail(hash))
  assert.equal(library.detail(otherHash).document.title, first?.title)
  assert.equal(await Bun.file(movedPath).exists(), true)
  new StudyLibrary(store)
  assert.equal(library.list({ filter: "archived" }).total, 0)
  console.log(
    "Study library: legacy migration, offline review/quiz/experiment, restart, identity-safe relink, search/pagination, archive and scoped deletion passed; zero AI calls",
  )
} finally {
  bridge.close()
  store.close()
  await rm(directory, { recursive: true, force: true })
}
