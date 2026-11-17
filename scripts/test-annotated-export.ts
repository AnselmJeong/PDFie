import { strict as assert } from "node:assert"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PdfiumNative } from "@embedpdf/engines/pdfium"
import { type PdfAnnotationObject, PdfAnnotationSubtype } from "@embedpdf/models"
import { init } from "@embedpdf/pdfium"
import { writeAnnotatedCopy } from "../src/bun/pdf/annotated-export"
import {
  annotationsMarkdown,
  exportAnnotations,
  reviveAnnotation,
  serializeAnnotation,
} from "../src/shared/pdf/annotation-export"
import type { PdfMark, PdfTextHighlight } from "../src/shared/pdf/domain"
import { minimalPdf } from "./lib/minimal-pdf"

const directory = await mkdtemp(join(tmpdir(), "pdfie-annotated-export-"))
const input = join(directory, "paper.pdf")
const output = join(directory, "paper (PDFie 주석).pdf")
const original = minimalPdf([
  { lines: [{ x: 72, y: 700, text: "Highlighted sentence on the first page." }] },
  { lines: [{ x: 72, y: 700, text: "Second page with a drawing." }] },
])
await writeFile(input, original)

// A pen stroke and a rectangle, stored as the viewer stores them (JSON, dates as strings).
const ink = serializeAnnotation({
  type: PdfAnnotationSubtype.INK,
  id: "mark-ink",
  pageIndex: 1,
  rect: { origin: { x: 100, y: 300 }, size: { width: 200, height: 100 } },
  inkList: [
    {
      points: [
        { x: 100, y: 300 },
        { x: 200, y: 400 },
        { x: 300, y: 320 },
      ],
    },
  ],
  strokeColor: "#E11D48",
  color: "#E11D48",
  opacity: 1,
  strokeWidth: 4,
  created: new Date("2026-11-01T10:00:00Z"),
})
assert.equal(typeof ink.created, "string")
assert.ok(reviveAnnotation(ink).created instanceof Date)
const square = serializeAnnotation({
  type: PdfAnnotationSubtype.SQUARE,
  id: "mark-square",
  pageIndex: 1,
  rect: { origin: { x: 350, y: 450 }, size: { width: 120, height: 80 } },
  flags: ["print"],
  color: "transparent",
  opacity: 1,
  strokeWidth: 2,
  strokeColor: "#2563EB",
  strokeStyle: 0,
})
const koreanText = serializeAnnotation({
  type: PdfAnnotationSubtype.FREETEXT,
  id: "mark-text",
  pageIndex: 1,
  rect: { origin: { x: 72, y: 600 }, size: { width: 200, height: 30 } },
  contents: "핵심 결과",
  fontSize: 14,
  fontColor: "#E11D48",
  fontFamily: 0,
  textAlign: 0,
  verticalAlign: 0,
  opacity: 1,
  color: "transparent",
  flags: ["print"],
})
const marks: PdfMark[] = [
  { id: "mark-ink", pageIndex: 1, annotation: ink },
  { id: "mark-square", pageIndex: 1, annotation: square },
  { id: "mark-text", pageIndex: 1, annotation: koreanText },
]
const highlights: PdfTextHighlight[] = [
  {
    id: "h1",
    text: "Highlighted sentence",
    style: "yellow",
    pages: [{ pageNumber: 1, rects: [{ x: 72, y: 82, width: 120, height: 12 }] }],
    createdAt: "2026-11-01T10:00:00Z",
    note: "Key claim",
  },
  {
    id: "h2",
    text: "first page",
    style: "red-underline",
    pages: [{ pageNumber: 1, rects: [{ x: 200, y: 82, width: 60, height: 12 }] }],
    createdAt: "2026-11-01T10:01:00Z",
  },
]

try {
  const result = await writeAnnotatedCopy(input, output, exportAnnotations(highlights, marks))
  assert.deepEqual(result, { written: 5, skipped: 0 })
  // The original is untouched; the copy carries appearance streams.
  assert.deepEqual(new Uint8Array(await readFile(input)), original)
  const copy = await readFile(output)
  const text = new TextDecoder("latin1").decode(copy)
  for (const subtype of ["Ink", "Square", "Highlight", "Underline"])
    assert.match(text, new RegExp(`/Subtype\\s*/${subtype}`), `${subtype} annotation`)
  assert.ok((text.match(/\/AP\s*<</g) ?? []).length >= 4, "every annotation has an appearance stream")
  await assert.rejects(() => writeAnnotatedCopy(input, input, []), /덮어쓰지 않습니다/)

  // Read the copy back with PDFium: annotations and their contents survive.
  const wasm = await readFile(fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm")))
  const engine = new PdfiumNative(await init({ wasmBinary: wasm }), { fontFallback: null })
  try {
    const document = await engine
      .openDocumentBuffer({
        id: "copy",
        content: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer,
      })
      .toPromise()
    const [first, second] = document.pages
    assert.ok(first && second)
    const onFirst: PdfAnnotationObject[] = await engine.getPageAnnotations(document, first).toPromise()
    const onSecond: PdfAnnotationObject[] = await engine.getPageAnnotations(document, second).toPromise()
    assert.deepEqual(
      onFirst.map((a) => a.type).sort((a, b) => a - b),
      [PdfAnnotationSubtype.HIGHLIGHT, PdfAnnotationSubtype.UNDERLINE],
    )
    assert.equal(onFirst.find((a) => a.type === PdfAnnotationSubtype.HIGHLIGHT)?.contents, "Key claim")
    // A Korean text box becomes a note, whose text other viewers draw in their own font.
    assert.deepEqual(
      onSecond.map((a) => a.type).sort((a, b) => a - b),
      [PdfAnnotationSubtype.TEXT, PdfAnnotationSubtype.SQUARE, PdfAnnotationSubtype.INK].sort(
        (a, b) => a - b,
      ),
    )
    assert.equal(onSecond.find((a) => a.type === PdfAnnotationSubtype.TEXT)?.contents, "핵심 결과")
  } finally {
    await engine.destroy().toPromise()
  }

  // On macOS, Quick Look draws with PDFKit, as Preview does: the stroke must show up.
  if (process.platform === "darwin" && existsSync("/usr/bin/qlmanage")) {
    const thumbnails = join(directory, "ql")
    Bun.spawnSync(["/bin/mkdir", "-p", thumbnails])
    const preview = Bun.spawnSync(["/usr/bin/qlmanage", "-t", "-s", "600", "-o", thumbnails, output])
    const png = join(thumbnails, `${output.split("/").at(-1)}.png`)
    if (preview.exitCode === 0 && existsSync(png)) console.log("  Quick Look rendered the annotated copy")
  }

  const markdown = annotationsMarkdown("paper", highlights, marks)
  assert.match(markdown, /> Highlighted sentence/)
  assert.match(markdown, /메모: Key claim/)
  assert.match(markdown, /p\. 2: 펜, 사각형, 텍스트 상자: 핵심 결과/)
  console.log(
    "Annotated export: marks and highlights as standard PDF annotations with appearance streams passed",
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
