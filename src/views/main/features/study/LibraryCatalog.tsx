import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { Badge } from "@astryxdesign/core/Badge"
import { Button } from "@astryxdesign/core/Button"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu"
import { IconButton } from "@astryxdesign/core/IconButton"
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl"
import { Selector } from "@astryxdesign/core/Selector"
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Token } from "@astryxdesign/core/Token"
import {
  Archive,
  BookOpen,
  Ellipsis,
  FolderClosed,
  FolderPlus,
  GraduationCap,
  Hash,
  Inbox,
  LayoutGrid,
  Library,
  List,
  Pencil,
  Sparkles,
  Star,
  Tags,
  Trash2,
} from "lucide-react"
import { type ReactNode, useRef, useState } from "react"
import type {
  LibraryDocument,
  LibraryFacets,
  LibraryPage,
  LibraryQuery,
} from "../../../../shared/study/library"

export const EMPTY_FACETS: LibraryFacets = { total: 0, unassigned: 0, topics: [], collections: [] }
const FILTERS = [
  ["all", "전체 자료", Library],
  ["lessons", "수업 있는 자료", GraduationCap],
  ["favorites", "즐겨찾기", Star],
  ["archived", "보관함", Archive],
] as const
const SORTS = [
  { value: "recent", label: "최근 학습순" },
  { value: "added", label: "최근 추가순" },
  { value: "title", label: "제목순" },
] as const
const TOPIC_TONES = ["blue", "green", "purple", "orange", "teal", "pink", "cyan", "yellow"] as const
const date = (value: string) =>
  Date.parse(value) > 0
    ? new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
    : "이전 기록"

/** A stable hue per topic name, so the same topic reads the same everywhere. */
export function topicTone(name: string) {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return TOPIC_TONES[hash % TOPIC_TONES.length]!
}

function TopicBadge({ item }: { item: LibraryDocument }) {
  const pending = item.classification?.state === "running" || item.classification?.state === "queued"
  if (!item.topic)
    return (
      <Badge
        variant="neutral"
        label={pending ? "AI 분류 중" : "미분류"}
        icon={pending ? <Sparkles size={11} /> : undefined}
      />
    )
  return <Badge variant={topicTone(item.topic)} label={item.topic} />
}

function SourceStatus({ item, currentHash }: { item: LibraryDocument; currentHash?: string }) {
  const state = item.documentHash === currentHash ? "reading" : item.sourceAvailable ? "linked" : "missing"
  return (
    <span className="paper-source" data-source={state}>
      {state === "reading" ? "읽는 중" : state === "linked" ? "PDF 연결됨" : "원문 없이 복습"}
    </span>
  )
}

function PaperCard({
  item,
  currentHash,
  onSelect,
}: {
  item: LibraryDocument
  currentHash?: string
  onSelect: (hash: string) => void
}) {
  const checked = item.goalCount ? item.checkedGoalCount / item.goalCount : 0
  return (
    <button className="paper-card" type="button" onClick={() => onSelect(item.documentHash)}>
      <span className="paper-card-top">
        <TopicBadge item={item} />
        {item.favorite && (
          <Star className="paper-favorite" size={14} fill="currentColor" aria-label="즐겨찾기" />
        )}
      </span>
      <span className="paper-title">{item.title}</span>
      <span className="paper-collections">
        {item.collections.length ? item.collections.map((c) => c.name).join(" · ") : " "}
      </span>
      <span className="paper-progress" title={`이해 점검 ${item.checkedGoalCount}/${item.goalCount}`}>
        <span className="paper-progress-track">
          <i style={{ width: `${Math.round(checked * 100)}%` }} />
        </span>
        <span>
          점검 {item.checkedGoalCount}/{item.goalCount}
        </span>
      </span>
      <span className="paper-stats">
        <span>수업 {item.lessonCount}</span>
        <span>목표 {item.goalCount}</span>
        <span>설명 {item.messageCount}</span>
      </span>
      <span className="paper-meta">
        <time>{date(item.updatedAt)}</time>
        <SourceStatus item={item} currentHash={currentHash} />
      </span>
    </button>
  )
}

function PaperRow({
  item,
  currentHash,
  onSelect,
}: {
  item: LibraryDocument
  currentHash?: string
  onSelect: (hash: string) => void
}) {
  return (
    <button className="paper-row" type="button" onClick={() => onSelect(item.documentHash)}>
      <span className="paper-row-title">
        {item.favorite ? (
          <Star className="paper-favorite" size={14} fill="currentColor" aria-label="즐겨찾기" />
        ) : (
          <BookOpen size={14} aria-hidden="true" />
        )}
        <span>{item.title}</span>
      </span>
      <span className="paper-row-topic">
        <TopicBadge item={item} />
      </span>
      <span className="paper-stats">
        <span>수업 {item.lessonCount}</span>
        <span>
          점검 {item.checkedGoalCount}/{item.goalCount}
        </span>
      </span>
      <time>{date(item.updatedAt)}</time>
      <SourceStatus item={item} currentHash={currentHash} />
    </button>
  )
}

