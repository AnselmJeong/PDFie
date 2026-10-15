import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import type {
  LibraryCollection,
  LibraryDetail,
  LibraryDocument,
  LibraryFacets,
  LibraryPage,
  LibraryPatch,
  LibraryQuery,
  TopicClassification,
} from "../../shared/study/library"
import { LibraryTaxonomy } from "./library-taxonomy"
import type { StudyStore } from "./study-store"

type CatalogRow = {
  hash: string
  title: string
  topic: string
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
  COALESCE((SELECT topic FROM library_organization o WHERE o.document_hash=l.hash),'') topic,
  COALESCE(d.page_count,0) page_count,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='lessons') lessons,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='progress' AND json_extract(e.payload,'$.completedAt') IS NOT NULL) completed,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='messages' AND json_extract(e.payload,'$.role')='assistant' AND json_extract(e.payload,'$.task')!='goals') messages,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='goals') goals,
  (SELECT COUNT(*) FROM entities e WHERE e.document_hash=l.hash AND e.kind='goals' AND json_extract(e.payload,'$.checked')=1) checked`

/** Catalog identity is the PDF byte hash; review never needs an open PDF handle. */
export class StudyLibrary {
  readonly taxonomy: LibraryTaxonomy
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
      FROM documents d;
      CREATE TABLE IF NOT EXISTS library_organization(
        document_hash TEXT PRIMARY KEY REFERENCES library_documents(hash) ON DELETE CASCADE,
        topic TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS library_topics ON library_organization(topic,document_hash);
      CREATE TABLE IF NOT EXISTS library_collections(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
      CREATE TABLE IF NOT EXISTS library_memberships(
        document_hash TEXT NOT NULL REFERENCES library_documents(hash) ON DELETE CASCADE,
        collection_id TEXT NOT NULL REFERENCES library_collections(id) ON DELETE CASCADE,
        PRIMARY KEY(document_hash,collection_id));
      CREATE INDEX IF NOT EXISTS library_membership_collection ON library_memberships(collection_id,document_hash);
      CREATE INDEX IF NOT EXISTS library_recent ON library_documents(archived,updated_at DESC,hash);
      CREATE INDEX IF NOT EXISTS library_titles ON library_documents(archived,title COLLATE NOCASE,hash);
      INSERT OR IGNORE INTO schema_migrations VALUES(3);`)
    store.db.exec(`CREATE TABLE IF NOT EXISTS library_classification(
      document_hash TEXT PRIMARY KEY REFERENCES library_documents(hash) ON DELETE CASCADE,
      token TEXT NOT NULL, payload TEXT NOT NULL);
      INSERT OR IGNORE INTO library_classification
        SELECT document_hash,'legacy', '{"state":"manual","reason":"직접 지정한 주제"}'
        FROM library_organization WHERE topic!='';
      UPDATE library_classification SET payload=json_set(payload,'$.state','queued')
        WHERE json_extract(payload,'$.state')='running';
      INSERT OR IGNORE INTO schema_migrations VALUES(4);
      CREATE TABLE IF NOT EXISTS library_indexing(document_hash TEXT PRIMARY KEY);`)
    this.taxonomy = new LibraryTaxonomy(store)
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
  contains(hash: string) {
    return !!this.store.db.query("SELECT hash FROM library_documents WHERE hash=?").get(hash)
  }
  setIndexing(hash: string, value: boolean) {
    if (value) this.store.db.query("INSERT OR IGNORE INTO library_indexing VALUES(?)").run(hash)
    else this.store.db.query("DELETE FROM library_indexing WHERE document_hash=?").run(hash)
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
      topic: row.topic,
      classification: this.classification(row.hash),
      collections: this.store.db
        .query<LibraryCollection, [string]>(
          `SELECT c.id,c.name FROM library_collections c JOIN library_memberships m ON m.collection_id=c.id
        WHERE m.document_hash=? ORDER BY c.name COLLATE NOCASE,c.id`,
        )
        .all(row.hash),
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
    const where = `${filter}
      AND (?=0 OR COALESCE((SELECT topic FROM library_organization o WHERE o.document_hash=l.hash),'')=?)
      AND (?='' OR EXISTS(SELECT 1 FROM library_memberships m WHERE m.document_hash=l.hash AND m.collection_id=?))
      AND (?='' OR l.title LIKE ? ESCAPE '\\' OR l.file_name LIKE ? ESCAPE '\\'
      OR EXISTS(SELECT 1 FROM library_organization o WHERE o.document_hash=l.hash AND o.topic LIKE ? ESCAPE '\\')
      OR EXISTS(SELECT 1 FROM library_memberships m JOIN library_collections c ON c.id=m.collection_id
        WHERE m.document_hash=l.hash AND c.name LIKE ? ESCAPE '\\')
      OR EXISTS(SELECT 1 FROM entities e WHERE e.document_hash=l.hash AND e.kind IN ('messages','lessons','goals') AND e.payload LIKE ? ESCAPE '\\'))`
    const params = [
      query.topic === undefined ? 0 : 1,
      query.topic ?? "",
      query.collectionId ?? "",
      query.collectionId ?? "",
      search,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
    ] as const
    const total =
      this.store.db
        .query<{ count: number }, [...typeof params]>(
          `SELECT COUNT(*) count FROM library_documents l WHERE ${where}`,
        )
        .get(...params)?.count ?? 0
    const offset = Math.max(0, Math.floor(query.offset ?? 0))
    if (!Number.isFinite(offset)) throw new Error("목록 위치가 올바르지 않습니다.")
    const order =
      query.sort === "title"
        ? "l.title COLLATE NOCASE"
        : query.sort === "added"
          ? "l.created_at DESC"
          : "l.updated_at DESC"
    const rows = this.store.db
      .query<CatalogRow, [...typeof params, number]>(
        `SELECT ${columns} FROM library_documents l LEFT JOIN documents d ON d.hash=l.hash WHERE ${where}
      ORDER BY ${order},l.hash LIMIT 40 OFFSET ?`,
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
  update(hash: string, patch: LibraryPatch) {
    this.require(hash)
    const title = patch.title?.trim()
    if (title !== undefined && (!title || title.length > 500)) throw new Error("제목을 1~500자로 입력하세요.")
    const topic = patch.topic === undefined ? undefined : this.label(patch.topic, true)
    const ids = patch.collectionIds
    if (
      ids !== undefined &&
      (!Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some(
          (id) =>
            typeof id !== "string" ||
            !this.store.db.query("SELECT id FROM library_collections WHERE id=?").get(id),
        ))
    )
      throw new Error("컬렉션을 다시 선택해 주세요.")
    this.store.db.transaction(() => {
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
      if (topic !== undefined) {
        this.store.db
          .query(`INSERT INTO library_organization VALUES(?,?)
      ON CONFLICT(document_hash) DO UPDATE SET topic=excluded.topic`)
          .run(hash, topic ? this.taxonomy.ensure(topic) : "")
        this.setClassification(hash, { state: "manual", reason: "직접 지정한 주제" })
      }
      if (ids !== undefined) {
        this.store.db.query("DELETE FROM library_memberships WHERE document_hash=?").run(hash)
        const add = this.store.db.query("INSERT OR IGNORE INTO library_memberships VALUES(?,?)")
        for (const id of ids) add.run(hash, id)
      }
    })()
  }
  private label(value: string, empty = false): string {
    if (typeof value !== "string") throw new Error("이름을 입력하세요.")
    const name = value.normalize("NFC").replace(/\s+/g, " ").trim()
    if ((!empty && !name) || name.length > 80) throw new Error("이름을 1~80자로 입력하세요.")
    return name
  }
  classification(hash: string): TopicClassification | null {
    const row = this.store.db
      .query<{ payload: string }, [string]>(
        "SELECT payload FROM library_classification WHERE document_hash=?",
      )
      .get(hash)
    return row ? JSON.parse(row.payload) : null
  }
  setClassification(hash: string, state: TopicClassification): string {
    this.require(hash)
    const token = randomUUID()
    this.store.db
      .query(`INSERT INTO library_classification VALUES(?,?,?)
      ON CONFLICT(document_hash) DO UPDATE SET token=excluded.token,payload=excluded.payload`)
      .run(hash, token, JSON.stringify(state))
    return token
  }
  finishClassification(hash: string, token: string, state: TopicClassification, topic?: string): boolean {
    return this.store.db.transaction(() => {
      const result = this.store.db
        .query("UPDATE library_classification SET payload=? WHERE document_hash=? AND token=?")
        .run(JSON.stringify(state), hash, token)
      if (!result.changes) return false // A manual edit, retry or deletion superseded this response.
      if (topic !== undefined)
        this.store.db
          .query(`INSERT INTO library_organization(document_hash,topic) VALUES(?,?)
        ON CONFLICT(document_hash) DO UPDATE SET topic=excluded.topic`)
          .run(hash, this.taxonomy.ensure(this.label(topic)))
      return true
    })()
  }
  classificationCandidates(): string[] {
    return this.store.db
      .query<{ hash: string }, []>(`SELECT l.hash FROM library_documents l
      LEFT JOIN library_classification c ON c.document_hash=l.hash
      WHERE l.archived=0 AND NOT EXISTS(SELECT 1 FROM library_indexing i WHERE i.document_hash=l.hash) AND (c.document_hash IS NULL OR json_extract(c.payload,'$.state')='queued')
      ORDER BY l.created_at DESC,l.hash`)
      .all()
      .map((row) => row.hash)
  }
  retryFailedClassifications() {
    this.store.db.exec(`UPDATE library_classification SET payload=json_set(payload,'$.state','queued','$.reason','AI 연결 변경 후 분류 대기 중')
      WHERE json_extract(payload,'$.state')='failed'`)
  }
  saveCollection(name: string, id?: string): LibraryCollection {
    const label = this.label(name)
    if (id && !this.store.db.query("SELECT id FROM library_collections WHERE id=?").get(id))
      throw new Error("컬렉션을 찾지 못했습니다.")
    const duplicate = this.store.db
      .query<LibraryCollection, [string]>(
        "SELECT id,name FROM library_collections WHERE name=? COLLATE NOCASE",
      )
      .get(label)
    if (duplicate && duplicate.id !== id) throw new Error("같은 이름의 컬렉션이 있습니다.")
    const collection = { id: id ?? randomUUID(), name: label }
    this.store.db
      .query("INSERT INTO library_collections VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name")
      .run(collection.id, collection.name)
    return collection
  }
  deleteCollection(id: string) {
    // Only membership is removed; documents and study records are independent.
    this.store.db.query("DELETE FROM library_collections WHERE id=?").run(id)
  }
  facets(archived = false): LibraryFacets {
    const flag = Number(archived)
    const counts = this.store.db
      .query<{ total: number; unassigned: number }, [number]>(
        `SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN COALESCE(o.topic,'')='' THEN 1 ELSE 0 END),0) unassigned
       FROM library_documents l LEFT JOIN library_organization o ON o.document_hash=l.hash WHERE l.archived=?`,
      )
      .get(flag) ?? { total: 0, unassigned: 0 }
    const topics = this.store.db
      .query<{ name: string; count: number }, [number]>(
        `SELECT o.topic name,COUNT(*) count FROM library_organization o JOIN library_documents l ON l.hash=o.document_hash
       WHERE l.archived=? AND o.topic!='' GROUP BY o.topic ORDER BY o.topic COLLATE NOCASE`,
      )
      .all(flag)
    const collections = this.store.db
      .query<LibraryCollection & { count: number }, [number]>(
        `SELECT c.id,c.name,COUNT(l.hash) count FROM library_collections c
       LEFT JOIN library_memberships m ON m.collection_id=c.id
       LEFT JOIN library_documents l ON l.hash=m.document_hash AND l.archived=?
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE,c.id`,
      )
      .all(flag)
    return { ...counts, topics, collections }
  }
  remove(hash: string) {
    this.require(hash)
    this.store.db.transaction(() => {
      this.store.db.query("DELETE FROM documents WHERE hash=?").run(hash)
      this.store.db.query("DELETE FROM library_documents WHERE hash=?").run(hash)
    })()
  }
}
