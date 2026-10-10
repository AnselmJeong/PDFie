import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiSettingsRepository } from "../src/bun/ai/ai-settings-repository"
import type { StudyProvider } from "../src/bun/ai/provider-contract"
import { CaptureStore } from "../src/bun/assets/capture-store"
import { StudyStore } from "../src/bun/persistence/study-store"
import { exportStudyMarkdown } from "../src/bun/study/study-export"
import { StudyService } from "../src/bun/study/study-service"
import type { StudyEvent, StudyGenerateRequest } from "../src/shared/study/contracts"

const directory = await mkdtemp(join(tmpdir(), "pdfie-intelligent-ui-"))
const path = join(directory, "study.sqlite")
let store = new StudyStore(path)
const hash = "a".repeat(64)
try {
  store.begin(hash, 1, [])
  store.ingest(hash, {
    pageIndex: 0,
    width: 600,
    height: 800,
    status: "ready",
    blocks: [
      {
        id: "",
        documentHash: hash,
        revision: "",
        pageIndex: 0,
        rawText: "Comparison and entropy have limits.",
        normalizedText: "",
        rects: [],
        role: "paragraph",
        quality: "usable",
        order: 0,
        sectionId: "",
      },
    ],
  })
  const id = store.blocks(hash)[0]!.id
  const evidenceIds = [id]
  const common = { title: "개념 탐구", text: "원문 근거를 확인하며 개념을 탐구합니다.", evidenceIds }
  const settings = await AiSettingsRepository.open(join(directory, "settings.json"), join(directory, "key"))
  await settings.update({ provider: "codex", selectedModel: "fixture" })
  let resolveJob: (event: StudyEvent) => void = () => {}
  const provider: StudyProvider = {
    id: "codex",
    async models() {
      return []
    },
    async generate(input, onToken) {
      assert.match(input.system, /generateSandboxedUi/)
      assert.match(input.system, /Only sandbox step fields/)
      assert.ok(input.outputSchema)
      onToken(
        JSON.stringify({
          schemaVersion: 1,
          title: "적응형 학습",
          objectives: ["비교 기준을 탐구합니다."],
          prerequisites: [],
          dataKind: "illustrative",
          steps: [
            { ...common, type: "explanation" },
            {
              ...common,
              type: "comparison",
              concepts: ["단일 차원", "다차원"],
              aspects: [
                { label: "정의", values: ["한 축입니다.", "여러 축입니다."], evidenceIds },
                { label: "한계", values: ["차이를 숨깁니다.", "검증이 필요합니다."], evidenceIds },
              ],
            },
            { ...common, type: "signal-experiment", initial: 0.3 },
            {
              ...common,
              type: "sandbox",
              initialHeight: 300,
              css: "",
              html: '<input id="level" type="range" min="0" max="10" value="2">',
              jsFunctions: "function draw() {}",
              jsExpressions: ["draw();"],
              dataKind: "illustrative",
            },
            {
              type: "quiz",
              title: "이해 점검",
              question: "무엇을 확인해야 하나요?",
              options: ["원문 근거", "가상값만"],
              correctIndex: 0,
              feedback: "원문 근거와 가상값을 구분해야 합니다.",
              evidenceIds,
            },
          ],
        }),
      )
    },
  }
  const service = new StudyService(store, settings, { codex: provider }, new CaptureStore(store), (event) => {
    if (["completed", "failed", "stopped"].includes(event.phase)) resolveJob(event)
  })
  const request: StudyGenerateRequest = {
    documentId: "fixture",
    requestId: "adaptive-lesson",
    task: "lesson",
    question: "개념을 비교하며 원문 근거와 함께 공부하고 싶습니다.",
    scope: { type: "document" },
    selection: null,
  }
  const done = new Promise<StudyEvent>((resolve) => {
    resolveJob = resolve
  })
  service.start(hash, request)
  assert.equal(
    (await done).phase,
    "completed",
    store.snapshot(hash).messages.at(-1)?.error ?? "generation failed",
  )
  const lesson = store.snapshot(hash).lessons[0]!
  service.progress(hash, {
    lessonId: lesson.id,
    stepIndex: 3,
    parameters: { "1": 1, "2": 0.8 },
    widgetStates: { "3": { level: "7", selected: 2 } },
  })
  const invalidParameters: Array<Record<string, number>> = [{ "1": 2 }, { "1": 0.5 }, { "2": 1.1 }]
  for (const parameters of invalidParameters)
    assert.throws(() => service.progress(hash, { lessonId: lesson.id, stepIndex: 3, parameters }))
  assert.throws(() =>
    service.progress(hash, {
      lessonId: lesson.id,
      stepIndex: 3,
      parameters: {},
      widgetStates: { "1": { forged: true } },
    }),
  )
  assert.throws(() =>
    service.progress(hash, {
      lessonId: lesson.id,
      stepIndex: 3,
      parameters: {},
      widgetStates: { "3": { bad: Infinity } },
    }),
  )
  service.progress(hash, { lessonId: lesson.id, stepIndex: 4, parameters: { "1": 1, "2": 0.8 } })
  assert.deepEqual(store.snapshot(hash).progress[0]?.widgetStates, { "3": { level: "7", selected: 2 } })
  assert.equal(store.snapshot(hash).attempts.length, 0, "widget state does not pass an assessment")
  service.assess(hash, lesson.id, 4, 0, false)
  store.close()
  store = new StudyStore(path)
  const snapshot = store.snapshot(hash)
  assert.equal(snapshot.lessons[0]?.steps[1]?.type, "comparison")
  assert.deepEqual(snapshot.progress[0]?.parameters, { "1": 1, "2": 0.8 })
  assert.deepEqual(snapshot.progress[0]?.widgetStates, { "3": { level: "7", selected: 2 } })
  assert.equal(snapshot.attempts[0]?.correct, true)
  const exported = exportStudyMarkdown("적응형 학습", snapshot)
  assert.match(exported, /단일 차원: 한 축입니다/)
  assert.match(exported, /저장한 조작:.*level.*7/)
  assert.match(exported, /PDF p\. 1/)
  console.log(
    "Adaptive lesson generation, per-row evidence, bounded controls, restart, independent assessment and export: passed",
  )
} finally {
  store.close()
  await rm(directory, { recursive: true, force: true })
}
