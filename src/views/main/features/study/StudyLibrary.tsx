import {
  Archive,
  ArrowLeft,
  BookOpen,
  Download,
  FileText,
  FolderOpen,
  MoreHorizontal,
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
import { CitationChip } from "./CitationChip"
import { LessonPlayer } from "./LessonPlayer"
import { EMPTY_FACETS, LibraryCatalog } from "./LibraryCatalog"
import { LibraryIntake } from "./LibraryIntake"
import { LibraryOrganization } from "./LibraryOrganization"
import { LibraryTopics } from "./LibraryTopics"

const date = (value: string) =>
  Date.parse(value) > 0
    ? new Date(value).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", year: "numeric" })
    : "이전 기록"
const labels = {
  "document-claim": "논문에서 확인",
  inference: "해석·추론",
  background: "배경 설명",
  illustration: "교육용 예시",
  unknown: "근거 부족",
}

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
        message.blocks.map((block) => (
          <div className="library-answer-block" key={`${block.kind}-${block.text}`}>
            <span className={`claim-kind is-${block.kind}`}>{labels[block.kind]}</span>
            <p>{block.text}</p>
            <div className="answer-citations">
              {block.evidenceIds.map((id) => {
                const evidence = message.evidence.find((ref) => ref.id === id)
                return evidence ? <CitationChip key={id} evidence={evidence} onReveal={onReveal} /> : null
              })}
            </div>
          </div>
        ))
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
  const [manage, setManage] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
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
    setManage(false)
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
      if (event.key !== "Escape") return
      if (confirmDelete) setConfirmDelete(false)
      else if (manage) setManage(false)
      else if (evidence) setEvidence(null)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [confirmDelete, manage, evidence])
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
      <header className="library-topbar">
        <div className="library-brand">
          <BookOpen size={21} />
          <span>
            PDFie <strong>학습 서재</strong>
          </span>
        </div>
        <div className="library-top-actions">
          {onReturn && (
            <button type="button" onClick={onReturn}>
              <ArrowLeft size={15} /> 읽던 PDF로 돌아가기
            </button>
          )}
          <button type="button" className="library-primary" disabled={opening} onClick={onOpenPdf}>
            <FolderOpen size={15} />
            {opening ? "여는 중…" : "PDF 열기"}
          </button>
          <button
            type="button"
            aria-label="설정"
            onClick={() => void rpc.request["app.settings.open"]({}).catch(report)}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      <LibraryIntake />
      <div className="library-workspace">
        <div className="library-browse-surface" hidden={Boolean(selected)}>
          <LibraryTopics
            facets={facets}
            onChanged={() => {
              setTopic(undefined)
              void loadList()
            }}
          />
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
            onOpenPdf={onOpenPdf}
            opening={opening}
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
          <div className="library-detail-back">
            <button type="button" onClick={() => setSelected(null)}>
              <ArrowLeft size={15} /> 서재로 돌아가기
            </button>
          </div>
          {detailLoading ? (
            <p className="library-loading" role="status">
              학습 내용 불러오는 중…
            </p>
          ) : !doc || !snapshot ? (
            <div className="library-welcome">
              <BookOpen size={34} strokeWidth={1.25} />
              <p className="eyebrow">READ · EXPLORE · REVISIT</p>
              <h1>
                읽은 논문이
                <br />
                나의 학습 자료로.
              </h1>
              <p>
                논문을 선택해 저장된 수업을 이어 가세요.
                <br />
                설명, 실험, 이해 점검과 원문 발췌는
                <br />
                PDF가 없어도 다시 볼 수 있습니다.
              </p>
              {!page.total && (
                <button className="library-primary" type="button" disabled={opening} onClick={onOpenPdf}>
                  <FolderOpen size={16} /> PDF를 열고 시작하기
                </button>
              )}
              <small>새 수업 만들기와 AI 질문은 PDF의 학습 공간에서 시작합니다.</small>
            </div>
          ) : (
            <>
              <header className="library-detail-header">
                <div className="library-detail-kicker">
                  <span>{doc.archived ? "보관함" : "나의 학습 자료"}</span>
                  <span>
                    {doc.pageCount ? `${doc.pageCount}페이지 · ` : ""}최근 학습 {date(doc.updatedAt)}
                  </span>
                </div>
                <h1>{doc.title}</h1>
                {doc.fileName && doc.title !== doc.fileName.replace(/\.pdf$/i, "") && (
                  <p className="library-filename">{doc.fileName}</p>
                )}
                <div className="library-detail-actions">
                  <button type="button" disabled={busy} onClick={() => openOriginal()}>
                    <FileText size={14} />
                    {doc.sourceAvailable ? "원문 PDF 열기" : "원문 PDF 연결…"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={doc.favorite}
                    onClick={() => update({ favorite: !doc.favorite })}
                  >
                    <Star size={14} fill={doc.favorite ? "currentColor" : "none"} />
                    {doc.favorite ? "즐겨찾기됨" : "즐겨찾기"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await rpc.request["library.export"]({ documentHash: doc.documentHash })
                        if (result.saved)
                          setNotice(
                            "학습 기록을 Markdown으로 내보냈습니다. 대화·근거·점검 결과가 포함됩니다.",
                          )
                      })
                    }
                  >
                    <Download size={14} /> 내보내기
                  </button>
                  <button
                    type="button"
                    aria-label="자료 관리"
                    aria-expanded={manage}
                    onClick={() => {
                      setManage(!manage)
                      setConfirmDelete(false)
                      setRename(null)
                    }}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
                <p className="library-offline-note">
                  {doc.sourceAvailable
                    ? "저장된 수업은 AI 연결 없이 복습할 수 있습니다."
                    : "원문 PDF가 없어도 수업·대화·근거 발췌를 복습할 수 있습니다."}
                </p>
                {manage && (
                  <div className="library-management">
                    <div className="library-management-actions">
                      <button type="button" disabled={busy} onClick={() => setRename(doc.title)}>
                        제목 바꾸기
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => update({ archived: !doc.archived })}
                      >
                        <Archive size={14} />
                        {doc.archived ? "보관함에서 꺼내기" : "보관함으로 옮기기"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => openOriginal(undefined, true)}>
                        원문 다시 연결…
                      </button>
                      <button
                        type="button"
                        className="library-danger"
                        disabled={busy}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 size={14} /> 자료 삭제…
                      </button>
                    </div>
                    {rename !== null && (
                      <form
                        className="library-rename"
                        onSubmit={(event) => {
                          event.preventDefault()
                          update({ title: rename })
                          setRename(null)
                        }}
                      >
                        <input
                          aria-label="학습 자료 제목"
                          maxLength={500}
                          value={rename}
                          onChange={(event) => setRename(event.target.value)}
                        />
                        <button type="submit" disabled={busy || !rename.trim()}>
                          저장
                        </button>
                        <button type="button" onClick={() => setRename(null)}>
                          취소
                        </button>
                      </form>
                    )}
                    {confirmDelete && (
                      <div className="library-delete-confirm">
                        <strong>‘{doc.title}’의 학습 자료를 삭제할까요?</strong>
                        <p>
                          수업, 대화, 목표, 점검 결과와 저장된 캡처가 삭제됩니다. 원본 PDF와 PDF 주석은
                          유지됩니다. 삭제 전 내보내기로 기록을 남길 수 있습니다.
                        </p>
                        <button
                          type="button"
                          className="library-danger"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await rpc.request["library.delete"]({ documentHash: doc.documentHash })
                              setSelected(null)
                              setDetail(null)
                              setConfirmDelete(false)
                              setManage(false)
                              onDeleted(doc.documentHash)
                              setNotice("학습 자료를 삭제했습니다.")
                              void loadList()
                            })
                          }
                        >
                          학습 자료 삭제
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </header>
              <LibraryOrganization
                key={doc.documentHash}
                document={doc}
                facets={facets}
                onSaved={refresh}
                onError={setError}
              />
              <nav className="library-content-tabs" aria-label="저장된 학습 내용">
                {(
                  [
                    ["lessons", "Interactive learning", snapshot.lessons.length],
                    ["goals", "학습 목표", snapshot.goals.length],
                    ["notes", "요약·설명·대화", explanations.length + conversations.length],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    type="button"
                    key={id}
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => {
                      setTab(id)
                      setEvidence(null)
                    }}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </nav>
              <div className="library-detail-scroll" ref={detailScroll}>
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
      {error && (
        <div className="library-feedback is-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null)
              refresh()
            }}
          >
            다시 확인
          </button>
          <button type="button" aria-label="오류 닫기" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div className="library-feedback" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  )
}
