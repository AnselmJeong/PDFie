import { strict as assert } from "node:assert"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DocumentStateRepository } from "../src/bun/pdf/document-state-repository"
import type { PdfTextHighlight } from "../src/shared/pdf/domain"

const directory = await mkdtemp(join(tmpdir(), "pdfie-annotations-"))
try {
  const path = join(directory, "state.json")
  const repository = await DocumentStateRepository.open(path)
  const highlight: PdfTextHighlight = {
    id: "qa",
    text: "Passage",
    note: "Research note",
    style: "pink",
    createdAt: "2026-09-26T00:00:00Z",
    pages: [{ pageNumber: 2, rects: [{ x: 10, y: 20, width: 100, height: 14 }] }],
  }
  await Promise.all([
    repository.save("fixture", { highlights: [highlight] }),
    repository.save("fixture", { currentPage: 3 }),
    repository.save("fixture", { highlights: [{ ...highlight, style: "red-underline" }] }),
  ])
  const reopened = await DocumentStateRepository.open(path)
  assert.equal(reopened.get("fixture").currentPage, 3)
  assert.deepEqual(reopened.get("fixture").highlights, [{ ...highlight, style: "red-underline" }])
  await reopened.save("fixture", { highlights: [] })
  assert.deepEqual((await DocumentStateRepository.open(path)).get("fixture").highlights, [])
  console.log("Document annotation persistence and concurrent save integration: passed")
} finally {
  await rm(directory, { recursive: true, force: true })
}
