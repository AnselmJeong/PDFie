import { strict as assert } from "node:assert"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { PdfiumNative } from "@embedpdf/engines/pdfium"
import { init } from "@embedpdf/pdfium"
import { pageReferences } from "../src/shared/pdf/page-references"
import { buildReferenceTargets, isSelfReference, resolveMention } from "../src/shared/pdf/reference-links"
import { groupNativeRuns } from "../src/shared/study/native-page-analysis"
import { minimalPdf } from "./lib/minimal-pdf"

// A three-page paper: a body page with textual references and two PDF links,
// a page of captions and a bibliography.
const bytes = minimalPdf([
  {
    lines: [
      { x: 72, y: 700, text: "Results are summarized in Figure 2 and in Table 1 of this paper [2]." },
      { x: 72, y: 680, text: "See section two for details and the project site." },
    ],
    links: [
      { rect: [130, 676, 190, 692], dest: { page: 1, top: 600 } },
      { rect: [250, 676, 330, 692], uri: "https://example.org/project" },
    ],
  },
  {
    lines: [
      { x: 72, y: 600, text: "Figure 2. The processing pipeline used throughout." },
      { x: 72, y: 300, text: "Table 1: Participants and their characteristics." },
    ],
  },
  {
    lines: [
      { x: 72, y: 720, size: 14, text: "References" },
      { x: 72, y: 690, text: "[1] A. Author. A first paper. Journal of Tests, 2019." },
      { x: 72, y: 670, text: "[2] B. Author. Another paper. Journal of Tests, 2020." },
    ],
  },
])

const wasm = await readFile(fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm")))
const engine = new PdfiumNative(await init({ wasmBinary: wasm }), { fontFallback: null })
try {
  const document = await engine
    .openDocumentBuffer({ id: "references", content: bytes.buffer.slice(0) as ArrayBuffer })
    .toPromise()
  const [body, captions, bibliography] = document.pages
  assert.ok(body && captions && bibliography)

  const references = await pageReferences(engine, document, body)
  const mentions = references.flatMap((item) => (item.type === "mention" ? [item.mention] : []))
  assert.deepEqual(
    mentions.map((mention) => [mention.kind, mention.labels]),
    [
      ["figure", ["2"]],
      ["table", ["1"]],
      ["citation", ["2"]],
    ],
  )
  // Mention boxes sit on the first line (PDF y 700 is 92 from the top of a 792 page).
  for (const mention of mentions) assert.ok(Math.abs((mention.rects[0]?.y ?? 0) - 82) < 8, "mention line")

  const internal = references.find((item) => item.type === "internal-link")
  assert.ok(internal?.type === "internal-link")
  assert.equal(internal.pageIndex, 1)
  assert.equal(internal.y, 192)
  const external = references.find((item) => item.type === "external-link")
  assert.ok(external?.type === "external-link")
  assert.equal(external.url, "https://example.org/project")

  // Captions and the bibliography come from the same blocks the study index stores.
  const blocks = []
  for (const page of document.pages) {
    const geometry = await engine.getPageGeometry(document, page).toPromise()
    const texts = await engine
      .getTextSlices(
        document,
        geometry.runs.map((run) => ({
          pageIndex: page.index,
          charIndex: run.charStart,
          charCount: run.glyphs.length,
        })),
      )
      .toPromise()
    // The study store stamps each block with its page, as here.
    for (const block of groupNativeRuns(geometry, texts, page.size.width, page.size.height))
      blocks.push({ ...block, pageIndex: page.index })
  }
  const targets = buildReferenceTargets(blocks)
  const resolved = mentions.map((mention) => resolveMention(mention, targets)[0])
  assert.deepEqual(
    resolved.map((target) => [target?.kind, target?.label, target?.pageIndex]),
    [
      ["figure", "2", 1],
      ["table", "1", 1],
      ["citation", "2", 2],
    ],
  )
  assert.match(resolved[2]?.text ?? "", /B\. Author/)

  // On the caption page, the caption line is the target, not a link to itself.
  const onCaptionPage = await pageReferences(engine, document, captions)
  const selfMentions = onCaptionPage.flatMap((item) => (item.type === "mention" ? [item.mention] : []))
  assert.ok(selfMentions.length >= 2)
  assert.ok(selfMentions.every((mention) => isSelfReference(mention, 1, targets)))
  console.log(
    "Reference links: PDF links, textual figure/table/citation mentions, captions and bibliography passed",
  )
} finally {
  await engine.destroy().toPromise()
}
