import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { PdfOutlineNode } from "../../shared/pdf/domain"
import {
  analysisByteLength,
  type EvidenceRef,
  INDEX_VERSION,
  type IndexStatus,
  MAX_PAGE_ANALYSIS_BYTES,
  MAX_PAGE_BLOCKS,
  type PageAnalysis,
  type StudyBlock,
  type StudySection,
  type StudySnapshot,
} from "../../shared/study/contracts"

const normalize = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim()
const hashText = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16)
type Row = { payload: string }
type SectionAnchor = { text: string; pageIndex: number; rect?: StudyBlock["rects"][number] }
type SectionBoundary = { blockId: string; title?: string; hidden?: boolean; anchor?: SectionAnchor }
type SectionEdit = StudySection & { anchor?: SectionAnchor }

export class StudyStore {
  readonly db: Database
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new Database(path, { create: true, strict: true })
    chmodSync(path, 0o600)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS documents(hash TEXT PRIMARY KEY, revision TEXT NOT NULL, page_count INTEGER NOT NULL, outline TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pages(document_hash TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE, page_index INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(document_hash,page_index));
      CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY, document_hash TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE, page_index INTEGER NOT NULL, reading_order INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS blocks_document ON blocks(document_hash,page_index,reading_order);
      CREATE TABLE IF NOT EXISTS entities(document_hash TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE, kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(document_hash,kind,id));
      INSERT OR IGNORE INTO schema_migrations VALUES(1);`)
    // Interrupted work remains reviewable after an unexpected application exit.
    for (const row of this.db
      .query<{ document_hash: string; id: string; payload: string }, []>(
        "SELECT document_hash,id,payload FROM entities WHERE kind='messages'",
      )
      .all()) {
      const message = JSON.parse(row.payload) as StudySnapshot["messages"][number]
      if (message.state === "running")
        this.put(row.document_hash, "messages", row.id, { ...message, state: "interrupted" })
    }
  }
  begin(documentHash: string, pageCount: number, outline: PdfOutlineNode[]): IndexStatus {
    if (
      !Number.isInteger(pageCount) ||
      pageCount < 1 ||
      pageCount > 20000 ||
      JSON.stringify(outline).length > 100000
    )
      throw new Error("문서 분석 범위가 올바르지 않습니다.")
    const revision = `${documentHash}:${INDEX_VERSION}`
    this.db.transaction(() => {
      const previous = this.db
        .query<{ revision: string }, [string]>("SELECT revision FROM documents WHERE hash=?")
        .get(documentHash)
      if (previous && previous.revision !== revision) {
        const oldBlocks = this.blocks(documentHash)
        const anchor = (id: string): SectionAnchor | undefined => {
          const block = oldBlocks.find((item) => item.id === id)
          return block
            ? {
                text: block.rawText,
                pageIndex: block.pageIndex,
                ...(block.rects[0] ? { rect: block.rects[0] } : {}),
              }
            : undefined
        }
        for (const boundary of this.list<SectionBoundary>(documentHash, "sectionBoundaries"))
          this.put(documentHash, "sectionBoundaries", boundary.blockId, {
            ...boundary,
            anchor: boundary.anchor ?? anchor(boundary.blockId),
          })
        for (const edit of this.list<SectionEdit>(documentHash, "sectionEdits"))
          this.put(documentHash, "sectionEdits", edit.id, {
            ...edit,
            anchor: edit.anchor ?? anchor(edit.startBlockId),
          })
        // Rebuild only the derived index. Conversations, goals, lessons and
        // their immutable evidence snapshots remain available after migration.
        this.db.query("DELETE FROM blocks WHERE document_hash=?").run(documentHash)
        this.db.query("DELETE FROM pages WHERE document_hash=?").run(documentHash)
      }
      this.db
        .query(
          "INSERT INTO documents VALUES(?,?,?,?) ON CONFLICT(hash) DO UPDATE SET revision=excluded.revision,outline=excluded.outline,page_count=excluded.page_count",
        )
        .run(documentHash, revision, pageCount, JSON.stringify(outline))
    })()
    return this.index(documentHash)
  }
  index(documentHash: string): IndexStatus {
    const doc = this.db
      .query<{ revision: string; page_count: number }, [string]>(
        "SELECT revision,page_count FROM documents WHERE hash=?",
      )
      .get(documentHash)
    const pages = this.db
      .query<Row, [string]>("SELECT payload FROM pages WHERE document_hash=? ORDER BY page_index")
      .all(documentHash)
      .map((r) => JSON.parse(r.payload) as PageAnalysis)
    return {
      revision: doc?.revision ?? `${documentHash}:${INDEX_VERSION}`,
      pageCount: doc?.page_count ?? 0,
      indexedPages: pages.filter((p) => p.status === "ready").length,
      failedPages: pages.filter((p) => p.status === "failed").map((p) => p.pageIndex + 1),
      failedPageReasons: pages
        .filter((p) => p.status === "failed" && p.error)
        .map((p) => ({
          page: p.pageIndex + 1,
          message: p.error!,
        })),
      ocrPages: pages.filter((p) => p.status === "needs-ocr").map((p) => p.pageIndex + 1),
      blockCount: Number(
        this.db
          .query<{ count: number }, [string]>("SELECT COUNT(*) count FROM blocks WHERE document_hash=?")
          .get(documentHash)?.count ?? 0,
      ),
    }
  }
  completedPages(documentHash: string): number[] {
    return this.db
      .query<{ page_index: number }, [string]>(
        "SELECT page_index FROM pages WHERE document_hash=? AND json_extract(payload,'$.status') IN ('ready','needs-ocr') ORDER BY page_index",
      )
      .all(documentHash)
      .map((p) => p.page_index)
  }
  ingest(documentHash: string, page: PageAnalysis): IndexStatus {
    const index = this.index(documentHash)
    if (
      analysisByteLength(page) > MAX_PAGE_ANALYSIS_BYTES ||
      !Number.isInteger(page.pageIndex) ||
      page.pageIndex < 0 ||
      page.pageIndex >= index.pageCount ||
      ![page.width, page.height].every((n) => Number.isFinite(n) && n > 0 && n < 100000) ||
      !["ready", "failed", "needs-ocr"].includes(page.status) ||
      !Array.isArray(page.blocks) ||
      page.blocks.length > MAX_PAGE_BLOCKS ||
      (page.error !== undefined && (typeof page.error !== "string" || page.error.length > 1000))
    )
      throw new Error("페이지 분석 데이터가 올바르지 않습니다.")
    const blocks: StudyBlock[] = page.blocks.map((block, order) => {
      if (
        typeof block.rawText !== "string" ||
        block.rawText.length > 12000 ||
        !Array.isArray(block.rects) ||
        block.rects.length > 300 ||
        !["heading", "paragraph", "caption", "reference"].includes(block.role) ||
        !["usable", "uncertain"].includes(block.quality)
      )
        throw new Error("문단 분석 데이터가 올바르지 않습니다.")
      for (const rect of block.rects)
        if (
          ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
          rect.x < -2 ||
          rect.y < -2 ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.x + rect.width > page.width + 2 ||
          rect.y + rect.height > page.height + 2
        )
          throw new Error("원문 위치가 페이지 범위를 벗어났습니다.")
      const id = `E-${page.pageIndex + 1}-${order}-${hashText(`${index.revision}:${block.rawText}:${JSON.stringify(block.rects)}`)}`
      return {
        ...block,
        id,
        order,
        pageIndex: page.pageIndex,
        documentHash,
        revision: index.revision,
        normalizedText: normalize(block.rawText),
        sectionId: "",
      }
    })
    this.db.transaction(() => {
      this.db
        .query("DELETE FROM blocks WHERE document_hash=? AND page_index=?")
        .run(documentHash, page.pageIndex)
      for (const block of blocks)
        this.db
          .query("INSERT INTO blocks VALUES(?,?,?,?,?)")
          .run(block.id, documentHash, page.pageIndex, block.order, JSON.stringify(block))
      this.db
        .query("INSERT OR REPLACE INTO pages VALUES(?,?,?)")
        .run(documentHash, page.pageIndex, JSON.stringify({ ...page, blocks: [] }))
    })()
    return this.index(documentHash)
  }
  blocks(documentHash: string): StudyBlock[] {
    return this.db
      .query<Row, [string]>(
        "SELECT payload FROM blocks WHERE document_hash=? ORDER BY page_index,reading_order",
      )
      .all(documentHash)
      .map((r) => JSON.parse(r.payload) as StudyBlock)
  }
  sections(documentHash: string, blocks = this.blocks(documentHash)): StudySection[] {
    const row = this.db
      .query<{ outline: string }, [string]>("SELECT outline FROM documents WHERE hash=?")
      .get(documentHash)
    const outline = row ? (JSON.parse(row.outline) as PdfOutlineNode[]) : []
    const bookmarks: PdfOutlineNode[] = []
    const flatten = (nodes: PdfOutlineNode[]) => {
      for (const node of nodes) {
        if (node.pageNumber) bookmarks.push(node)
        flatten(node.children)
      }
    }
    flatten(outline)
    const sections: StudySection[] = []
    const hasHeadings = blocks.some((block) => block.role === "heading")
    const resolveAnchor = (id: string, anchor?: SectionAnchor) => {
      if (blocks.some((block) => block.id === id)) return id
      if (!anchor) return id
      const anchorRect = anchor.rect
      return (
        blocks.find(
          (block) =>
            block.pageIndex === anchor.pageIndex &&
            block.normalizedText.includes(normalize(anchor.text)) &&
            (!anchorRect ||
              block.rects.some(
                (rect) => Math.abs(rect.x - anchorRect.x) <= 2 && Math.abs(rect.y - anchorRect.y) <= 2,
              )),
        )?.id ?? id
      )
    }
    const edits = this.list<SectionEdit>(documentHash, "sectionEdits")
    const boundaries = this.list<SectionBoundary>(documentHash, "sectionBoundaries").map((boundary) => ({
      ...boundary,
      blockId: resolveAnchor(boundary.blockId, boundary.anchor),
    }))
    let active: StudySection | undefined
    blocks.forEach((block, index) => {
      const bookmark = bookmarks.find((b) => b.pageNumber === block.pageIndex + 1)
      const pageStart = !index || blocks[index - 1]?.pageIndex !== block.pageIndex
      const boundary = boundaries.find((b) => b.blockId === block.id)
      const title =
        boundary?.hidden && index > 0
          ? null
          : (boundary?.title ??
            (block.role === "heading"
              ? block.rawText.replace(/\s+/g, " ").trim()
              : !hasHeadings && pageStart && bookmark
                ? bookmark.title
                : !active
                  ? hasHeadings
                    ? "문서 정보"
                    : `페이지 ${block.pageIndex + 1}부터`
                  : null))
      if (title) {
        active = {
          id: `S-${block.id}`,
          title,
          startBlockId: block.id,
          endBlockId: block.id,
          pageStart: block.pageIndex + 1,
          pageEnd: block.pageIndex + 1,
          source: boundary?.title
            ? "user"
            : block.role === "heading"
              ? "heading"
              : bookmark && !hasHeadings
                ? "bookmark"
                : "page",
          userEdited: !!boundary?.title,
        }
        const edit = edits.find(
          (s) => s.id === active?.id || resolveAnchor(s.startBlockId, s.anchor) === active?.startBlockId,
        )
        if (edit) {
          active.title = edit.title
          active.userEdited = true
          active.source = "user"
        }
        sections.push(active)
      }
      if (active) {
        active.endBlockId = block.id
        active.pageEnd = block.pageIndex + 1
        block.sectionId = active.id
      }
    })
    return sections
  }
  splitSection(documentHash: string, blockId: string, title: string) {
    const blocks = this.blocks(documentHash),
      sections = this.sections(documentHash, blocks)
    const block = blocks.find((b) => b.id === blockId)
    if (!block || !title.trim() || title.length > 300 || sections.some((s) => s.startBlockId === blockId))
      throw new Error("새 섹션의 시작 원문과 제목을 확인하세요.")
    this.put(documentHash, "sectionBoundaries", blockId, { blockId, title: title.trim() })
  }
  mergeSection(documentHash: string, sectionId: string) {
    const sections = this.sections(documentHash),
      index = sections.findIndex((s) => s.id === sectionId)
    if (index <= 0) throw new Error("이전 섹션이 있는 항목을 선택하세요.")
    const current = sections[index]!
    this.put(documentHash, "sectionBoundaries", current.startBlockId, {
      blockId: current.startBlockId,
      hidden: true,
    })
  }
  sectionSplitPoints(documentHash: string, sectionId: string) {
    const blocks = this.blocks(documentHash)
    if (!this.sections(documentHash, blocks).some((s) => s.id === sectionId))
      throw new Error("섹션을 찾지 못했습니다.")
    return blocks
      .filter((b) => b.sectionId === sectionId)
      .slice(1, 151)
      .map((b) => ({
        id: b.id,
        page: b.pageIndex + 1,
        preview: b.rawText.slice(0, 120),
      }))
  }
  list<T>(documentHash: string, kind: string): T[] {
    return this.db
      .query<Row, [string, string]>(
        "SELECT payload FROM entities WHERE document_hash=? AND kind=? ORDER BY rowid",
      )
      .all(documentHash, kind)
      .map((r) => JSON.parse(r.payload) as T)
  }
  put(documentHash: string, kind: string, id: string, value: unknown): void {
    if (JSON.stringify(value).length > 1500000) throw new Error("저장 데이터가 너무 큽니다.")
    this.db
      .query(
        "INSERT INTO entities VALUES(?,?,?,?) ON CONFLICT(document_hash,kind,id) DO UPDATE SET payload=excluded.payload",
      )
      .run(documentHash, kind, id, JSON.stringify(value))
    // Library migration runs at application startup, but standalone stores/tests
    // can still operate without a catalog.
    if (this.db.query("SELECT name FROM sqlite_master WHERE name='library_documents'").get())
      this.db
        .query("UPDATE library_documents SET updated_at=? WHERE hash=?")
        .run(new Date().toISOString(), documentHash)
  }
  remove(documentHash: string, kind: string, id: string): void {
    this.db
      .query("DELETE FROM entities WHERE document_hash=? AND kind=? AND id=?")
      .run(documentHash, kind, id)
  }
  snapshot(documentHash: string): StudySnapshot {
    return {
      documentHash,
      index: this.index(documentHash),
      sections: this.sections(documentHash),
      goals: this.list(documentHash, "goals"),
      messages: this.list(documentHash, "messages"),
      lessons: this.list(documentHash, "lessons"),
      attempts: this.list(documentHash, "attempts"),
      progress: this.list(documentHash, "progress"),
    }
  }
  evidence(block: StudyBlock, sections: StudySection[]): EvidenceRef {
    return {
      id: block.id,
      documentHash: block.documentHash,
      revision: block.revision,
      quote: block.rawText,
      pageIndex: block.pageIndex,
      rects: block.quality === "usable" ? block.rects : [],
      sectionTitle: sections.find((s) => s.id === block.sectionId)?.title ?? "원문",
      precision: block.quality === "usable" && block.rects.length ? "paragraph" : "page-only",
      quality: block.quality,
    }
  }
  clear(documentHash: string): void {
    this.db.query("DELETE FROM entities WHERE document_hash=?").run(documentHash)
  }
  close(): void {
    this.db.close()
  }
}
