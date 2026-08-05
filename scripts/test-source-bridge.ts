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
  console.log("PdfSourceBridge Bun runtime integration: passed")
} finally {
  bridge.close()
  await rm(directory, { recursive: true, force: true })
}
