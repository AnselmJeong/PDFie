import { Button } from "@astryxdesign/core/Button"
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu"
import { IconButton } from "@astryxdesign/core/IconButton"
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  Merge,
  Pencil,
  RefreshCw,
  Scissors,
} from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import type { EvidenceRef, StudyEvent, StudySection, StudySnapshot } from "../../../../shared/study/contracts"
import { actionAnswers } from "../../../../shared/study/conversation"
import { rpc } from "../../rpc"
import { AnswerBlocks } from "./AnswerBlocks"

// Outline numbers ("2", "2.1"), subtree page ends and child counts for the tree.
function sectionOutline(sections: StudySection[]) {
  const counters: number[] = []
  return sections.map((section, index) => {
    let end = index
    while ((sections[end + 1]?.level ?? 0) > section.level) end++
    const pageEnd = Math.max(...sections.slice(index, end + 1).map((s) => s.pageEnd))
    let label = ""
    if (section.kind !== "front") {
      counters.length = section.level
      for (let i = 0; i < section.level; i++) counters[i] ??= 0
      counters[section.level - 1] = (counters[section.level - 1] ?? 0) + 1
      label =
        section.level === 1
          ? String(counters[0]).padStart(2, "0")
          : counters.slice(0, section.level).join(".")
    }
    return { label, pageEnd, descendants: end - index }
  })
}

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
  const [editor, setEditor] = useState<{ id: string; title: string } | null>(null)
  const [split, setSplit] = useState<SplitEditor | null>(null)
  const [editing, setEditing] = useState(false)
  const [pendingSummaryId, setPendingSummaryId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const outline = useMemo(() => sectionOutline(snapshot?.sections ?? []), [snapshot?.sections])
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
      <header className="section-list-heading">
        <div className="goal-list-title">
          <h2>섹션별 읽기</h2>
          {!!snapshot?.sections.length && (
            <span className="section-count">{snapshot.sections.length}개 섹션</span>
          )}
        </div>
        <p className="section-list-hint">제목을 눌러 요약을 펼치고, 원문 흐름을 따라 함께 공부해 보세요.</p>
      </header>
      <ol className="section-list" aria-label="문서 섹션">
        {snapshot?.sections.map((section, index) => {
          const ancestorCollapsed = (() => {
            let parentId = section.parentId
            while (parentId) {
              if (collapsed.has(parentId)) return true
              parentId = snapshot.sections.find((s) => s.id === parentId)?.parentId ?? null
            }
            return false
          })()
          if (ancestorCollapsed) return null
          const shape = outline[index] ?? { label: "", pageEnd: section.pageEnd, descendants: 0 }
          const childrenHidden = collapsed.has(section.id)
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
              data-level={section.level}
              data-kind={section.kind}
              style={{ "--section-depth": Math.min(section.level, 4) - 1 } as CSSProperties}
            >
              <div className="section-row-heading">
                {shape.descendants ? (
                  <button
                    type="button"
                    className="section-tree-toggle"
                    aria-expanded={!childrenHidden}
                    aria-label={`${section.title} 하위 섹션 ${shape.descendants}개 ${childrenHidden ? "펼치기" : "접기"}`}
                    onClick={() => {
                      const next = new Set(collapsed)
                      if (childrenHidden) next.delete(section.id)
                      else next.add(section.id)
                      setCollapsed(next)
                    }}
                  >
                    <ChevronRight size={11} aria-hidden="true" />
                    <span>{shape.label}</span>
                  </button>
                ) : (
                  <span className="section-number" aria-hidden="true">
                    {shape.label || "·"}
                  </span>
                )}
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
                  {shape.pageEnd !== section.pageStart ? `–${shape.pageEnd}` : ""}
                  {section.userEdited ? " · 수정함" : ""}
                  {section.kind === "back" && (
                    <span
                      className="section-kind"
                      title="참고문헌·선언 같은 부가 정보는 문서 전체 요약·학습 목표·학습에서 기본으로 제외됩니다. 이 섹션을 직접 고르면 다룰 수 있습니다."
                    >
                      부가 정보
                    </span>
                  )}
                  {section.kind === "front" && <span className="section-kind">제목·저자</span>}
                </span>
                <div className="section-row-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    label="요약"
                    tooltip={`${section.title} 요약 ${expanded ? "접기" : "펼치기"}`}
                    icon={<FileText size={13} aria-hidden="true" />}
                    aria-expanded={expanded}
                    onClick={toggleSummary}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    label="함께 공부하기"
                    tooltip={!ready ? unavailableReason : undefined}
                    icon={<BookOpen size={13} aria-hidden="true" />}
                    isDisabled={!ready}
                    onClick={() => onStudy(section)}
                  />
                  <DropdownMenu
                    alignment="end"
                    menuWidth={190}
                    renderTrigger={(trigger) => (
                      <IconButton
                        {...trigger}
                        size="sm"
                        variant="ghost"
                        label={`${section.title} 더 보기`}
                        icon={<Ellipsis size={15} aria-hidden="true" />}
                      />
                    )}
                  >
                    <DropdownMenuItem
                      label="제목 수정"
                      icon={Pencil}
                      isDisabled={!!busy || editing}
                      onClick={() => {
                        setEditor({ id: section.id, title: section.title })
                        setSplit(null)
                      }}
                    />
                    <DropdownMenuItem
                      label="나누기"
                      icon={Scissors}
                      isDisabled={!!busy || editing}
                      onClick={() =>
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
                      }
                    />
                    <DropdownMenuItem
                      label="이전과 합치기"
                      icon={Merge}
                      isDisabled={!!busy || editing || index === 0}
                      onClick={() =>
                        void mutate(async () => {
                          await rpc.request["study.section.merge"]({ documentId, sectionId: section.id })
                          setExpandedId(null)
                          setEditor(null)
                          setSplit(null)
                          onMerge()
                        })
                      }
                    />
                    {summary && <DropdownMenuDivider />}
                    {summary && (
                      <DropdownMenuItem
                        label="요약 다시 만들기"
                        icon={RefreshCw}
                        isDisabled={!ready}
                        onClick={() => {
                          setExpandedId(section.id)
                          requestSummary(section)
                        }}
                      />
                    )}
                  </DropdownMenu>
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
                  <div className="goal-editor-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      label="취소"
                      isDisabled={editing}
                      onClick={() => setEditor(null)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      label="저장"
                      isLoading={editing}
                      isDisabled={!!busy || !editor.title.trim()}
                    />
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
                  <div className="goal-editor-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      label="취소"
                      isDisabled={editing}
                      onClick={() => setSplit(null)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      label="나누기 저장"
                      isLoading={editing}
                      isDisabled={!!busy || !split.blockId || !split.title.trim()}
                    />
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
                      <AnswerBlocks blocks={summary.blocks} evidence={summary.evidence} onReveal={onReveal} />
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
                    <Button
                      size="sm"
                      variant="secondary"
                      label={failed ? "요약 다시 시도" : "요약 만들기"}
                      icon={<FileText size={13} aria-hidden="true" />}
                      isDisabled={!ready}
                      tooltip={!ready ? unavailableReason : undefined}
                      onClick={() => requestSummary(section)}
                    />
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
