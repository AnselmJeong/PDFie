import { readFile, rename, writeFile } from "node:fs/promises"
import { PdfiumNative } from "@embedpdf/engines/pdfium"
import type { PdfAnnotationObject } from "@embedpdf/models"
import { init } from "@embedpdf/pdfium"
import { reviveAnnotation } from "../../shared/pdf/annotation-export"

/**
 * Isolated PDFium process that writes an annotated copy of a PDF: the
 * original file is only read. Annotations arrive as JSON on stdin; each is
 * created fresh, so PDFium writes its appearance stream (/AP) and other
 * viewers (Preview, Acrobat) can draw it.
 */
const ALLOWED_TYPES = new Set([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15])
const MAX_ANNOTATIONS = 20_000

const [input, wasmPath, output] = process.argv.slice(2)
if (!input || !wasmPath || !output) throw new Error("Missing PDF export arguments")
const request = JSON.parse(await Bun.stdin.text()) as { annotations?: unknown }
const annotations = Array.isArray(request.annotations) ? request.annotations.slice(0, MAX_ANNOTATIONS) : []

const bytes = await readFile(input)
const engine = new PdfiumNative(await init({ wasmBinary: await readFile(wasmPath) }), { fontFallback: null })
let written = 0
let skipped = 0
try {
  const document = await engine
    .openDocumentBuffer({
      id: "export",
      content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    .toPromise()
  for (const raw of annotations) {
    if (!raw || typeof raw !== "object") {
      skipped++
      continue
    }
    const annotation = reviveAnnotation(raw as Record<string, unknown>)
    const page = document.pages[Number(annotation.pageIndex)]
    if (!page || !ALLOWED_TYPES.has(Number(annotation.type))) {
      skipped++
      continue
    }
    try {
      await engine
        .createPageAnnotation(document, page, {
          ...annotation,
          pageIndex: page.index,
        } as unknown as PdfAnnotationObject)
        .toPromise()
      written++
    } catch {
      skipped++
    }
  }
  const saved = await engine.saveAsCopy(document).toPromise()
  const temporary = `${output}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, new Uint8Array(saved))
  await rename(temporary, output)
  process.stdout.write(`${JSON.stringify({ type: "done", written, skipped })}\n`)
} finally {
  await engine.destroy().toPromise()
}
