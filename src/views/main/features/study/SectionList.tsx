import {
  BookOpen,
  ChevronDown,
  FileText,
  Merge,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Scissors,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { EvidenceRef, StudyEvent, StudySection, StudySnapshot } from "../../../../shared/study/contracts"
import { actionAnswers } from "../../../../shared/study/conversation"
import { rpc } from "../../rpc"
import { CitationChip } from "./CitationChip"

type SplitEditor = {
  sectionId: string
  blockId: string
  title: string
  points: Array<{ id: string; page: number; preview: string }>
}

export function SectionList({
  snapshot,
  documentId,
  ready,
  unavailableReason,
  busy,
  onSummary,
  onStudy,
  onReveal,
  onRefresh,
  onError,
  onMerge,
}: {
  snapshot: StudySnapshot | null
  documentId: string
  ready: boolean
  unavailableReason: string
  busy: StudyEvent | null
  onSummary: (section: StudySection) => Promise<void>
  onStudy: (section: StudySection) => void
  onReveal: (evidence: EvidenceRef) => void
  onRefresh: () => Promise<void>
  onError: (cause: unknown) => void
  onMerge: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ id: string; title: string } | null>(null)
  const [split, setSplit] = useState<SplitEditor | null>(null)
  const [editing, setEditing] = useState(false)
  const [pendingSummaryId, setPendingSummaryId] = useState<string | null>(null)
  const menuTrigger = useRef<HTMLButtonElement | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const splitSelect = useRef<HTMLSelectElement>(null)
  const mounted = useRef(true)
  const answers = actionAnswers(snapshot?.messages ?? [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!busy) setPendingSummaryId(null)
  }, [busy])
  useEffect(() => {
    if (editor?.id) titleInput.current?.focus()
  }, [editor?.id])
  useEffect(() => {
    if (split?.sectionId) splitSelect.current?.focus()
  }, [split?.sectionId])
  useEffect(() => {
    if (!menuId) return
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Element && !event.target.closest(".section-more")) setMenuId(null)
    }
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setMenuId(null)
      menuTrigger.current?.focus()
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("focusin", dismiss)
    document.addEventListener("keydown", dismissWithEscape, true)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("focusin", dismiss)
      document.removeEventListener("keydown", dismissWithEscape, true)
    }
  }, [menuId])

  const mutate = async (operation: () => Promise<unknown>) => {
    setEditing(true)
    try {
      await operation()
      await onRefresh()
    } catch (cause) {
      onError(cause)
    } finally {
      if (mounted.current) setEditing(false)
    }
  }
  const requestSummary = (section: StudySection) => {
    setPendingSummaryId(section.id)
    void onSummary(section)
  }

  return (
    <section className="sections-panel">
      <div className="section-list-heading">
        <div>
          <span className="study-eyebrow">원문의 흐름을 따라</span>
          <h2>섹션별 읽기</h2>
        </div>
        {!!snapshot?.sections.length && (
          <span className="section-count">{snapshot.sections.length}개 섹션</span>
        )}
      </div>
      <p className="study-muted section-list-hint">제목을 눌러 요약을 펼치고, 함께 공부해 보세요.</p>
      <ol className="section-list" aria-label="문서 섹션">
        {snapshot?.sections.map((section, index) => {
          const summary = answers
            .filter(
              (message) =>
                message.task === "summary" &&
                message.scope.type === "section" &&
                message.scope.sectionId === section.id &&
                message.state === "completed" &&
                message.evidence[0]?.revision === snapshot.index.revision,
            )
            .at(-1)
          const latest = answers
            .filter(
              (message) =>
                message.task === "summary" &&
                message.scope.type === "section" &&
                message.scope.sectionId === section.id,
            )
            .at(-1)
          const expanded = expandedId === section.id
          const generating = !!busy && (pendingSummaryId === section.id || latest?.id === busy.requestId)
          const failed =
            latest && latest.id !== summary?.id && ["failed", "stopped", "interrupted"].includes(latest.state)
          const sourceLabel =
            section.source === "bookmark"
              ? "PDF 목차"
              : section.source === "heading"
                ? "본문 제목 추정"
                : section.source === "user"
                  ? "직접 수정"
                  : "페이지 범위"
          const toggleSummary = () => {
            if (expanded) {
              setExpandedId(null)
              return
            }
            setExpandedId(section.id)
            if (!summary && ready && !editing) requestSummary(section)
          }
          return (
            <li
              className="section-row"
              key={section.id}
              data-expanded={expanded}
              data-menu-open={menuId === section.id}
            >
              <div className="section-row-heading">
                <span className="section-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>
                  <button
                    type="button"
                    id={`section-heading-${section.id}`}
                    className="section-toggle"
                    aria-expanded={expanded}
                    aria-controls={`section-summary-${section.id}`}
                    onClick={toggleSummary}
                  >
                    <span>{section.title}</span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                </h3>
              </div>
              <div className="section-row-meta">
                <span
                  className="section-pages"
                  title={`${sourceLabel} · PDF 목차와 본문 제목에서 찾은 구조입니다.`}
                >
                  p. {section.pageStart}
                  {section.pageEnd !== section.pageStart ? `–${section.pageEnd}` : ""}
                  {section.userEdited ? " · 수정함" : ""}
                </span>
                <div className="section-row-actions">
                  <button
                    type="button"
                    className="section-quiet-action"
                    onClick={toggleSummary}
                    aria-label={`${section.title} 요약 ${expanded ? "접기" : "펼치기"}`}
                  >
                    <FileText size={12} aria-hidden="true" />
                    요약
                  </button>
                  <button
                    type="button"
                    className="section-study-action"
                    disabled={!ready}
                    title={!ready ? unavailableReason : undefined}
                    onClick={() => onStudy(section)}
                  >
                    <BookOpen size={13} aria-hidden="true" />
                    함께 공부하기
                  </button>
                  <div className="section-more">
                    <button
                      type="button"
                      className="section-more-trigger"
                      aria-label={`${section.title} 더 보기`}
                      aria-expanded={menuId === section.id}
                      aria-controls={`section-options-${section.id}`}
                      onClick={(event) => {
                        menuTrigger.current = event.currentTarget
                        setMenuId(menuId === section.id ? null : section.id)
                      }}
                    >
                      <MoreHorizontal size={17} aria-hidden="true" />
                    </button>
                    {menuId === section.id && (
                      <fieldset
                        className="section-more-popover"
                        id={`section-options-${section.id}`}
                        aria-label="섹션 편집"
                      >
                        <button
                          type="button"
                          disabled={!!busy || editing}
                          onClick={() => {
                            setEditor({ id: section.id, title: section.title })
                            setSplit(null)
                            setMenuId(null)
                          }}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          제목 수정
                        </button>
                        <button
                          type="button"
                          disabled={!!busy || editing}
                          onClick={() => {
                            setMenuId(null)
                            void mutate(async () => {
                              const points = await rpc.request["study.section.splitPoints"]({
                                documentId,
                                sectionId: section.id,
                              })
                              if (mounted.current) {
                                setEditor(null)
                                setSplit({
                                  sectionId: section.id,
                                  blockId: points[0]?.id ?? "",
                                  title: "새 섹션",
                                  points,
                                })
                              }
                            })
                          }}
                        >
                          <Scissors size={13} aria-hidden="true" />
                          나누기
                        </button>
                        <button
                          type="button"
                          disabled={!!busy || editing || index === 0}
                          onClick={() => {
                            setMenuId(null)
                            void mutate(async () => {
                              await rpc.request["study.section.merge"]({ documentId, sectionId: section.id })
                              setExpandedId(null)
                              setEditor(null)
                              setSplit(null)
                              onMerge()
                            })
                          }}
                        >
                          <Merge size={13} aria-hidden="true" />
                          이전과 합치기
                        </button>
                        {summary && (
                          <button
                            type="button"
                            disabled={!ready}
                            onClick={() => {
                              setMenuId(null)
                              setExpandedId(section.id)
                              requestSummary(section)
                            }}
                          >
                            <RefreshCw size={13} aria-hidden="true" />
                            요약 다시 만들기
                          </button>
                        )}
                      </fieldset>
                    )}
                  </div>
                </div>
              </div>
              {editor?.id === section.id && (
                <form
                  className="section-inline-editor"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void mutate(async () => {
                      await rpc.request["study.section.rename"]({
                        documentId,
                        sectionId: section.id,
                        title: editor.title.trim(),
                      })
                      setEditor(null)
                    })
                  }}
                >
                  <label>
                    섹션 제목
                    <input
                      ref={titleInput}
                      value={editor.title}
                      maxLength={300}
                      onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                    />
                  </label>
                  <div className="study-actions">
                    <button type="submit" disabled={editing || !!busy || !editor.title.trim()}>
                      저장
                    </button>
                    <button type="button" disabled={editing} onClick={() => setEditor(null)}>
                      취소
                    </button>
                  </div>
                </form>
              )}
              {split?.sectionId === section.id && (
                <form
                  className="section-split-editor"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void mutate(async () => {
                      await rpc.request["study.section.split"]({
                        documentId,
                        blockId: split.blockId,
                        title: split.title.trim(),
                      })
                      setSplit(null)
                    })
                  }}
                >
                  <label>
                    새 섹션의 시작 원문
                    <select
                      ref={splitSelect}
                      value={split.blockId}
                      onChange={(event) => setSplit({ ...split, blockId: event.target.value })}
                    >
                      {split.points.map((point) => (
                        <option key={point.id} value={point.id}>
                          p. {point.page} · {point.preview}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    새 섹션 제목
                    <input
                      value={split.title}
                      maxLength={300}
                      onChange={(event) => setSplit({ ...split, title: event.target.value })}
                    />
                  </label>
                  <small>
                    {split.points.length
                      ? "선택한 원문 위치부터 새 섹션이 시작됩니다."
                      : "이 섹션에는 나눌 수 있는 추가 원문이 없습니다."}
                  </small>
                  <div className="study-actions">
                    <button
                      type="submit"
                      disabled={editing || !!busy || !split.blockId || !split.title.trim()}
                    >
                      나누기 저장
                    </button>
                    <button type="button" disabled={editing} onClick={() => setSplit(null)}>
                      취소
                    </button>
                  </div>
                </form>
              )}
              <section
                className="section-summary"
                id={`section-summary-${section.id}`}
                aria-labelledby={`section-heading-${section.id}`}
                hidden={!expanded}
              >
                <div className="section-summary-label">
                  요약{generating && <span role="status">원문을 확인하며 작성 중…</span>}
                </div>
                {summary ? (
                  <>
                    {summary.blocks.length ? (
                      summary.blocks.map((block) => (
                        <div className="answer-block" key={`${block.kind}-${block.text}`}>
                          {block.kind !== "document-claim" && (
                            <span className={`claim-kind is-${block.kind}`}>
                              {block.kind === "inference"
                                ? "해석·추론"
                                : block.kind === "background"
                                  ? "배경 설명"
                                  : block.kind === "illustration"
                                    ? "교육용 예시"
                                    : "근거 부족"}
                            </span>
                          )}
                          <p>{block.text}</p>
                          <div className="answer-citations">
                            {block.evidenceIds.map((id) => {
                              const evidence = summary.evidence.find((ref) => ref.id === id)
                              return evidence ? (
                                <CitationChip key={id} evidence={evidence} onReveal={onReveal} />
                              ) : null
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="section-summary-text">{summary.text}</p>
                    )}
                    <small className="answer-coverage">{summary.coverage}</small>
                  </>
                ) : generating ? (
                  <p className="section-summary-note">핵심 흐름과 원문 근거를 정리하고 있습니다.</p>
                ) : (
                  <>
                    <p className="section-summary-note">
                      {failed
                        ? latest.error || "요약이 완료되지 않았습니다. 다시 시도할 수 있습니다."
                        : ready
                          ? "이 섹션의 핵심 흐름을 원문 근거와 함께 정리합니다."
                          : unavailableReason}
                    </p>
                    <button
                      type="button"
                      className="section-quiet-action"
                      disabled={!ready}
                      onClick={() => requestSummary(section)}
                    >
                      <FileText size={13} aria-hidden="true" />
                      {failed ? "요약 다시 시도" : "요약 만들기"}
                    </button>
                  </>
                )}
                {summary && failed && !generating && (
                  <p className="section-summary-note">새 요약을 완료하지 못해 저장된 요약을 표시합니다.</p>
                )}
              </section>
            </li>
          )
        })}
      </ol>
      {!snapshot?.sections.length && (
        <p className="study-empty-note">문서에서 읽을 수 있는 본문을 준비하고 있습니다.</p>
      )}
    </section>
  )
}
