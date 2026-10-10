import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StudyStore } from "../src/bun/persistence/study-store"
import { retrieve } from "../src/bun/retrieval/context"
import { indexPdf } from "./native-index"

// Expected outlines as "level kind title". Fixtures come from
// scripts/generate-structure-fixtures.py and scripts/generate-fixtures.py.
const expected: Record<string, string[]> = {
  "structure/nature-style.pdf": [
    "1 front Psychedelics broaden the repertoire of brain states",
    "1 body Introduction",
    "1 body Results",
    "2 body Entropy increases under psilocybin",
    "2 body Subjective reports track entropy",
    "1 body Discussion",
    "1 back References",
    "1 body Methods",
    "2 body Participants",
    "2 body Statistical analysis",
    "1 back Data availability",
    "1 back Acknowledgements",
    "1 back Author contributions",
    "1 back Competing interests",
  ],
  "structure/numbered-two-column.pdf": [
    "1 front Attention-Based Estimation of Neural Entropy",
    "1 body Abstract",
    "1 body 1 Introduction",
    "1 body 2 Related Work",
    "2 body 2.1 Entropy estimators",
    "2 body 2.2 Attention models",
    "1 body 3 Method",
    "2 body 3.1 Architecture",
    "1 body 4 Experiments",
    "2 body 4.1 Results",
    "1 body 5 Conclusion",
    "1 back References",
    "1 body A Proofs",
  ],
  "structure/clinical-caps.pdf": [
    "1 front A randomized trial of entropy-guided therapy",
    "1 body ABSTRACT",
    "1 body INTRODUCTION",
    "1 body MATERIALS AND METHODS",
    "2 body Participants",
    "2 body Statistical analysis",
    "1 body RESULTS",
    "1 body DISCUSSION",
    "2 body Limitations",
    "1 body CONCLUSIONS",
    "1 back CONFLICTS OF INTEREST",
    "1 back REFERENCES",
  ],
  "generated/nested-bookmarks.pdf": [
    "1 body Frontmatter",
    "1 body Part I: Foundations",
    "2 body Chapter 1: Reading",
    "3 body 1.1 Selection",
    "2 body Chapter 2: Context",
    "1 body Part II: Practice",
    "2 body Chapter 3: Evidence",
    "2 body Chapter 4: Review",
    "1 back Notes",
    "1 back Index",
  ],
  // A Part and its first Chapter open on the same page; both remain.
  "generated/long-book.pdf": [
    "1 body Part 1",
    "2 body Chapter 1",
    "2 body Chapter 2",
    "1 body Part 2",
    "2 body Chapter 3",
    "2 body Chapter 4",
    "1 body Part 3",
    "2 body Chapter 5",
    "2 body Chapter 6",
    "1 body Part 4",
    "2 body Chapter 7",
    "2 body Chapter 8",
  ],
  "generated/single-column-en.pdf": [
    "1 front Selection Fidelity in Academic PDF Readers",
    "1 body Abstract",
    "1 body Methods",
    "1 body Results",
  ],
}

const directory = await mkdtemp(join(tmpdir(), "pdfie-structure-test-"))
const store = new StudyStore(join(directory, "index.sqlite"))
try {
  for (const [fixture, outline] of Object.entries(expected)) {
    const { documentHash } = await indexPdf(join(import.meta.dir, "../tests/fixtures/pdf", fixture), store)
    const blocks = store.blocks(documentHash)
    const sections = store.sections(documentHash, blocks)
    assert.deepEqual(
      sections.map((section) => `${section.level} ${section.kind} ${section.title}`),
      outline,
      fixture,
    )
    // Parents precede their children and every child names an existing parent.
    for (const section of sections)
      if (section.parentId) {
        const parent = sections.find((s) => s.id === section.parentId)
        assert.ok(parent && parent.level < section.level, `${fixture}: ${section.title} parent`)
      }
    // Running headers and figure labels never become section titles.
    assert.ok(
      !sections.some((s) => /Nature Neuroscience|JOURNAL OF CLINICAL|Placebo|Model|BLEU/.test(s.title)),
    )
  }

  // Study scope: a parent section includes its subsections, and document-wide
  // study leaves out back matter while chat can still reach it.
  const { documentHash } = await indexPdf(
    join(import.meta.dir, "../tests/fixtures/pdf/structure/nature-style.pdf"),
    store,
  )
  const blocks = store.blocks(documentHash)
  const sections = store.sections(documentHash, blocks)
  const results = sections.find((s) => s.title === "Results")
  assert.ok(results)
  const children = sections.filter((s) => s.parentId === results.id).map((s) => s.id)
  const scoped = retrieve(blocks, sections, { type: "section", sectionId: results.id }, "요약", "summary")
  assert.ok(scoped.blocks.some((block) => children.includes(block.sectionId)))
  const back = new Set(sections.filter((s) => s.kind === "back").map((s) => s.id))
  const summary = retrieve(blocks, sections, { type: "document" }, "전체 요약", "summary")
  assert.ok(summary.blocks.length > 0 && summary.excludedCount > 0)
  assert.ok(!summary.blocks.some((block) => back.has(block.sectionId)))
  const chat = retrieve(blocks, sections, { type: "document" }, "competing interests declare", "chat")
  assert.ok(chat.blocks.some((block) => back.has(block.sectionId)))
  assert.ok(blocks.some((block) => block.role === "reference"))
  // Typography arrives from the renderer and is validated like every other field.
  const sample = blocks[0]
  assert.ok(sample?.style)
  const page = (style: unknown) => ({
    pageIndex: 0,
    width: 612,
    height: 792,
    status: "ready" as const,
    blocks: [{ ...sample, style } as typeof sample],
  })
  for (const style of [
    { ...sample.style, bold: 5 },
    { ...sample.style, size: Number.NaN },
    { size: 9 },
    "bold",
  ])
    assert.throws(() => store.ingest(documentHash, page(style)))
  store.ingest(documentHash, page({ ...sample.style, injected: "<script>" }))
  assert.equal("injected" in (store.blocks(documentHash)[0]?.style ?? {}), false)
  console.log(
    `Section structure: ${Object.keys(expected).length} PDF layouts, hierarchy, back matter and study scope passed`,
  )
} finally {
  store.close()
  await rm(directory, { recursive: true, force: true })
}
