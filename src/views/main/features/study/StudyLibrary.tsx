import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { Button } from "@astryxdesign/core/Button"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Kbd } from "@astryxdesign/core/Kbd"
import { Tab, TabList } from "@astryxdesign/core/TabList"
import { TextInput } from "@astryxdesign/core/TextInput"
import { useToast } from "@astryxdesign/core/Toast"
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpen,
  Download,
  Ellipsis,
  Files,
  FileText,
  FolderInput,
  FolderOpen,
  Link2,
  Pencil,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { PdfOpenResult } from "../../../../shared/pdf/domain"
import type { CaptureAsset, EvidenceRef, StudyMessage } from "../../../../shared/study/contracts"
import { actionAnswers, conversationMessages } from "../../../../shared/study/conversation"
import type {
  LibraryDetail,
  LibraryFacets,
  LibraryPage,
  LibraryPatch,
  LibraryQuery,
} from "../../../../shared/study/library"
import { rpc } from "../../rpc"
import { DRAG, NO_DRAG } from "../../window-chrome"
import { AnswerBlocks } from "./AnswerBlocks"
import { CitationChip } from "./CitationChip"
import { LessonPlayer } from "./LessonPlayer"
import { EMPTY_FACETS, LibraryCatalog, topicTone } from "./LibraryCatalog"
import { LibraryImportBanner, useLibraryImport } from "./LibraryIntake"
import { LibraryOrganization } from "./LibraryOrganization"
import { TopicCleanupDialog } from "./LibraryTopics"

const date = (value: string) =>
  Date.parse(value) > 0
    ? new Date(value).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", year: "numeric" })
    : "이전 기록"

function StoredMessage({
  message,
  hash,
  onReveal,
  onError,
}: {
  message: StudyMessage
  hash: string
  onReveal: (ref: EvidenceRef) => void
  onError: (message: string) => void
}) {
  const [capture, setCapture] = useState<CaptureAsset | null>(null)
  const [loading, setLoading] = useState(false)
  return (
    <article className={`library-message is-${message.role}`}>
      <header>
        <strong>{message.role === "user" ? "내 질문" : message.task === "summary" ? "요약" : "설명"}</strong>
        <time>{date(message.createdAt)}</time>
      </header>
      {message.blocks.length ? (
        <AnswerBlocks blocks={message.blocks} evidence={message.evidence} onReveal={onReveal} />
      ) : (
        <p>{message.text || message.error || "완료된 응답이 없습니다."}</p>
      )}
      {message.state !== "completed" && (
        <p className="study-muted">
          {message.state === "running" ? "생성 중" : "완료되지 않은 기록"}
          {message.error ? ` · ${message.error}` : ""}
        </p>
      )}
      {message.draftText && message.state !== "completed" && (
        <details>
          <summary>미완성 응답 · 근거 검증 전</summary>
          <pre>{message.draftText}</pre>
        </details>
      )}
      {message.captureId && !capture && (
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            if (!message.captureId) return
            setLoading(true)
            void rpc.request["library.capture"]({ documentHash: hash, captureId: message.captureId })
              .then((value) => {
                if (value) setCapture(value)
                else onError("저장된 캡처를 찾지 못했습니다.")
              })
              .catch((cause: unknown) =>
                onError(cause instanceof Error ? cause.message : "캡처를 열지 못했습니다."),
              )
              .finally(() => setLoading(false))
          }}
        >
          {loading ? "불러오는 중…" : "질문에 사용한 그림·표 보기"}
        </button>
      )}
      {capture && (
        <figure className="library-capture">
          <img src={capture.dataUrl} alt={`질문에 사용한 PDF ${capture.pageIndex + 1}페이지의 캡처`} />
          <figcaption>저장된 캡처 · p. {capture.pageIndex + 1}</figcaption>
        </figure>
      )}
      {message.role === "assistant" && (
        <footer>
          {message.coverage}
          <span>
            {message.provider} · {message.model}
          </span>
        </footer>
      )}
    </article>
  )
}

