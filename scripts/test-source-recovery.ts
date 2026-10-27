import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiSettingsRepository } from "../src/bun/ai/ai-settings-repository"
import type { GenerationInput, StudyProvider } from "../src/bun/ai/provider-contract"
import { CaptureStore } from "../src/bun/assets/capture-store"
import { StudyStore } from "../src/bun/persistence/study-store"
import { StudyService } from "../src/bun/study/study-service"
import type { StudyEvent, StudyGenerateRequest } from "../src/shared/study/contracts"

const directory = await mkdtemp(join(tmpdir(), "pdfie-source-recovery-"))
const store = new StudyStore(join(directory, "study.sqlite"))
const hash = "d".repeat(64)
try {
  store.begin(hash, 1, [])
  store.ingest(hash, {
    pageIndex: 0,
    width: 600,
    height: 800,
    status: "ready",
    blocks: [
      {
        id: "unused",
        documentHash: hash,
        revision: "unused",
        pageIndex: 0,
        rawText: "Broad information sampling avoids learning traps.",
        normalizedText: "unused",
        order: 0,
        sectionId: "unused",
        role: "paragraph",
        quality: "usable",
        rects: [{ x: 40, y: 40, width: 350, height: 12 }],
      },
    ],
  })
  const source = store.blocks(hash)[0]
  assert.ok(source)
  const section = store.sections(hash)[0]
  assert.ok(section)
  const settings = await AiSettingsRepository.open(join(directory, "settings.json"), join(directory, "key"))
  await settings.update({ provider: "codex", selectedModel: "test-model" })
  type Mode = "good" | "repair" | "bad" | "bad-section" | "cancel-retry" | "language" | "json" | "network"
  let mode: Mode = "good"
  let calls: GenerationInput[] = []
  let terminal = Promise.withResolvers<StudyEvent>()
  let retryStarted = Promise.withResolvers<void>()
  const goal = (evidenceId: string, question = "왜 폭넓게 탐색하나요?") => ({
    question,
    prerequisites: "탐색과 활용의 차이를 압니다.",
    sectionId: section.id,
    evidenceIds: [evidenceId],
    difficulty: "intermediate",
    checkQuestion: "학습 함정은 무엇인가요?",
  })
  const fake: StudyProvider = {
    id: "codex",
    async models() {
      return []
    },
    async generate(input, onToken) {
      calls.push(input)
      if (mode === "network") throw new Error("연결 오류")
      if (mode === "json") {
        onToken("invalid JSON")
        return
      }
      if (mode === "language") {
        onToken(JSON.stringify({ goals: [goal(source.id, "Why explore broadly?")] }))
        return
      }
      const retry = calls.length === 2
      if (retry && mode === "cancel-retry") {
        retryStarted.resolve()
        await new Promise<void>((resolve) =>
          input.signal.addEventListener(
            "abort",
            () => {
              onToken(JSON.stringify({ goals: [goal(source.id)] }))
              resolve()
            },
            { once: true },
          ),
        )
        return
      }
      if (mode === "bad-section") {
        onToken(JSON.stringify({ goals: [{ ...goal(source.id), sectionId: `${section.id}4` }] }))
        return
      }
      const invalid = mode === "bad" || ((mode === "repair" || mode === "cancel-retry") && !retry)
      onToken(
        JSON.stringify({
          goals: [
            goal(
              invalid ? `${source.id}4` : source.id,
              retry && mode === "repair" ? "다시 확인한 원문은 탐색의 이점을 어떻게 설명하나요?" : undefined,
            ),
          ],
        }),
      )
    },
  }
  const service = new StudyService(store, settings, { codex: fake }, new CaptureStore(store), (event) => {
    if (["completed", "failed", "stopped"].includes(event.phase)) terminal.resolve(event)
  })
  const start = (next: Mode) => {
    mode = next
    calls = []
    terminal = Promise.withResolvers<StudyEvent>()
    const request: StudyGenerateRequest = {
      documentId: "test",
      requestId: crypto.randomUUID(),
      task: "goals",
      origin: "action",
      question: "학습 목표를 제안해 주세요.",
      scope: { type: "document" },
      selection: null,
    }
    service.start(hash, request)
    return request.requestId
  }
  start("good")
  assert.equal((await terminal.promise).phase, "completed")
  assert.equal(calls.length, 1)
  const edited = store.snapshot(hash).goals[0]
  assert.ok(edited)
  service.saveGoal(hash, { ...edited, question: `직접 편집한 질문: ${edited.question}` })
  const preserved = JSON.stringify(store.snapshot(hash).goals[0])
  start("repair")
  assert.equal((await terminal.promise).phase, "completed")
  assert.equal(calls.length, 2)
  const [first, second] = calls
  assert.ok(first && second)
  assert.equal(first.requestId, second.requestId)
  assert.equal(first.signal, second.signal)
  assert.deepEqual(second.history, [])
  assert.deepEqual(JSON.parse(second.prompt).validationFeedback.rejectedIds, [`${source.id}4`])
  assert.deepEqual(JSON.parse(first.prompt).evidence, JSON.parse(second.prompt).evidence)
  assert.deepEqual(first.outputSchema?.$defs, { evidenceId: { type: "string", enum: [source.id] } })
  assert.equal(JSON.stringify(store.snapshot(hash).goals.find((g) => g.id === edited.id)), preserved)
  assert.ok(
    store.snapshot(hash).goals.some((g) => g.question.startsWith("다시 확인한")),
    "the corrected model response is saved, not a local approximate ID substitution",
  )
  const validGoals = JSON.stringify(store.snapshot(hash).goals)
  for (const next of ["bad", "bad-section", "language", "json", "network"] as const) {
    const id = start(next)
    assert.equal((await terminal.promise).phase, "failed")
    assert.equal(calls.length, next.startsWith("bad") ? 2 : 1)
    assert.equal(JSON.stringify(store.snapshot(hash).goals), validGoals)
    const message = store.snapshot(hash).messages.find((m) => m.id === id)
    assert.ok(message)
    if (next.startsWith("bad")) assert.match(message.error ?? "", /원문 근거.*저장하지 않았/)
  }
  retryStarted = Promise.withResolvers<void>()
  const cancelled = start("cancel-retry")
  await retryStarted.promise
  assert.equal(service.isActive(hash), true)
  assert.equal(await service.stop(cancelled, hash), true)
  assert.equal((await terminal.promise).phase, "stopped")
  assert.equal(calls.length, 2)
  assert.equal(JSON.stringify(store.snapshot(hash).goals), validGoals)
  assert.equal(service.isActive(hash), false)
  console.log(
    "Request-bound source choices, one retry, preserved goals, failure limits, and retry cancellation: passed",
  )
} finally {
  store.close()
  await rm(directory, { recursive: true, force: true })
}
