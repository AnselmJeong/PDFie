import { createHash, randomUUID } from "node:crypto"
import type { TopicChangePreview } from "../../shared/study/library"
import type { StudyStore } from "./study-store"

type Rule = { name: string; canonical: string }
export class LibraryTaxonomy {
  constructor(private store: StudyStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS library_topic_rules(name TEXT PRIMARY KEY COLLATE NOCASE,canonical TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library_taxonomy(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO library_taxonomy VALUES(1,1);
      INSERT OR IGNORE INTO library_topic_rules SELECT DISTINCT topic,topic FROM library_organization WHERE topic!='';
      CREATE TABLE IF NOT EXISTS library_topic_history(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,source TEXT NOT NULL,target TEXT NOT NULL,before_json TEXT NOT NULL,after_token TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations VALUES(5);`)
  }
  private label(value: string) {
    if (typeof value !== "string") throw new Error("주제 이름을 입력하세요.")
    const name = value.normalize("NFC").replace(/\s+/g, " ").trim()
    if (!name || name.length > 80) throw new Error("주제를 1~80자로 입력하세요.")
    return name
  }
  snapshot() {
    return {
      revision:
        this.store.db
          .query<{ revision: number }, []>("SELECT revision FROM library_taxonomy WHERE id=1")
          .get()?.revision ?? 1,
      topics: this.store.db
        .query<{ name: string }, []>(
          "SELECT DISTINCT canonical name FROM library_topic_rules ORDER BY canonical COLLATE NOCASE",
        )
        .all()
        .map((r) => r.name),
    }
  }
  resolve(name: string) {
    const label = this.label(name)
    return (
      this.store.db
        .query<Rule, [string]>("SELECT * FROM library_topic_rules WHERE name=? COLLATE NOCASE")
        .get(label)?.canonical ?? label
    )
  }
  ensure(name: string) {
    const canonical = this.resolve(name)
    const result = this.store.db
      .query("INSERT OR IGNORE INTO library_topic_rules VALUES(?,?)")
      .run(canonical, canonical)
    if (result.changes) this.store.db.exec("UPDATE library_taxonomy SET revision=revision+1 WHERE id=1")
    return canonical
  }
  private fingerprint() {
    const rows = this.store.db
      .query(
        "SELECT o.document_hash,o.topic,c.token FROM library_organization o LEFT JOIN library_classification c ON c.document_hash=o.document_hash ORDER BY o.document_hash",
      )
      .all()
    return createHash("sha256")
      .update(JSON.stringify({ rows, revision: this.snapshot().revision }))
      .digest("hex")
  }
  preview(source: string, target: string): TopicChangePreview {
    const from = this.resolve(source),
      to = this.resolve(target)
    if (from === to) throw new Error("다른 주제 이름을 입력하세요.")
    const count = this.store.db
      .query<{ count: number; manual: number }, [string]>(
        `SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN json_extract(c.payload,'$.state')='manual' THEN 1 ELSE 0 END),0) manual FROM library_organization o LEFT JOIN library_classification c ON c.document_hash=o.document_hash WHERE o.topic=?`,
      )
      .get(from)
    if (!count?.count) throw new Error("변경할 자료가 없습니다. 주제 목록을 새로고침하세요.")
    return {
      source: from,
      target: to,
      count: count.count,
      manualCount: count.manual,
      merge: this.snapshot().topics.includes(to),
      token: this.fingerprint(),
    }
  }
  apply(source: string, target: string, token: string) {
    return this.store.db.transaction(() => {
      const preview = this.preview(source, target)
      if (preview.token !== token)
        throw new Error("미리보기 이후 분류가 변경됐습니다. 변경 범위를 다시 확인하세요.")
      const rules = this.store.db.query<Rule, []>("SELECT * FROM library_topic_rules").all()
      const assignments = this.store.db
        .query<{ document_hash: string; topic: string; payload: string | null }, [string]>(
          "SELECT o.*,c.payload FROM library_organization o LEFT JOIN library_classification c ON c.document_hash=o.document_hash WHERE o.topic=?",
        )
        .all(preview.source)
      this.ensure(preview.target)
      this.store.db
        .query("UPDATE library_topic_rules SET canonical=? WHERE canonical=?")
        .run(preview.target, preview.source)
      this.store.db
        .query("UPDATE library_organization SET topic=? WHERE topic=?")
        .run(preview.target, preview.source)
      for (const row of assignments)
        this.store.db
          .query("UPDATE library_classification SET token=? WHERE document_hash=?")
          .run(randomUUID(), row.document_hash)
      this.store.db.exec("UPDATE library_taxonomy SET revision=revision+1 WHERE id=1")
      this.store.db
        .query("INSERT INTO library_topic_history VALUES(?,?,?,?,?,?)")
        .run(
          randomUUID(),
          new Date().toISOString(),
          preview.source,
          preview.target,
          JSON.stringify({ rules, assignments }),
          this.fingerprint(),
        )
      return preview
    })()
  }
  undo() {
    return this.store.db.transaction(() => {
      const row = this.store.db
        .query<{ id: string; before_json: string; after_token: string }, []>(
          "SELECT * FROM library_topic_history ORDER BY rowid DESC LIMIT 1",
        )
        .get()
      if (!row || row.after_token !== this.fingerprint())
        throw new Error("이후 분류가 변경되어 바로 되돌릴 수 없습니다. 자료별로 주제를 수정하세요.")
      const before = JSON.parse(row.before_json) as {
        rules: Rule[]
        assignments: { document_hash: string; topic: string; payload: string | null }[]
      }
      this.store.db.exec("DELETE FROM library_topic_rules")
      for (const rule of before.rules)
        this.store.db.query("INSERT INTO library_topic_rules VALUES(?,?)").run(rule.name, rule.canonical)
      for (const item of before.assignments) {
        this.store.db
          .query("UPDATE library_organization SET topic=? WHERE document_hash=?")
          .run(item.topic, item.document_hash)
        if (item.payload)
          this.store.db
            .query("UPDATE library_classification SET token=?,payload=? WHERE document_hash=?")
            .run(randomUUID(), item.payload, item.document_hash)
      }
      this.store.db.exec("UPDATE library_taxonomy SET revision=revision+1 WHERE id=1")
      this.store.db.query("DELETE FROM library_topic_history WHERE id=?").run(row.id)
    })()
  }
}
