import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PdfSourceBridge } from "../src/bun/pdf/document-source-bridge"
import { HashCache } from "../src/bun/pdf/hash-cache"

const directory = await mkdtemp(join(tmpdir(), "pdfie-source-bridge-"))
const path = join(directory, "fixture.pdf")
const bytes = new TextEncoder().encode("%PDF-1.7\nPDFie range fixture\n%%EOF")
await writeFile(path, bytes)
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex")
const cachePath = join(directory, "hash-cache.json")
const cache = await HashCache.open(cachePath)
const bridge = new PdfSourceBridge(cache)

try {
  const source = await bridge.register(path)
  assert.equal(source.url.includes(path), false)
  assert.equal(source.documentId.includes("fixture.pdf"), false)
  // A file PDFie has never read is served before its hash is known.
  assert.equal(source.documentHash, null)

  const response = await fetch(source.url, { headers: { Range: "bytes=0-7" } })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get("accept-ranges"), "bytes")
  assert.equal(response.headers.get("content-range"), `bytes 0-7/${bytes.length}`)
  assert.equal(await response.text(), "%PDF-1.7")

  assert.equal(await bridge.identify(source.documentId), sha(bytes))
  assert.equal(bridge.getSource(source.documentId).documentHash, sha(bytes))

  bridge.closeDocument(source.documentId)
  assert.equal((await fetch(source.url)).status, 404)
  await assert.rejects(() => bridge.identify(source.documentId), /열려 있는 PDF를 찾을 수 없습니다/)

  // Sources are always the user's own file: the library keeps its path, and
  // closing never deletes it. There is no upload endpoint.
  const reopened = await bridge.register(path)
  // An unchanged file is identified from the cache without reading it again.
  assert.equal(reopened.documentHash, sha(bytes))
  assert.equal(bridge.persistentPath(reopened.documentId), path)
  assert.equal(reopened.fileName, "fixture.pdf")
  bridge.closeDocument(reopened.documentId)
  assert.equal(await Bun.file(path).exists(), true)
  const origin = new URL(reopened.url).origin
  assert.equal((await fetch(`${origin}/upload/anything`, { method: "POST", body: bytes })).status, 404)

  // The cache survives a restart.
  await cache.flush()
  const restarted = new PdfSourceBridge(await HashCache.open(cachePath))
  try {
    const afterRestart = await restarted.register(path)
    assert.equal(afterRestart.documentHash, sha(bytes))
  } finally {
    restarted.close()
  }

  // A changed file is never matched to the old hash: it is hashed afresh.
  const changed = new TextEncoder().encode("%PDF-1.7\nPDFie range fixture, edited\n%%EOF")
  await writeFile(path, changed)
  const edited = await bridge.register(path)
  assert.equal(edited.documentHash, null)
  assert.equal(await bridge.identify(edited.documentId), sha(changed))
  bridge.closeDocument(edited.documentId)

  // A large file opens without waiting for the full read.
  const large = join(directory, "large.pdf")
  const chunk = new Uint8Array(4 * 1024 * 1024).fill(32)
  chunk.set(new TextEncoder().encode("%PDF-1.7\n"))
  await writeFile(large, Buffer.concat(Array.from({ length: 24 }, () => chunk)))
  const startedAt = performance.now()
  const big = await bridge.register(large)
  const registeredIn = performance.now() - startedAt
  assert.equal(big.documentHash, null)
  assert.equal(big.sizeBytes, 96 * 1024 * 1024)
  const identity = await bridge.identify(big.documentId)
  const identifiedIn = performance.now() - startedAt
  assert.match(identity, /^[0-9a-f]{64}$/)
  console.log(
    `  96 MB file: served after ${registeredIn.toFixed(1)} ms, identified after ${identifiedIn.toFixed(0)} ms`,
  )
  assert.ok(registeredIn < identifiedIn)

  const notPdf = join(directory, "notes.pdf")
  await writeFile(notPdf, "plain text")
  await assert.rejects(() => bridge.register(notPdf), /유효한 PDF가 아닙니다/)
  console.log("PdfSourceBridge Bun runtime integration: passed")
} finally {
  bridge.close()
  await rm(directory, { recursive: true, force: true })
}
