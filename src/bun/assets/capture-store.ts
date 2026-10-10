import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { inflateSync } from "node:zlib"
import type { CaptureAsset } from "../../shared/study/contracts"
import type { StudyStore } from "../persistence/study-store"

export function validateCapture(asset: CaptureAsset, pageCount: number): CaptureAsset {
  if (
    !Number.isInteger(asset.pageIndex) ||
    asset.pageIndex < 0 ||
    asset.pageIndex >= pageCount ||
    ![asset.rect.x, asset.rect.y, asset.rect.width, asset.rect.height].every(Number.isFinite) ||
    asset.rect.x < 0 ||
    asset.rect.y < 0 ||
    asset.rect.width <= 0 ||
    asset.rect.height <= 0
  )
    throw new Error("캡처 위치가 올바르지 않습니다.")
  if (
    typeof asset.dataUrl !== "string" ||
    !asset.dataUrl.startsWith("data:image/png;base64,") ||
    asset.dataUrl.length > 7000000
  )
    throw new Error("캡처는 5MB 이하 PNG여야 합니다.")
  const data = Buffer.from(asset.dataUrl.slice(22), "base64")
  if (
    data.length > 5 * 1024 * 1024 ||
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    data.subarray(12, 16).toString() !== "IHDR"
  )
    throw new Error("PNG 이미지 형식이 올바르지 않습니다.")
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20)
  if (
    !width ||
    !height ||
    width > 2048 ||
    height > 2048 ||
    width !== asset.width ||
    height !== asset.height ||
    width * height > 4194304 ||
    data[24] !== 8 ||
    ![2, 6].includes(data[25] ?? 0) ||
    data[28] !== 0
  )
    throw new Error("캡처 크기 또는 PNG 형식이 지원 범위를 벗어났습니다.")
  const chunks: Buffer[] = []
  let ended = false
  for (let offset = 8; offset + 12 <= data.length; ) {
    const length = data.readUInt32BE(offset)
    if (offset + length + 12 > data.length) throw new Error("잘린 PNG 이미지입니다.")
    const type = data.subarray(offset + 4, offset + 8).toString()
    if (type === "IDAT") chunks.push(data.subarray(offset + 8, offset + 8 + length))
    if (type === "IEND") {
      ended = true
      break
    }
    offset += length + 12
  }
  const channels = data[25] === 6 ? 4 : 3
  const expected = height * (width * channels + 1)
  if (
    !ended ||
    !chunks.length ||
    inflateSync(Buffer.concat(chunks), { maxOutputLength: expected + 1 }).length !== expected
  )
    throw new Error("PNG 픽셀 데이터가 올바르지 않습니다.")
  return {
    ...asset,
    id: `C-${createHash("sha256").update(data).update(String(asset.pageIndex)).update(JSON.stringify(asset.rect)).digest("hex").slice(0, 24)}`,
    createdAt: new Date().toISOString(),
  }
}
export class CaptureStore {
  readonly directory: string
  constructor(private store: StudyStore) {
    this.directory = join(dirname(store.path), "pdfie-captures-v1")
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    this.pruneUnreferenced()
  }
  pruneUnreferenced(now = Date.now()) {
    const rows = this.store.db
      .query<{ document_hash: string; id: string; payload: string }, []>(
        "SELECT document_hash,id,payload FROM entities WHERE kind='captures'",
      )
      .all()
    for (const row of rows) {
      const asset = JSON.parse(row.payload) as CaptureAsset
      if (now - Date.parse(asset.createdAt) >= 86400000) this.removeUnused(row.document_hash, row.id)
    }
  }
  path(hash: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(hash) || !/^C-[a-f0-9]{24}$/.test(id))
      throw new Error("이미지 식별자가 올바르지 않습니다.")
    return join(this.directory, hash, `${id}.png`)
  }
  save(documentHash: string, asset: CaptureAsset) {
    const page = this.store.db
      .query<{ payload: string }, [string, number]>(
        "SELECT payload FROM pages WHERE document_hash=? AND page_index=?",
      )
      .get(documentHash, asset.pageIndex)
    if (!page) throw new Error("캡처 페이지의 분석을 먼저 완료하세요.")
    const geometry = JSON.parse(page.payload) as { width: number; height: number }
    if (
      asset.rect.x + asset.rect.width > geometry.width + 2 ||
      asset.rect.y + asset.rect.height > geometry.height + 2
    )
      throw new Error("캡처가 PDF 페이지 범위를 벗어났습니다.")
    const checked = validateCapture({ ...asset, documentHash }, this.store.index(documentHash).pageCount)
    const data = Buffer.from(checked.dataUrl.slice(22), "base64"),
      path = this.path(documentHash, checked.id)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const existed = existsSync(path),
      temporary = `${path}.${crypto.randomUUID()}.tmp`
    writeFileSync(temporary, data, { mode: 0o600 })
    renameSync(temporary, path)
    const { dataUrl: _, ...metadata } = checked
    try {
      this.store.put(documentHash, "captures", checked.id, {
        ...metadata,
        sha256: createHash("sha256").update(data).digest("hex"),
      })
    } catch (cause) {
      if (!existed) unlinkSync(path)
      throw cause
    }
    return checked
  }
  get(documentHash: string, id: string): CaptureAsset | undefined {
    const asset = this.store
      .list<Omit<CaptureAsset, "dataUrl"> & { sha256: string }>(documentHash, "captures")
      .find((a) => a.id === id)
    if (!asset) return undefined
    const data = readFileSync(this.path(documentHash, id))
    if (createHash("sha256").update(data).digest("hex") !== asset.sha256)
      throw new Error("저장한 이미지가 손상되었습니다. 다시 캡처하세요.")
    return { ...asset, dataUrl: `data:image/png;base64,${data.toString("base64")}` }
  }
  removeUnused(documentHash: string, id: string) {
    if (!this.store.snapshot(documentHash).messages.some((m) => m.captureId === id)) {
      this.store.remove(documentHash, "captures", id)
      const path = this.path(documentHash, id)
      if (existsSync(path)) unlinkSync(path)
    }
  }
  clear(hash: string) {
    for (const asset of this.store.list<CaptureAsset>(hash, "captures")) {
      const path = this.path(hash, asset.id)
      if (existsSync(path)) unlinkSync(path)
    }
  }
}