export function StudyLibrary({
  onOpenPdf,
  onOpenResult,
  onReturn,
  onDeleted,
  opening,
  currentHash,
}: {
  onOpenPdf: () => void
  onOpenResult: (result: PdfOpenResult, evidence?: EvidenceRef) => Promise<void>
  onReturn?: () => void
  onDeleted: (hash: string) => void
  opening: boolean
  currentHash?: string
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<NonNullable<LibraryQuery["filter"]>>("all")
  const [sort, setSort] = useState<NonNullable<LibraryQuery["sort"]>>("recent")
  const [topic, setTopic] = useState<string | undefined>()
  const [collectionId, setCollectionId] = useState<string | undefined>()
  const [facets, setFacets] = useState<LibraryFacets>(EMPTY_FACETS)
  const [page, setPage] = useState<LibraryPage>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<LibraryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tab, setTab] = useState<"lessons" | "goals" | "notes">("lessons")
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<EvidenceRef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
  const [topicsOpen, setTopicsOpen] = useState(false)
  const intake = useLibraryImport()
  const toast = useToast()
  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const pageRef = useRef(page)
  pageRef.current = page
  const detailScroll = useRef<HTMLDivElement>(null)
  const evidencePanel = useRef<HTMLElement>(null)
  const report = useCallback(
    (cause: unknown) => setError(cause instanceof Error ? cause.message : "학습 자료를 불러오지 못했습니다."),
    [],
  )
  // Feedback surfaces as toasts; an error offers to reload the current view.
  const refreshRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (!error) return
    toast({
      body: error,
      type: "error",
      uniqueID: `library-error:${error}`,
      endContent: <Button size="sm" variant="ghost" label="다시 확인" onClick={() => refreshRef.current()} />,
    })
    setError(null)
  }, [error, toast])
  useEffect(() => {
    if (!notice) return
    toast({ body: notice, uniqueID: `library-notice:${notice}` })
    setNotice("")
  }, [notice, toast])
  const loadList = useCallback(
    async (more = false) => {
      const sequence = ++listSequence.current
      setLoading(true)
      try {
        const [next, nextFacets] = await Promise.all([
          rpc.request["library.list"]({
            query,
            filter,
            sort,
            topic,
            collectionId,
            offset: more ? pageRef.current.items.length : 0,
          }),
          rpc.request["library.facets"]({ archived: filter === "archived" }),
        ])
        if (sequence !== listSequence.current) return
        setFacets(nextFacets)
        setPage((previous) => ({ ...next, items: more ? [...previous.items, ...next.items] : next.items }))
      } catch (cause) {
        if (sequence === listSequence.current) report(cause)
      } finally {
        if (sequence === listSequence.current) setLoading(false)
      }
    },
    [query, filter, sort, topic, collectionId, report],
  )
  const loadDetail = useCallback(
    async (hash: string, fresh = false) => {
      const sequence = ++detailSequence.current
      if (fresh) {
        setDetail(null)
        setDetailLoading(true)
      }
      try {
        const value = await rpc.request["library.detail"]({ documentHash: hash })
        if (sequence !== detailSequence.current || selectedRef.current !== hash) return
        setDetail(value)
        if (fresh) {
          setTab(value.snapshot.lessons.length ? "lessons" : value.snapshot.goals.length ? "goals" : "notes")
          setLessonId(value.snapshot.lessons.at(-1)?.id ?? null)
        }
      } catch (cause) {
        if (sequence === detailSequence.current && selectedRef.current === hash) report(cause)
      } finally {
        if (sequence === detailSequence.current) setDetailLoading(false)
      }
    },
    [report],
  )
  // Query changes invalidate in-flight responses immediately; debounce only the new request.
  useEffect(() => {
    listSequence.current += 1
    setLoading(true)
    setPage({ items: [], total: 0 })
    const timer = window.setTimeout(() => void loadList(), 180)
    return () => {
      window.clearTimeout(timer)
      listSequence.current += 1
    }
  }, [loadList])
  useEffect(() => {
    if (!selected) {
      setDetail(null)
      detailSequence.current += 1
      return
    }
    setEvidence(null)
    setConfirmDelete(false)
    setRename(null)
    setError(null)
    setNotice("")
    detailScroll.current?.scrollTo(0, 0)
    void loadDetail(selected, true)
  }, [selected, loadDetail])
  useEffect(() => {
    const changed = (event: Event) => {
      const value = (event as CustomEvent<{ documentHash: string; phase?: string }>).detail
      if (value.phase && !["completed", "stopped", "failed"].includes(value.phase)) return
      void loadList()
      if (selectedRef.current && (!value.documentHash || value.documentHash === selectedRef.current))
        void loadDetail(selectedRef.current)
    }
    window.addEventListener("pdfie:records-changed", changed)
    window.addEventListener("pdfie:study-event", changed)
    return () => {
      window.removeEventListener("pdfie:records-changed", changed)
      window.removeEventListener("pdfie:study-event", changed)
    }
  }, [loadList, loadDetail])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || confirmDelete || rename !== null) return
      if (evidence) setEvidence(null)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [confirmDelete, rename, evidence])
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      await action()
    } catch (cause) {
      report(cause)
    } finally {
      setBusy(false)
    }
  }
  const refresh = () => {
    if (selected) void loadDetail(selected)
    void loadList()
  }
  refreshRef.current = refresh
  const update = (patch: LibraryPatch) =>
    void run(async () => {
      if (!selected) return
      await rpc.request["library.update"]({ documentHash: selected, ...patch })
      refresh()
    })
  const openOriginal = (ref?: EvidenceRef, relink = false) =>
    void run(async () => {
      if (!selected) return
      const result = await rpc.request["library.openPdf"]({ documentHash: selected, relink })
      if (result) await onOpenResult(result, ref)
    })
  const reveal = (ref: EvidenceRef) => {
    setEvidence(ref)
    window.requestAnimationFrame(() =>
      evidencePanel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    )
  }
  const doc = detail?.document
  const snapshot = detail?.snapshot
  const lesson = snapshot?.lessons.find((item) => item.id === lessonId) ?? snapshot?.lessons.at(-1)
  const explanations = snapshot ? actionAnswers(snapshot.messages) : []
  const conversations = snapshot ? conversationMessages(snapshot.messages) : []

  return (
    <main className="study-library">
      <header className={`library-titlebar ${DRAG}`}>
        <div className="library-titlebar-leading">
          {selected ? (
            <Button
              className={NO_DRAG}
              variant="ghost"
              label="서재"
              tooltip="서재로 돌아가기"
              icon={<ArrowLeft size={16} />}
              onClick={() => setSelected(null)}
            />
          ) : (
            <span className="library-brand">
              <span className="library-brand-mark" aria-hidden="true">
                <BookOpen size={15} />
              </span>
              학습 서재
            </span>
          )}
        </div>
        <div className={`library-titlebar-search ${NO_DRAG}`}>
          <TextInput
            type="search"
            label="서재 검색"
            isLabelHidden
            size="sm"
            startIcon={Search}
            placeholder="제목, 주제, 학습 내용 검색"
            value={query}
            onChange={(value) => {
              setQuery(value)
              if (selected) setSelected(null)
            }}
          />
        </div>
        <div className={`library-titlebar-trailing ${NO_DRAG}`}>
          {onReturn && (
            <Button
              variant="ghost"
              label="읽던 PDF"
              tooltip="읽던 PDF로 돌아가기"
              icon={<FileText size={15} />}
              onClick={onReturn}
            />
          )}
          <DropdownMenu
            alignment="end"
            menuWidth={248}
            button={{
              label: "추가",
              variant: "primary",
              size: "md",
              icon: <Plus size={15} />,
              isLoading: opening || intake.choosing,
            }}
          >
            <DropdownMenuItem
              label="PDF 열기"
              description="한 편을 열어 바로 읽기"
              icon={FolderOpen}
              endContent={<Kbd keys="mod+o" />}
              isDisabled={opening}
              onClick={onOpenPdf}
            />
            <DropdownMenuDivider />
            <DropdownMenuItem
              label="PDF 여러 개 가져오기…"
              description="중복은 제외하고 본문 분석 후 자동 분류"
              icon={Files}
              isDisabled={intake.active}
              onClick={() => void intake.choose("files")}
            />
            <DropdownMenuItem
              label="폴더 가져오기…"
              description="하위 폴더까지 찾아서 추가"
              icon={FolderInput}
              isDisabled={intake.active}
              onClick={() => void intake.choose("folder")}
            />
          </DropdownMenu>
          <IconButton
            variant="ghost"
            label="설정"
            tooltip="설정 (⌘,)"
            icon={<Settings2 size={17} />}
            onClick={() => void rpc.request["app.settings.open"]({}).catch(report)}
          />
        </div>
      </header>
      <div className="library-workspace">
        <div className="library-browse-surface" hidden={Boolean(selected)}>
          <LibraryCatalog
            page={page}
            facets={facets}
            loading={loading}
            query={{ query, filter, sort, topic, collectionId }}
            onQuery={(patch) => {
              if (patch.query !== undefined) setQuery(patch.query)
              if (patch.filter !== undefined) setFilter(patch.filter)
              if (patch.sort !== undefined) setSort(patch.sort)
              if ("topic" in patch) setTopic(patch.topic)
              if ("collectionId" in patch) setCollectionId(patch.collectionId)
            }}
            onSelect={setSelected}
            onMore={() => void loadList(true)}
            currentHash={currentHash}
            onManageTopics={() => setTopicsOpen(true)}
            banner={<LibraryImportBanner intake={intake} />}
            emptyAction={
              <div className="library-empty-actions">
                <Button
                  variant="primary"
                  label="PDF 열기"
                  icon={<FolderOpen size={15} />}
                  isLoading={opening}
                  onClick={onOpenPdf}
                />
                <Button
                  variant="secondary"
                  label="폴더 가져오기"
                  icon={<FolderInput size={15} />}
                  isDisabled={intake.active}
                  onClick={() => void intake.choose("folder")}
                />
              </div>
            }
            onCollectionSave={async (name, id) => {
              try {
                await rpc.request["library.collection.save"]({ name, id })
                await loadList()
                return true
              } catch (cause) {
                report(cause)
                return false
              }
            }}
            onCollectionDelete={async (id) => {
              try {
                await rpc.request["library.collection.delete"]({ id })
                await loadList()
                return true
              } catch (cause) {
                report(cause)
                return false
              }
            }}
          />
        </div>
        <section
          className="library-detail"
          hidden={!selected}
          aria-label="선택한 학습 자료"
          aria-busy={detailLoading}
        >
          {detailLoading ? (
            <p className="library-loading" role="status">
              학습 내용 불러오는 중…
            </p>
          ) : !doc || !snapshot ? (
            <div className="library-browser-empty">
              <h2>학습 자료를 찾지 못했습니다</h2>
              <p>목록으로 돌아가 다시 선택해 주세요.</p>
              <Button variant="secondary" label="서재로 돌아가기" onClick={() => setSelected(null)} />
            </div>
          ) : (
            <>
              <header className="library-detail-header">
                <div className="library-detail-kicker">
                  {doc.topic && <span data-tone={topicTone(doc.topic)}>{doc.topic}</span>}
                  {doc.archived && <span>보관함</span>}
                  <span>
                    {doc.pageCount ? `${doc.pageCount}쪽 · ` : ""}최근 학습 {date(doc.updatedAt)}
                  </span>
                </div>
                <h1>{doc.title}</h1>
                {doc.fileName && doc.title !== doc.fileName.replace(/\.pdf$/i, "") && (
                  <p className="library-filename">{doc.fileName}</p>
                )}
                <div className="library-detail-actions">
                  <Button
                    variant="primary"
                    label={doc.sourceAvailable ? "원문 PDF 열기" : "원문 PDF 연결…"}
                    icon={<FileText size={15} />}
                    isDisabled={busy}
                    onClick={() => openOriginal()}
                  />
                  <Button
                    variant="secondary"
                    label={doc.favorite ? "즐겨찾기됨" : "즐겨찾기"}
                    icon={<Star size={15} fill={doc.favorite ? "currentColor" : "none"} />}
                    aria-pressed={doc.favorite}
                    isDisabled={busy}
                    onClick={() => update({ favorite: !doc.favorite })}
                  />
                  <Button
                    variant="secondary"
                    label="내보내기"
                    tooltip="수업·대화·근거·점검 결과를 Markdown으로"
                    icon={<Download size={15} />}
                    isDisabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await rpc.request["library.export"]({ documentHash: doc.documentHash })
                        if (result.saved)
                          setNotice(
                            "학습 기록을 Markdown으로 내보냈습니다. 대화·근거·점검 결과가 포함됩니다.",
                          )
                      })
                    }
                  />
                  <DropdownMenu
                    alignment="end"
                    menuWidth={220}
                    renderTrigger={(trigger) => (
                      <IconButton
                        {...trigger}
                        variant="secondary"
                        label="자료 관리"
                        tooltip="자료 관리"
                        icon={<Ellipsis size={16} />}
                      />
                    )}
                  >
                    <DropdownMenuItem
                      label="제목 바꾸기"
                      icon={Pencil}
                      onClick={() => setRename(doc.title)}
                    />
                    <DropdownMenuItem
                      label={doc.archived ? "보관함에서 꺼내기" : "보관함으로 옮기기"}
                      icon={doc.archived ? ArchiveRestore : Archive}
                      onClick={() => update({ archived: !doc.archived })}
                    />
                    <DropdownMenuItem
                      label="원문 다시 연결…"
                      icon={Link2}
                      onClick={() => openOriginal(undefined, true)}
                    />
                    <DropdownMenuDivider />
                    <DropdownMenuItem
                      label="자료 삭제…"
                      icon={Trash2}
                      variant="destructive"
                      onClick={() => setConfirmDelete(true)}
                    />
                  </DropdownMenu>
                </div>
                <p className="library-offline-note">
                  {doc.sourceAvailable
                    ? "저장된 수업은 AI 연결 없이 복습할 수 있습니다."
                    : "원문 PDF가 없어도 수업·대화·근거 발췌를 복습할 수 있습니다."}
                </p>
                <Dialog
                  isOpen={rename !== null}
                  onOpenChange={(open) => !open && setRename(null)}
                  width={460}
                  purpose="form"
                >
                  <DialogHeader title="제목 바꾸기" onOpenChange={(open) => !open && setRename(null)} />
                  <div className="dialog-body">
                    <TextInput
                      label="학습 자료 제목"
                      value={rename ?? ""}
                      onChange={(value) => setRename(value.slice(0, 500))}
                      onEnter={() => {
                        if (!rename?.trim()) return
                        update({ title: rename })
                        setRename(null)
                      }}
                    />
                  </div>
                  <footer className="dialog-footer">
                    <span className="dialog-footer-spacer" />
                    <Button variant="secondary" label="취소" onClick={() => setRename(null)} />
                    <Button
                      variant="primary"
                      label="저장"
                      isDisabled={busy || !rename?.trim()}
                      onClick={() => {
                        update({ title: rename ?? "" })
                        setRename(null)
                      }}
                    />
                  </footer>
                </Dialog>
                <AlertDialog
                  isOpen={confirmDelete}
                  onOpenChange={setConfirmDelete}
                  title={`‘${doc.title}’의 학습 자료를 삭제할까요?`}
                  description="수업, 대화, 목표, 점검 결과와 저장된 캡처가 삭제됩니다. 원본 PDF와 PDF 주석은 유지됩니다. 삭제 전 내보내기로 기록을 남길 수 있습니다."
                  actionLabel="학습 자료 삭제"
                  cancelLabel="취소"
                  isActionLoading={busy}
                  onAction={() =>
                    void run(async () => {
                      await rpc.request["library.delete"]({ documentHash: doc.documentHash })
                      setSelected(null)
                      setDetail(null)
                      setConfirmDelete(false)
                      onDeleted(doc.documentHash)
                      setNotice("학습 자료를 삭제했습니다.")
                      void loadList()
                    })
                  }
                />
              </header>
              <LibraryOrganization
                key={doc.documentHash}
                document={doc}
                facets={facets}
                onSaved={refresh}
                onError={setError}
              />
              <TabList
                role="tablist"
                className="library-content-tabs"
                aria-label="저장된 학습 내용"
                hasDivider
                value={tab}
                onChange={(value) => {
                  setTab(value as typeof tab)
                  setEvidence(null)
                }}
              >
                <Tab
                  value="lessons"
                  label={`수업 ${snapshot.lessons.length}`}
                  panelId="library-detail-panel"
                />
                <Tab
                  value="goals"
                  label={`학습 목표 ${snapshot.goals.length}`}
                  panelId="library-detail-panel"
                />
                <Tab
                  value="notes"
                  label={`요약·설명·대화 ${explanations.length + conversations.length}`}
                  panelId="library-detail-panel"
                />
              </TabList>
              <div
                className="library-detail-scroll"
                id="library-detail-panel"
                role="tabpanel"
                ref={detailScroll}
              >
                {tab === "lessons" &&
                  (snapshot.lessons.length ? (
                    <>
                      <div className="library-lessons">
                        <h2>저장된 수업</h2>
                        {snapshot.lessons.map((item) => {
                          const progress = snapshot.progress.find((p) => p.lessonId === item.id)
                          return (
                            <button
                              className="library-lesson-row"
                              type="button"
                              key={item.id}
                              aria-pressed={lesson?.id === item.id}
                              onClick={() => {
                                setLessonId(item.id)
                                setEvidence(null)
                              }}
                            >
                              <span>
                                <strong>{item.title}</strong>
                                <small>
                                  {item.steps.length}단계 · {date(item.createdAt)}
                                </small>
                              </span>
                              <span>
                                {progress?.completedAt
                                  ? "수업 마침 · 다시 보기"
                                  : progress
                                    ? `${progress.stepIndex + 1}단계에서 이어 하기`
                                    : "수업 시작"}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {lesson && (
                        <LessonPlayer
                          key={`${doc.documentHash}-${lesson.id}`}
                          lesson={lesson}
                          snapshot={snapshot}
                          onChange={refresh}
                          onReveal={reveal}
                          onError={setError}
                        />
                      )}
                      <p className="library-progress-note">
                        수업을 마친 기록과 스스로 통과한 이해 점검은 구분해 보관합니다.
                      </p>
                    </>
                  ) : (
                    <div className="library-content-empty">
                      <h2>아직 저장된 수업이 없습니다.</h2>
                      <p>
                        PDF의 학습 목표에서 ‘함께 공부하기’를 선택하면 설명·예측·실험·이해 점검으로 구성된
                        수업이 이곳에 저장됩니다.
                      </p>
                      <button type="button" disabled={busy} onClick={() => openOriginal()}>
                        PDF에서 수업 만들기
                      </button>
                    </div>
                  ))}
                {tab === "goals" &&
                  (snapshot.goals.length ? (
                    <div className="library-goals">
                      <p className="library-progress-note">
                        {snapshot.goals.filter((g) => g.checked).length}/{snapshot.goals.length}개 목표의 이해
                        점검을 스스로 통과했습니다.
                      </p>
                      {snapshot.goals.map((goal, i) => {
                        const linkedLessons = snapshot.lessons.filter((l) => l.goalId === goal.id)
                        const answer = explanations.find((m) => m.goalId === goal.id)
                        const refs = snapshot.messages.flatMap((m) => m.evidence)
                        return (
                          <article className="library-goal" key={goal.id}>
                            <div className="library-goal-heading">
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              <h2>{goal.question}</h2>
                            </div>
                            <small>
                              {goal.checked
                                ? "이해 점검 통과"
                                : goal.explored
                                  ? "탐색함 · 점검 전"
                                  : "아직 탐색하지 않음"}{" "}
                              ·{" "}
                              {goal.difficulty === "introductory"
                                ? "기초"
                                : goal.difficulty === "intermediate"
                                  ? "중급"
                                  : "심화"}
                            </small>
                            <p>{goal.prerequisites}</p>
                            {goal.checkQuestion && <p>이해 점검: {goal.checkQuestion}</p>}
                            <div className="answer-citations">
                              {goal.evidenceIds.map((id) => {
                                const ref = refs.find((e) => e.id === id)
                                return ref ? <CitationChip key={id} evidence={ref} onReveal={reveal} /> : null
                              })}
                            </div>
                            {linkedLessons.map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                onClick={() => {
                                  setLessonId(item.id)
                                  setTab("lessons")
                                }}
                              >
                                <BookOpen size={14} /> {item.title} 복습하기
                              </button>
                            ))}
                            {answer && (
                              <details>
                                <summary>저장된 설명 읽기</summary>
                                <StoredMessage
                                  message={answer}
                                  hash={doc.documentHash}
                                  onReveal={reveal}
                                  onError={setError}
                                />
                              </details>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="library-content-empty">
                      <h2>저장된 학습 목표가 없습니다.</h2>
                      <p>PDF의 학습 공간에서 만든 목표가 이곳에 함께 저장됩니다.</p>
                    </div>
                  ))}
                {tab === "notes" &&
                  (explanations.length || conversations.length ? (
                    <div className="library-notes">
                      {explanations.length > 0 && (
                        <section>
                          <h2>요약과 설명</h2>
                          {explanations.map((message) => (
                            <StoredMessage
                              key={message.id}
                              message={message}
                              hash={doc.documentHash}
                              onReveal={reveal}
                              onError={setError}
                            />
                          ))}
                        </section>
                      )}
                      {conversations.length > 0 && (
                        <section>
                          <h2>나눈 대화</h2>
                          {conversations.map((message) => (
                            <StoredMessage
                              key={message.id}
                              message={message}
                              hash={doc.documentHash}
                              onReveal={reveal}
                              onError={setError}
                            />
                          ))}
                        </section>
                      )}
                    </div>
                  ) : (
                    <div className="library-content-empty">
                      <h2>저장된 요약이나 대화가 없습니다.</h2>
                      <p>논문을 읽으며 나눈 대화와 생성한 설명을 여기서 다시 볼 수 있습니다.</p>
                    </div>
                  ))}
              </div>
              {evidence && (
                <aside className="library-evidence-panel" ref={evidencePanel} aria-label="저장된 원문 근거">
                  <header>
                    <strong>저장된 원문 발췌 · p. {evidence.pageIndex + 1}</strong>
                    <button type="button" aria-label="근거 닫기" onClick={() => setEvidence(null)}>
                      <X size={16} />
                    </button>
                  </header>
                  <small>
                    {evidence.sectionTitle} · {evidence.quality === "usable" ? "본문 추출" : "추출 확인 필요"}
                  </small>
                  <blockquote>{evidence.quote}</blockquote>
                  <button type="button" disabled={busy} onClick={() => openOriginal(evidence)}>
                    {doc.sourceAvailable ? "원문 페이지에서 확인" : "PDF 연결 후 원문에서 확인…"}
                  </button>
                </aside>
              )}
            </>
          )}
        </section>
      </div>
      <TopicCleanupDialog
        facets={facets}
        isOpen={topicsOpen}
        onOpenChange={setTopicsOpen}
        onChanged={() => {
          setTopic(undefined)
          void loadList()
        }}
      />
    </main>
  )
}
