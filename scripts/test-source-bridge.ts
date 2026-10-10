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

  await assert.rejects(() => bridge.prepareDropUpload("notes.txt", bytes.length), /PDF 파일만/)
  const { uploadUrl } = await bridge.prepareDropUpload("Dropped Book.pdf", bytes.length)
  const preflight = await fetch(uploadUrl, { method: "OPTIONS" })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/)

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: bytes,
  })
  assert.equal(upload.status, 201)
  const uploaded = (await upload.json()) as { documentId: string }
  const droppedSource = bridge.getSource(uploaded.documentId)
  assert.equal(droppedSource.fileName, "Dropped Book.pdf")
  assert.equal(droppedSource.sizeBytes, bytes.length)
  assert.equal(await (await fetch(droppedSource.url)).text(), new TextDecoder().decode(bytes))

  assert.equal((await fetch(uploadUrl, { method: "POST", body: bytes })).status, 410)
  bridge.closeDocument(uploaded.documentId)
  assert.equal((await fetch(droppedSource.url)).status, 404)
  console.log("PdfSourceBridge Bun runtime integration: passed")
} finally {
  bridge.close()
  await rm(directory, { recursive: true, force: true })
}
