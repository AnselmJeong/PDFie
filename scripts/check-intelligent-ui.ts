// Live acceptance against the existing private Codex connection and real paper.
// Generate in a database snapshot; --publish adds only the validated new lesson.

import { Database } from "bun:sqlite"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { AiSettingsRepository } from "../src/bun/ai/ai-settings-repository"
import { CodexProvider } from "../src/bun/ai/providers/codex-provider"
import { CaptureStore } from "../src/bun/assets/capture-store"
import { StudyStore } from "../src/bun/persistence/study-store"
import { StudyService } from "../src/bun/study/study-service"
import type { StudyEvent } from "../src/shared/study/contracts"

if (!process.argv.includes("--live")) throw new Error("Use --live for this acceptance check.")
const paper = process.argv.find((arg) => arg.endsWith(".pdf"))
if (!paper) throw new Error("Provide the real PDF path.")
const hash = createHash("sha256")
  .update(await readFile(paper))
  .digest("hex")
const root = join(homedir(), "Library/Application Support/dev.aquatope.pdfie/stable")
const sourcePath = join(root, "pdfie-study-v1.sqlite")
const directory = await mkdtemp(join(tmpdir(), "pdfie-live-intelligent-ui-"))
const copied = join(directory, "study.sqlite")
const original = new Database(sourcePath, { readonly: true })
await writeFile(copied, original.serialize())
original.close()
const store = new StudyStore(copied)
const provider = new CodexProvider(join(root, "codex"))
try {
  const snapshot = store.snapshot(hash)
  assert.equal(snapshot.index.indexedPages, 17)
  assert.equal(snapshot.index.pageCount, 17)
  const goal = snapshot.goals.find((g) => g.question.includes("단일 차원으로 평가"))
  assert.ok(goal, "The actual second study goal must be present")
  const settings = await AiSettingsRepository.open(join(directory, "settings.json"), join(directory, "key"))
  const models = await provider.models()
  const model = models.find((m) => m.id === "gpt-6.1-sol") ?? models.find((m) => m.isDefault)
  assert.ok(model)
  await settings.update({ provider: "codex", selectedModel: model.id })
  const done = Promise.withResolvers<StudyEvent>()
  const service = new StudyService(store, settings, { codex: provider }, new CaptureStore(store), (event) => {
    if (["completed", "failed", "stopped"].includes(event.phase)) done.resolve(event)
  })
  const requestId = crypto.randomUUID()
  service.start(hash, {
    documentId: "real-paper",
    requestId,
    task: "lesson",
    origin: "action",
    goalId: goal.id,
    scope: { type: "document" },
    selection: null,
    question: `${goal.question}\n이해 점검: ${goal.checkQuestion}\n이 목표를 인터랙티브 비교 수업으로 만들어 주세요. comparison 단계로 단일 차원과 다차원 접근을 기준별로 비교하고, 별도 sandbox 단계에서 각성도와 경험의 폭이라는 두 축을 선택해 가상의 학습 시나리오를 관찰하는 맞춤 SVG 화면을 넣어 주세요. 맞춤 화면에는 안정적인 id가 있는 조작부와 PDFie.revealEvidence 원문 버튼을 넣어 주세요. 시나리오는 교육용 예시임을 명시하고, 실제 의식 상태나 환자의 측정값으로 제시하지 마세요. 예측과 별도 이해 점검을 포함하세요.`,
  })
  const terminal = await done.promise
  assert.equal(
    terminal.phase,
    "completed",
    store.snapshot(hash).messages.find((m) => m.id === requestId)?.error ?? "Live generation failed",
  )
  const lesson = store.snapshot(hash).lessons.find((l) => !snapshot.lessons.some((old) => old.id === l.id))
  assert.ok(lesson)
  assert.ok(lesson.steps.some((s) => s.type === "comparison"))
  assert.ok(lesson.steps.some((s) => s.type === "sandbox"))
  const report = {
    checkedAt: new Date().toISOString(),
    realPaperPages: snapshot.index.indexedPages,
    provider: lesson.provider,
    model: lesson.model,
    stepTypes: lesson.steps.map((s) => s.type),
    evidenceCount: lesson.evidence.length,
    lessonId: lesson.id,
    published: false,
  }
  if (process.argv.includes("--publish")) {
    const target = new Database(sourcePath, { strict: true })
    try {
      target.exec("PRAGMA busy_timeout=5000")
      target.transaction(() => {
        const document = target
          .query<{ revision: string }, [string]>("SELECT revision FROM documents WHERE hash=?")
          .get(hash)
        assert.equal(document?.revision, lesson.revision, "Source revision changed during generation")
        target
          .query("INSERT INTO entities(document_hash,kind,id,payload) VALUES(?,?,?,?)")
          .run(hash, "lessons", lesson.id, JSON.stringify(lesson))
        target
          .query("UPDATE library_documents SET updated_at=? WHERE hash=?")
          .run(new Date().toISOString(), hash)
      })()
      report.published = true
    } finally {
      target.close()
    }
  }
  await writeFile(
    join(process.cwd(), "docs/qa/intelligent-ui-20261010.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify(report))
} finally {
  provider.close()
  store.close()
  await rm(directory, { recursive: true, force: true })
}
