import {
  Archive,
  BookOpen,
  Check,
  Folder,
  FolderPlus,
  LayoutGrid,
  List,
  Pencil,
  Search,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react"
import { useRef, useState } from "react"
import type { LibraryFacets, LibraryPage, LibraryQuery } from "../../../../shared/study/library"

export const EMPTY_FACETS: LibraryFacets = { total: 0, unassigned: 0, topics: [], collections: [] }
const FILTERS = [
  ["all", "전체 자료", BookOpen],
  ["lessons", "수업 있는 자료", Check],
  ["favorites", "즐겨찾기", Star],
  ["archived", "보관함", Archive],
] as const
const date = (value: string) =>
  Date.parse(value) > 0
    ? new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
    : "이전 기록"

export function LibraryCatalog({
  page,
  facets,
  loading,
  query,
  onQuery,
  onSelect,
  onMore,
  currentHash,
  onCollectionSave,
  onCollectionDelete,
  onOpenPdf,
  opening,
}: {
  page: LibraryPage
  facets: LibraryFacets
  loading: boolean
  query: LibraryQuery
  onQuery: (patch: Partial<LibraryQuery>) => void
  onSelect: (hash: string) => void
  onMore: () => void
  currentHash?: string
  onCollectionSave: (name: string, id?: string) => Promise<boolean>
  onCollectionDelete: (id: string) => Promise<boolean>
  onOpenPdf: () => void
  opening: boolean
}) {
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("pdfie:library-view") === "list" ? "list" : "cards"
    } catch {
      return "cards"
    }
  })
  const [edit, setEdit] = useState<{ id?: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const results = useRef<HTMLDivElement>(null)
  const collection = facets.collections.find((item) => item.id === query.collectionId)
  const filterName = FILTERS.find(([id]) => id === (query.filter ?? "all"))?.[1] ?? "전체 자료"
  const heading = collection?.name ?? (query.topic === "" ? "미분류" : query.topic) ?? filterName
  const change = (patch: Partial<LibraryQuery>) => {
    onQuery(patch)
    results.current?.scrollTo(0, 0)
  }
  const hasFilter = Boolean(
    query.query || query.topic !== undefined || query.collectionId || query.filter !== "all",
  )
  const clear = () => change({ query: "", topic: undefined, collectionId: undefined, filter: "all" })
  const save = async () => {
    if (!edit || saving) return
    setSaving(true)
    try {
      if (await onCollectionSave(edit.name, edit.id)) setEdit(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="library-browser">
      <aside className="library-navigation" aria-label="서재 탐색">
        <nav className="library-nav-group" aria-label="자료 종류">
          {FILTERS.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              aria-pressed={(query.filter ?? "all") === id}
              onClick={() => {
                change({ filter: id })
                setDeleting(false)
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <nav className="library-nav-group" aria-label="주제">
          <div className="library-nav-heading">
            <Tags size={13} />
            <span>주제</span>
          </div>
          <button
            type="button"
            aria-pressed={query.topic === undefined}
            onClick={() => change({ topic: undefined })}
          >
            <span>모든 주제</span>
            <small>{facets.total}</small>
          </button>
          <button type="button" aria-pressed={query.topic === ""} onClick={() => change({ topic: "" })}>
            <span>미분류</span>
            <small>{facets.unassigned}</small>
          </button>
          {facets.topics.map((topic) => (
            <button
              type="button"
              key={topic.name}
              aria-pressed={query.topic === topic.name}
              onClick={() => change({ topic: topic.name })}
            >
              <span>{topic.name}</span>
              <small>{topic.count}</small>
            </button>
          ))}
        </nav>
        <nav className="library-nav-group" aria-label="컬렉션">
          <div className="library-nav-heading">
            <Folder size={13} />
            <span>컬렉션</span>
            <button
              type="button"
              aria-label="컬렉션 만들기"
              onClick={() => {
                setEdit({ name: "" })
                setDeleting(false)
              }}
            >
              <FolderPlus size={15} />
            </button>
          </div>
          <button
            type="button"
            aria-pressed={!query.collectionId}
            onClick={() => change({ collectionId: undefined })}
          >
            <span>모든 컬렉션</span>
          </button>
          {facets.collections.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={query.collectionId === item.id}
              onClick={() => {
                change({ collectionId: item.id })
                setDeleting(false)
              }}
            >
              <span>{item.name}</span>
              <small>{item.count}</small>
            </button>
          ))}
          {!facets.collections.length && (
            <p className="library-nav-hint">
              연구 주제나 프로젝트별로
              <br />
              논문을 모아 두세요.
            </p>
          )}
          {edit && (
            <form
              className="library-collection-form"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <label htmlFor="collection-name">{edit.id ? "컬렉션 이름 바꾸기" : "새 컬렉션"}</label>
              <input
                id="collection-name"
                maxLength={80}
                value={edit.name}
                onChange={(event) => setEdit({ ...edit, name: event.target.value })}
              />
              <div>
                <button type="submit" disabled={saving || !edit.name.trim()}>
                  {saving ? "저장 중…" : "저장"}
                </button>
                <button type="button" disabled={saving} onClick={() => setEdit(null)}>
                  취소
                </button>
              </div>
            </form>
          )}
        </nav>
        <p className="library-local-note">학습 기록은 이 Mac에 저장됩니다.</p>
      </aside>
      <section className="library-discovery" aria-label="서재 자료">
        <header className="library-discovery-heading">
          <div>
            <p className="library-overline">나의 연구와 배움</p>
            <h1>{heading}</h1>
            <p>논문을 찾아 읽고, 쌓아 둔 학습을 이어 가세요.</p>
          </div>
          {collection && (
            <div className="library-collection-actions">
              <button
                type="button"
                aria-label="컬렉션 이름 바꾸기"
                onClick={() => {
                  setEdit({ id: collection.id, name: collection.name })
                  setDeleting(false)
                }}
              >
                <Pencil size={15} />
              </button>
              <button type="button" aria-label="컬렉션 삭제" onClick={() => setDeleting(true)}>
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </header>
        {deleting && collection && (
          <div className="library-collection-confirm">
            <p>‘{collection.name}’ 컬렉션을 삭제할까요? 논문과 학습 기록은 유지됩니다.</p>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  if (await onCollectionDelete(collection.id)) {
                    setDeleting(false)
                    change({ collectionId: undefined })
                  }
                } finally {
                  setSaving(false)
                }
              }}
            >
              컬렉션 삭제
            </button>
            <button type="button" disabled={saving} onClick={() => setDeleting(false)}>
              취소
            </button>
          </div>
        )}
        <div className="library-discovery-toolbar">
          <div className="library-search">
            <Search size={17} />
            <input
              aria-label="서재 검색"
              placeholder="제목, 주제, 학습 내용 검색"
              value={query.query ?? ""}
              onChange={(event) => change({ query: event.target.value })}
            />
            {query.query && (
              <button type="button" aria-label="검색 지우기" onClick={() => change({ query: "" })}>
                <X size={14} />
              </button>
            )}
          </div>
          <select
            aria-label="자료 정렬"
            value={query.sort ?? "recent"}
            onChange={(event) => {
              const value = event.target.value
              if (value === "recent" || value === "title" || value === "added") change({ sort: value })
            }}
          >
            <option value="recent">최근 학습순</option>
            <option value="added">최근 추가순</option>
            <option value="title">제목순</option>
          </select>
          <fieldset className="library-view-switch" aria-label="보기 방식">
            {(
              [
                ["cards", "카드 보기", LayoutGrid],
                ["list", "목록 보기", List],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                type="button"
                key={id}
                aria-label={label}
                aria-pressed={view === id}
                onClick={() => {
                  setView(id)
                  try {
                    localStorage.setItem("pdfie:library-view", id)
                  } catch {
                    /* View still works without storage. */
                  }
                }}
              >
                <Icon size={17} />
              </button>
            ))}
          </fieldset>
        </div>
        <div className="library-results-heading">
          <span role="status">{loading ? "자료 확인 중…" : `${page.total}개 자료`}</span>
          {hasFilter && (
            <button type="button" onClick={clear}>
              필터 초기화 <X size={12} />
            </button>
          )}
          {query.topic !== undefined && (
            <span className="library-active-scope">주제: {query.topic || "미분류"}</span>
          )}
          {collection && <span className="library-active-scope">컬렉션: {collection.name}</span>}
        </div>
        <div className="library-results" ref={results} aria-busy={loading}>
          <div className={`library-paper-${view}`}>
            {page.items.map((item) => (
              <button
                className="library-paper"
                type="button"
                key={item.documentHash}
                onClick={() => onSelect(item.documentHash)}
              >
                <span className="library-paper-top">
                  <span>
                    {item.topic ||
                      (item.classification?.state === "running" || item.classification?.state === "queued"
                        ? "AI 분류 중…"
                        : "미분류")}
                  </span>
                  {item.favorite ? (
                    <Star size={15} fill="currentColor" aria-label="즐겨찾기" />
                  ) : (
                    <BookOpen size={17} />
                  )}
                </span>
                <span className="library-paper-title">{item.title}</span>
                <span className="library-paper-collections">
                  {item.collections.map((c) => c.name).join(" · ") || "컬렉션 미지정"}
                </span>
                <span className="library-paper-counts">
                  수업 {item.lessonCount} <span>목표 {item.goalCount}</span>{" "}
                  <span>설명 {item.messageCount}</span>
                </span>
                {item.lessonCount > 0 && (
                  <span className="library-paper-progress">
                    마친 수업 {item.completedLessonCount}/{item.lessonCount} · 이해 점검{" "}
                    {item.checkedGoalCount}/{item.goalCount}
                  </span>
                )}
                <span className="library-paper-meta">
                  <time>{date(item.updatedAt)}</time>
                  <span
                    data-source={
                      item.documentHash === currentHash
                        ? "reading"
                        : item.sourceAvailable
                          ? "linked"
                          : "missing"
                    }
                  >
                    {item.documentHash === currentHash
                      ? "읽는 중"
                      : item.sourceAvailable
                        ? "PDF 연결됨"
                        : "원문 없이 복습 가능"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {!loading && !page.items.length && (
            <div className="library-browser-empty">
              <BookOpen size={32} strokeWidth={1.25} />
              <h2>{hasFilter ? "조건에 맞는 자료가 없습니다" : "첫 논문부터, 나의 서재로"}</h2>
              <p>
                {hasFilter
                  ? "검색어나 분류를 바꿔 보세요. 컬렉션에는 논문의 ‘분류’에서 자료를 추가할 수 있습니다."
                  : "PDF를 열면 이곳에 모입니다. 논문별 수업, 목표와 설명도 함께 보관됩니다."}
              </p>
              {hasFilter ? (
                <button type="button" onClick={clear}>
                  전체 자료 보기
                </button>
              ) : (
                <button type="button" className="library-primary" disabled={opening} onClick={onOpenPdf}>
                  PDF 열기
                </button>
              )}
            </div>
          )}
          {page.items.length < page.total && (
            <button className="library-load-more" type="button" disabled={loading} onClick={onMore}>
              {loading ? "불러오는 중…" : `더 보기 · ${page.items.length}/${page.total}`}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
