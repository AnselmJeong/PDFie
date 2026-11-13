import { strict as assert } from "node:assert"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PdfSourceBridge } from "../src/bun/pdf/document-source-bridge"

const directory = await mkdtemp(join(tmpdir(), "pdfie-source-bridge-"))
const path = join(directory, "fixture.pdf")
const bytes = new TextEncoder().encode("%PDF-1.7\nPDFie range fixture\n%%EOF")
await writeFile(path, bytes)
const bridge = new PdfSourceBridge()

try {
  const source = await bridge.register(path)
  assert.equal(source.url.includes(path), false)
  assert.equal(source.documentId.includes("fixture.pdf"), false)

  const response = await fetch(source.url, { headers: { Range: "bytes=0-7" } })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get("accept-ranges"), "bytes")
  assert.equal(response.headers.get("content-range"), `bytes 0-7/${bytes.length}`)
  assert.equal(await response.text(), "%PDF-1.7")

  bridge.closeDocument(source.documentId)
  assert.equal((await fetch(source.url)).status, 404)

  // Sources are always the user's own file: the library keeps its path, and
  // closing never deletes it. There is no upload endpoint.
  const reopened = await bridge.register(path)
  assert.equal(bridge.persistentPath(reopened.documentId), path)
  assert.equal(reopened.fileName, "fixture.pdf")
  bridge.closeDocument(reopened.documentId)
  assert.equal(await Bun.file(path).exists(), true)
  const origin = new URL(reopened.url).origin
  assert.equal((await fetch(`${origin}/upload/anything`, { method: "POST", body: bytes })).status, 404)

  const notPdf = join(directory, "notes.pdf")
  await writeFile(notPdf, "plain text")
  await assert.rejects(() => bridge.register(notPdf), /유효한 PDF가 아닙니다/)
  console.log("PdfSourceBridge Bun runtime integration: passed")
} finally {
  bridge.close()
  await rm(directory, { recursive: true, force: true })
}