function CollectionDialog({
  edit,
  onClose,
  onSave,
}: {
  edit: { id?: string; name: string } | null
  onClose: () => void
  onSave: (name: string, id?: string) => Promise<boolean>
}) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [lastEdit, setLastEdit] = useState(edit)
  if (edit !== lastEdit) {
    setLastEdit(edit)
    setName(edit?.name ?? "")
  }
  const save = async () => {
    if (!edit || saving || !name.trim()) return
    setSaving(true)
    try {
      if (await onSave(name.trim(), edit.id)) onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog isOpen={!!edit} onOpenChange={(open) => !open && onClose()} width={400} purpose="form">
      <DialogHeader
        title={edit?.id ? "컬렉션 이름 바꾸기" : "새 컬렉션"}
        subtitle={edit?.id ? undefined : "연구 주제나 프로젝트별로 논문을 모아 두세요."}
        onOpenChange={(open) => !open && onClose()}
      />
      <div className="dialog-body">
        <TextInput label="컬렉션 이름" value={name} onChange={setName} onEnter={() => void save()} />
      </div>
      <footer className="dialog-footer">
        <span className="dialog-footer-spacer" />
        <Button variant="secondary" label="취소" onClick={onClose} />
        <Button
          variant="primary"
          label="저장"
          isDisabled={!name.trim()}
          isLoading={saving}
          onClick={() => void save()}
        />
      </footer>
    </Dialog>
  )
}

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
  onManageTopics,
  banner,
  emptyAction,
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
  onManageTopics: () => void
  banner?: ReactNode
  emptyAction: ReactNode
}) {
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("pdfie:library-view") === "list" ? "list" : "cards"
    } catch {
      return "cards"
    }
  })
  const [edit, setEdit] = useState<{ id?: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const results = useRef<HTMLDivElement>(null)
  const collection = facets.collections.find((item) => item.id === query.collectionId)
  const filter = query.filter ?? "all"
  const filterName = FILTERS.find(([id]) => id === filter)?.[1] ?? "전체 자료"
  const heading = collection?.name ?? (query.topic === "" ? "미분류" : query.topic) ?? filterName
  const change = (patch: Partial<LibraryQuery>) => {
    onQuery(patch)
    results.current?.scrollTo(0, 0)
  }
  const hasFilter = Boolean(
    query.query || query.topic !== undefined || query.collectionId || filter !== "all",
  )
  const clear = () => change({ query: "", topic: undefined, collectionId: undefined, filter: "all" })

  return (
    <div className="library-browser">
      <SideNav
        className="library-sidenav"
        aria-label="서재 탐색"
        footer={<p className="library-local-note">학습 기록은 이 Mac에만 저장됩니다.</p>}
      >
        <SideNavSection title="서재" isHeaderHidden>
          {FILTERS.map(([id, label, Icon]) => (
            <SideNavItem
              key={id}
              label={label}
              icon={Icon}
              size="sm"
              isSelected={filter === id}
              endContent={id === "all" ? <small>{facets.total}</small> : undefined}
              onClick={() => change({ filter: id })}
            />
          ))}
        </SideNavSection>
        <SideNavSection
          title="주제"
          endContent={
            <IconButton
              variant="ghost"
              size="sm"
              label="주제 정리"
              tooltip="주제 이름 변경·합치기"
              icon={<Tags size={14} />}
              isDisabled={!facets.topics.length}
              onClick={onManageTopics}
            />
          }
        >
          {facets.topics.map((topic) => (
            <SideNavItem
              key={topic.name}
              label={topic.name}
              icon={Hash}
              size="sm"
              isSelected={query.topic === topic.name}
              endContent={<small>{topic.count}</small>}
              onClick={() => change({ topic: query.topic === topic.name ? undefined : topic.name })}
            />
          ))}
          <SideNavItem
            label="미분류"
            icon={Inbox}
            size="sm"
            isSelected={query.topic === ""}
            endContent={<small>{facets.unassigned}</small>}
            onClick={() => change({ topic: query.topic === "" ? undefined : "" })}
          />
        </SideNavSection>
        <SideNavSection
          title="컬렉션"
          endContent={
            <IconButton
              variant="ghost"
              size="sm"
              label="컬렉션 만들기"
              tooltip="컬렉션 만들기"
              icon={<FolderPlus size={14} />}
              onClick={() => setEdit({ name: "" })}
            />
          }
        >
          {facets.collections.map((item) => (
            <SideNavItem
              key={item.id}
              label={item.name}
              icon={FolderClosed}
              size="sm"
              isSelected={query.collectionId === item.id}
              endContent={<small>{item.count}</small>}
              onClick={() => change({ collectionId: query.collectionId === item.id ? undefined : item.id })}
              actions={
                <DropdownMenu
                  alignment="end"
                  menuWidth={180}
                  renderTrigger={(trigger) => (
                    <IconButton
                      {...trigger}
                      variant="ghost"
                      size="sm"
                      label={`${item.name} 컬렉션 메뉴`}
                      icon={<Ellipsis size={14} />}
                    />
                  )}
                >
                  <DropdownMenuItem
                    label="이름 바꾸기"
                    icon={Pencil}
                    onClick={() => setEdit({ id: item.id, name: item.name })}
                  />
                  <DropdownMenuItem
                    label="컬렉션 삭제"
                    icon={Trash2}
                    variant="destructive"
                    onClick={() => setDeleting({ id: item.id, name: item.name })}
                  />
                </DropdownMenu>
              }
            />
          ))}
          {!facets.collections.length && (
            <p className="library-nav-hint">연구 주제나 프로젝트별로 논문을 모아 두세요.</p>
          )}
        </SideNavSection>
      </SideNav>

      <section className="library-discovery" aria-label="서재 자료" ref={results}>
        {banner}
        <header className="library-heading">
          <div>
            <h1>{heading}</h1>
            <p role="status">{loading && !page.items.length ? "자료 확인 중…" : `${page.total}개 자료`}</p>
          </div>
          <div className="library-heading-tools">
            <Selector
              label="정렬"
              isLabelHidden
              size="sm"
              variant="ghost"
              value={query.sort ?? "recent"}
              options={SORTS.map((sort) => ({ ...sort }))}
              onChange={(value) => {
                if (value === "recent" || value === "title" || value === "added") change({ sort: value })
              }}
            />
            <SegmentedControl
              label="보기 방식"
              size="sm"
              value={view}
              onChange={(value) => {
                const next = value === "list" ? "list" : "cards"
                setView(next)
                try {
                  localStorage.setItem("pdfie:library-view", next)
                } catch {
                  /* The view still works without storage. */
                }
              }}
            >
              <SegmentedControlItem
                value="cards"
                label="카드 보기"
                isLabelHidden
                icon={<LayoutGrid size={14} />}
              />
              <SegmentedControlItem value="list" label="목록 보기" isLabelHidden icon={<List size={14} />} />
            </SegmentedControl>
          </div>
        </header>
        {hasFilter && (
          <div className="library-active-filters">
            {query.query && (
              <Token size="sm" label={`검색: ${query.query}`} onRemove={() => change({ query: "" })} />
            )}
            {filter !== "all" && (
              <Token size="sm" label={filterName} onRemove={() => change({ filter: "all" })} />
            )}
            {query.topic !== undefined && (
              <Token
                size="sm"
                label={`주제: ${query.topic || "미분류"}`}
                onRemove={() => change({ topic: undefined })}
              />
            )}
            {collection && (
              <Token
                size="sm"
                label={`컬렉션: ${collection.name}`}
                onRemove={() => change({ collectionId: undefined })}
              />
            )}
            <Button variant="ghost" size="sm" label="필터 초기화" onClick={clear} />
          </div>
        )}
        <div className={`library-results is-${view}`} aria-busy={loading}>
          {page.items.map((item) =>
            view === "cards" ? (
              <PaperCard key={item.documentHash} item={item} currentHash={currentHash} onSelect={onSelect} />
            ) : (
              <PaperRow key={item.documentHash} item={item} currentHash={currentHash} onSelect={onSelect} />
            ),
          )}
        </div>
        {!loading && !page.items.length && (
          <div className="library-browser-empty">
            <span className="library-empty-mark">
              <BookOpen size={22} strokeWidth={1.5} />
            </span>
            <h2>{hasFilter ? "조건에 맞는 자료가 없습니다" : "첫 논문부터, 나의 서재로"}</h2>
            <p>
              {hasFilter
                ? "검색어나 분류를 바꿔 보세요. 컬렉션에는 논문의 ‘분류’에서 자료를 추가할 수 있습니다."
                : "PDF를 열거나 폴더를 가져오면 이곳에 모입니다. 논문별 수업, 목표와 설명도 함께 보관됩니다."}
            </p>
            {hasFilter ? <Button variant="secondary" label="전체 자료 보기" onClick={clear} /> : emptyAction}
          </div>
        )}
        {page.items.length < page.total && (
          <div className="library-load-more">
            <Button
              variant="secondary"
              label={`더 보기 · ${page.items.length}/${page.total}`}
              isLoading={loading}
              onClick={onMore}
            />
          </div>
        )}
      </section>

      <CollectionDialog edit={edit} onClose={() => setEdit(null)} onSave={onCollectionSave} />
      <AlertDialog
        isOpen={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`‘${deleting?.name ?? ""}’ 컬렉션을 삭제할까요?`}
        description="컬렉션만 사라집니다. 논문과 학습 기록은 그대로 유지됩니다."
        actionLabel="컬렉션 삭제"
        cancelLabel="취소"
        isActionLoading={removing}
        onAction={async () => {
          if (!deleting) return
          setRemoving(true)
          try {
            if (await onCollectionDelete(deleting.id)) {
              if (query.collectionId === deleting.id) change({ collectionId: undefined })
              setDeleting(null)
            }
          } finally {
            setRemoving(false)
          }
        }}
      />
    </div>
  )
}
