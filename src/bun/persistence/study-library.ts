import { existsSync } from "node:fs"
import type { LibraryDetail, LibraryDocument, LibraryPage, LibraryQuery } from "../../shared/study/library"
import type { StudyStore } from "./study-store"

type CatalogRow = {
  hash: string
  title: string
  file_name: string
  source_path: string | null
  favorite: number
  archived: number
  created_at: string
  updated_at: string
  page_count: number
  lessons: number
  completed: number
  messages: number
  goals: number
  checked: number
}
const columns = `l.*,
  COALESCE(d.page_count,0) page_count,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='lessons') lessons,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='progress' AND json_extract(e.payload,'$.completedAt') IS NOT NULL) completed,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='messages' AND json_extract(e.payload,'$.role')='assistant' AND json_extract(e.payload,'$.task')!='goals') messages,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='goals') goals,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='goals' AND json_extract(e.payload,'$.checked')=1) checked`

/** Catalog identity is the PDF byte hash; review never needs an open PDF handle. */
export class StudyLibrary {
  constructor(private store: StudyStore) {
    // Additive migration: retain every legacy lesson, answer, evidence and attempt.
    store.db.exec(`CREATE TABLE IF NOT EXISTS library_documents(
      hash TEXT PRIMARY KEY, title TEXT NOT NULL, file_name TEXT NOT NULL,
      source_path TEXT, favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations VALUES(2);
      INSERT OR IGNORE INTO library_documents
      SELECT d.hash,
        COALESCE((SELECT json_extract(e.payload,'$.title') FROM entities e WHERE e.document_hash=d.hash AND e.kind='lessons' ORDER BY rowid LIMIT 1),
          (SELECT json_extract(b.payload,'$.rawText') FROM blocks b WHERE b.document_hash=d.hash AND json_extract(b.payload,'$.role')='heading' ORDER BY page_index,reading_order LIMIT 1), '이전 학습 자료'),
        '', NULL, 0, 0,
        COALESCE((SELECT MIN(json_extract(e.payload,'$.createdAt')) FROM entities e WHERE e.document_hash=d.hash),'1970-01-01T00:00:00.000Z'),
        COALESCE((SELECT MAX(json_extract(e.payload,'$.createdAt')) FROM entities e WHERE e.document_hash=d.hash),'1970-01-01T00:00:00.000Z')
      FROM documents d;`)
  }
  remember(hash: string, fileName: string, sourcePath: string | null) {
    const now = new Date().toISOString()
    this.store.db
      .query(`INSERT INTO library_documents(hash,title,file_name,source_path,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(hash) DO UPDATE SET
      title=CASE WHEN library_documents.file_name='' THEN excluded.title ELSE library_documents.title END,
      file_name=excluded.file_name, source_path=COALESCE(excluded.source_path,library_documents.source_path)`)
      .run(hash, fileName.replace(/\.pdf$/i, ""), fileName, sourcePath, now, now)
  }
  require(hash: string) {
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      !this.store.db.query("SELECT hash FROM library_documents WHERE hash=?").get(hash)
    )
      throw new Error("학습 자료를 찾지 못했습니다. 서재를 새로고침하세요.")
    return hash
  }
  sourcePath(hash: string): string | null {
    this.require(hash)
    return (
      this.store.db
        .query<{ source_path: string | null }, [string]>(
          "SELECT source_path FROM library_documents WHERE hash=?",
        )
        .get(hash)?.source_path ?? null
    )
  }
  private document(row: CatalogRow): LibraryDocument {
    return {
      documentHash: row.hash,
      title: row.title,
      fileName: row.file_name,
      sourceLinked: !!row.source_path,
      sourceAvailable: !!row.source_path && existsSync(row.source_path),
      favorite: !!row.favorite,
      archived: !!row.archived,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pageCount: row.page_count,
      lessonCount: row.lessons,
      completedLessonCount: row.completed,
      messageCount: row.messages,
      goalCount: row.goals,
      checkedGoalCount: row.checked,
    }
  }
  list(query: LibraryQuery = {}): LibraryPage {
    const search = (query.query ?? "").trim().slice(0, 300)
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`
    const filter =
      query.filter === "archived"
        ? "l.archived=1"
        : `l.archived=0${query.filter === "favorites" ? " AND l.favorite=1" : query.filter === "lessons" ? " AND EXISTS(SELECT 1 FROM entities e WHERE e.document_hash=l.hash AND e.kind='lessons')" : ""}`
    const where = `${filter} AND (?='' OR l.title LIKE ? ESCAPE '\\' OR l.file_name LIKE ? ESCAPE '\\' OR EXISTS(
      SELECT 1 FROM entities e WHERE e.document_hash=l.hash AND e.kind IN ('messages','lessons','goals') AND e.payload LIKE ? ESCAPE '\\'))`
    const params = [search, pattern, pattern, pattern] as const
    const total =
      this.store.db
        .query<{ count: number }, [string, string, string, string]>(
          `SELECT COUNT(*) count FROM library_documents l WHERE ${where}`,
        )
        .get(...params)?.count ?? 0
    const offset = Math.max(0, Math.floor(query.offset ?? 0))
    if (!Number.isFinite(offset)) throw new Error("목록 위치가 올바르지 않습니다.")
    const rows = this.store.db
      .query<CatalogRow, [string, string, string, string, number]>(
        `SELECT ${columns} FROM library_documents l LEFT JOIN documents d ON d.hash=l.hash WHERE ${where}
      ORDER BY ${query.sort === "title" ? "l.title COLLATE NOCASE" : "l.updated_at DESC"},l.hash LIMIT 40 OFFSET ?`,
      )
      .all(...params, offset)
    return { items: rows.map((row) => this.document(row)), total }
  }
  detail(hash: string): LibraryDetail {
    this.require(hash)
    const row = this.store.db
      .query<CatalogRow, [string]>(
        `SELECT ${columns} FROM library_documents l LEFT JOIN documents d ON d.hash=l.hash WHERE l.hash=?`,
      )
      .get(hash)
    if (!row) throw new Error("학습 자료를 찾지 못했습니다.")
    return { document: this.document(row), snapshot: this.store.snapshot(hash) }
  }
  update(hash: string, patch: { title?: string; favorite?: boolean; archived?: boolean }) {
    this.require(hash)
    const title = patch.title?.trim()
    if (title !== undefined && (!title || title.length > 500)) throw new Error("제목을 1~500자로 입력하세요.")
    this.store.db
      .query(
        `UPDATE library_documents SET title=COALESCE(?,title),favorite=COALESCE(?,favorite),archived=COALESCE(?,archived) WHERE hash=?`,
      )
      .run(
        title ?? null,
        patch.favorite === undefined ? null : Number(patch.favorite),
        patch.archived === undefined ? null : Number(patch.archived),
        hash,
      )
  }
  remove(hash: string) {
    this.require(hash)
    this.store.db.transaction(() => {
      this.store.db.query("DELETE FROM documents WHERE hash=?").run(hash)
      this.store.db.query("DELETE FROM library_documents WHERE hash=?").run(hash)
    })()
  }
}
