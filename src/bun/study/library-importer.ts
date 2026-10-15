import { createHash, randomUUID } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { lstat, opendir, realpath } from "node:fs/promises"
import { basename, join } from "node:path"
import { INDEX_VERSION } from "../../shared/study/contracts"
import type { LibraryImportStatus } from "../../shared/study/library"
import type { BackgroundIndexer } from "../pdf/background-index"
import type { StudyLibrary } from "../persistence/study-library"
import type { StudyStore } from "../persistence/study-store"

type Batch = { id: string; phase: LibraryImportStatus["phase"]; roots: string; notes: string }
type Item = { id: string; path: string; hash: string | null; state: string; error: string }

export class LibraryImporter {
  private running: Promise<void> | null = null
  private controller: AbortController | null = null
  private active: LibraryImportStatus["active"] = null
  private closing = false
  constructor(
    private store: StudyStore,
    private library: StudyLibrary,
    private index: BackgroundIndexer,
    private changed: (hash: string) => void,
    private classified: (hash: string) => void,
  ) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS library_import_batches(id TEXT PRIMARY KEY,phase TEXT NOT NULL,roots TEXT NOT NULL,notes TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library_import_items(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES library_import_batches(id),path TEXT NOT NULL,hash TEXT,state TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',UNIQUE(batch_id,path));
      CREATE INDEX IF NOT EXISTS library_import_queue ON library_import_items(batch_id,state);
      UPDATE library_import_items SET state='pending' WHERE state='indexing';
      DELETE FROM library_indexing;
      INSERT OR IGNORE INTO schema_migrations VALUES(6);`)
  }
  private latest(): Batch | null {
    return (
      this.store.db
        .query<Batch, []>("SELECT * FROM library_import_batches ORDER BY rowid DESC LIMIT 1")
        .get() ?? null
    )
  }
  start(paths: string[]) {
    if (this.running || ["scanning", "importing"].includes(this.latest()?.phase ?? ""))
      throw new Error("진행 중인 가져오기를 완료하거나 중지한 뒤 추가하세요.")
    if (!paths.length) return this.status()
    const id = randomUUID()
    this.store.db
      .query("INSERT INTO library_import_batches VALUES(?,?,?,?,?)")
      .run(id, "scanning", JSON.stringify(paths), "[]", new Date().toISOString())
    this.resume()
    return this.status()
  }
  resume() {
    const batch = this.latest()
    if (this.running || this.closing || !batch || !["scanning", "importing"].includes(batch.phase)) return
    const controller = new AbortController()
    this.controller = controller
    this.running = this.run(batch, controller.signal)
      .catch((cause) => {
        this.note(batch.id, cause instanceof Error ? cause.message : "가져오기를 완료하지 못했습니다.")
        this.store.db.query("UPDATE library_import_batches SET phase='complete' WHERE id=?").run(batch.id)
        this.store.db
          .query(
            "UPDATE library_import_items SET state='failed',error='가져오기가 중단되었습니다. 다시 추가하세요.' WHERE batch_id=? AND state IN ('pending','indexing')",
          )
          .run(batch.id)
      })
      .finally(() => {
        this.running = null
        this.controller = null
        this.active = null
      })
  }
  async cancel() {
    this.controller?.abort()
    await this.running
    return this.status()
  }
  async close() {
    this.closing = true
    await this.cancel()
  }
  private note(id: string, text: string) {
    const row = this.store.db
      .query<{ notes: string }, [string]>("SELECT notes FROM library_import_batches WHERE id=?")
      .get(id)
    const notes: string[] = JSON.parse(row?.notes ?? "[]")
    if (notes.length < 20) {
      notes.push(text.slice(0, 500))
      this.store.db
        .query("UPDATE library_import_batches SET notes=? WHERE id=?")
        .run(JSON.stringify(notes), id)
    }
  }
  private async discover(batch: Batch, signal: AbortSignal) {
    const queue: { path: string; depth: number }[] = JSON.parse(batch.roots).map((path: string) => ({
      path,
      depth: 0,
    }))
    const visited = new Set<string>()
    let count = 0,
      folders = 0
    while (queue.length && !signal.aborted) {
      const entry = queue.shift()
      if (!entry) break
      try {
        const info = await lstat(entry.path)
        if (info.isSymbolicLink()) {
          this.note(batch.id, `심볼릭 링크 건너뜀: ${basename(entry.path)}`)
          continue
        }
        const path = await realpath(entry.path)
        if (visited.has(path)) continue
        visited.add(path)
        if (info.isDirectory()) {
          if (entry.depth > 64 || ++folders > 20000)
            throw new Error("폴더 탐색 범위가 너무 큽니다. 더 작은 폴더를 선택하세요.")
          const dir = await opendir(path)
          for await (const child of dir) {
            if (signal.aborted) break
            if (
              !child.name.startsWith(".") &&
              !child.isSymbolicLink() &&
              (child.isDirectory() || child.name.toLowerCase().endsWith(".pdf"))
            )
              queue.push({ path: join(path, child.name), depth: entry.depth + 1 })
          }
        } else if (info.isFile() && path.toLowerCase().endsWith(".pdf")) {
          if (++count > 10000) {
            this.note(batch.id, "한 번에 10,000개까지 추가합니다. 나머지는 폴더를 나누어 추가하세요.")
            break
          }
          this.store.db
            .query(
              "INSERT OR IGNORE INTO library_import_items(id,batch_id,path,state) VALUES(?,?,?,'pending')",
            )
            .run(randomUUID(), batch.id, path)
        }
      } catch (cause) {
        this.note(
          batch.id,
          `${basename(entry.path)}: ${cause instanceof Error ? cause.message : "접근할 수 없습니다."}`,
        )
      }
    }
  }
  private async run(batch: Batch, signal: AbortSignal) {
    if (batch.phase === "scanning") await this.discover(batch, signal)
    if (!signal.aborted)
      this.store.db.query("UPDATE library_import_batches SET phase='importing' WHERE id=?").run(batch.id)
    while (!signal.aborted) {
      const item = this.store.db
        .query<Item, [string]>(
          "SELECT * FROM library_import_items WHERE batch_id=? AND state='pending' ORDER BY path LIMIT 1",
        )
        .get(batch.id)
      if (!item) break
      let hash: string | null = null
      this.active = { name: basename(item.path), page: 0, total: 0 }
      this.store.db.query("UPDATE library_import_items SET state='indexing' WHERE id=?").run(item.id)
      try {
        const file = Bun.file(item.path)
        if (file.size > 512 * 1024 * 1024) throw new Error("512MB보다 큰 PDF는 개별적으로 열어 주세요.")
        if ((await file.slice(0, 5).text()) !== "%PDF-") throw new Error("유효한 PDF 파일이 아닙니다.")
        const digest = createHash("sha256")
        for await (const chunk of createReadStream(item.path)) {
          signal.throwIfAborted()
          digest.update(chunk)
        }
        hash = digest.digest("hex")
        signal.throwIfAborted()
        this.store.db.query("UPDATE library_import_items SET hash=? WHERE id=?").run(hash, item.id)
        const existing = this.library.contains(hash)
        const index = this.store.index(hash)
        if (existing && !existsSync(this.library.sourcePath(hash) ?? ""))
          this.library.remember(hash, basename(item.path), item.path)
        const complete =
          index.revision === `${hash}:${INDEX_VERSION}` &&
          index.pageCount > 0 &&
          this.store.completedPages(hash).length === index.pageCount
        if (!complete) {
          this.library.setIndexing(hash, true)
          const indexingHash = hash
          await this.index(item.path, hash, signal, (page, total) => {
            if (!this.library.contains(indexingHash))
              this.library.remember(indexingHash, basename(item.path), item.path)
            this.active = { name: basename(item.path), page, total }
          })
        }
        signal.throwIfAborted()
        if (!this.library.contains(hash)) this.library.remember(hash, basename(item.path), item.path)
        const final = this.store.index(hash)
        const warning = final.failedPages.length
          ? `${final.failedPages.length}개 페이지 분석 실패. PDF를 열어 확인하세요.`
          : final.ocrPages.length
            ? `${final.ocrPages.length}개 페이지는 텍스트가 없어 OCR이 필요합니다.`
            : ""
        this.store.db
          .query("UPDATE library_import_items SET state=?,error=? WHERE id=?")
          .run(existing && complete ? "duplicate" : "added", warning, item.id)
        this.changed(hash)
        this.classified(hash)
      } catch (cause) {
        this.store.db
          .query("UPDATE library_import_items SET state=?,error=? WHERE id=?")
          .run(
            signal.aborted ? (this.closing ? "pending" : "cancelled") : "failed",
            signal.aborted
              ? ""
              : cause instanceof Error
                ? cause.message.slice(0, 500)
                : "가져오기에 실패했습니다.",
            item.id,
          )
      } finally {
        if (hash) {
          this.library.setIndexing(hash, false)
          this.changed(hash)
        }
        this.active = null
      }
    }
    if (this.closing) return // Keep the durable queue ready for the next launch.
    if (signal.aborted)
      this.store.db
        .query("UPDATE library_import_items SET state='cancelled' WHERE batch_id=? AND state='pending'")
        .run(batch.id)
    this.store.db
      .query("UPDATE library_import_batches SET phase=? WHERE id=?")
      .run(signal.aborted ? "cancelled" : "complete", batch.id)
  }
  status(): LibraryImportStatus {
    const batch = this.latest()
    const counts = new Map(
      this.store.db
        .query<{ state: string; count: number }, [string]>(
          "SELECT state,COUNT(*) count FROM library_import_items WHERE batch_id=? GROUP BY state",
        )
        .all(batch?.id ?? "")
        .map((r) => [r.state, r.count]),
    )
    const classification = this.store.db
      .query<{ state: string | null; count: number }, [string]>(
        `SELECT json_extract(c.payload,'$.state') state,COUNT(DISTINCT i.hash) count FROM library_import_items i LEFT JOIN library_classification c ON c.document_hash=i.hash WHERE i.batch_id=? AND i.state IN ('added','duplicate') GROUP BY json_extract(c.payload,'$.state')`,
      )
      .all(batch?.id ?? "")
    return {
      batchId: batch?.id ?? null,
      phase: batch?.phase ?? "idle",
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      added: counts.get("added") ?? 0,
      duplicates: counts.get("duplicate") ?? 0,
      failed: counts.get("failed") ?? 0,
      pending: (counts.get("pending") ?? 0) + (counts.get("indexing") ?? 0),
      cancelled: counts.get("cancelled") ?? 0,
      active: this.active,
      notes: JSON.parse(batch?.notes ?? "[]"),
      issues: this.store.db
        .query<{ id: string; path: string; error: string }, [string]>(
          "SELECT id,path,error FROM library_import_items WHERE batch_id=? AND error!='' ORDER BY rowid LIMIT 100",
        )
        .all(batch?.id ?? "")
        .map((r) => ({ id: r.id, name: basename(r.path), error: r.error })),
      classifications: {
        complete: classification
          .filter((r) => r.state === "complete" || r.state === "manual")
          .reduce((n, r) => n + r.count, 0),
        pending: classification
          .filter((r) => !r.state || r.state === "queued" || r.state === "running")
          .reduce((n, r) => n + r.count, 0),
        needsAttention: classification
          .filter((r) => r.state === "failed" || r.state === "insufficient")
          .reduce((n, r) => n + r.count, 0),
      },
    }
  }
}
