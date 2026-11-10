import { Button } from "@astryxdesign/core/Button"
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu"
import { IconButton } from "@astryxdesign/core/IconButton"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Ellipsis,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { EvidenceRef, StudyGoal, StudySnapshot } from "../../../../shared/study/contracts"
import { CitationChip } from "./CitationChip"

export function GoalList({
  hidden,
  snapshot,
  evidence,
  ready,
  unavailableReason,
  busy,
  hasExplanation,
  hasLesson,
  onRegenerate,
  onExplain,
  onStudy,
  onSave,
  onReorder,
  onDelete,
  onReveal,
}: {
  hidden: boolean
  snapshot: StudySnapshot | null
  evidence: EvidenceRef[]
  ready: boolean
  unavailableReason: string
  busy: boolean
  hasExplanation: (goalId: string) => boolean
  hasLesson: (goalId: string) => boolean
  onRegenerate: () => void
  onExplain: (goal: StudyGoal) => void
  onStudy: (goal: StudyGoal) => void
  onSave: (goal: StudyGoal) => Promise<boolean>
  onReorder: (goalIds: string[]) => void
  onDelete: (goalId: string) => void
  onReveal: (evidence: EvidenceRef) => void
}) {
  const goals = snapshot?.goals ?? []
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ id: string; text: string } | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const editorInput = useRef<HTMLTextAreaElement>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!hidden && editor?.id) editorInput.current?.focus()
  }, [hidden, editor?.id])

  const save = async (goal: StudyGoal, complete: () => void) => {
    setSaving(true)
    try {
      const saved = await onSave(goal)
      if (mounted.current && saved) complete()
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  const move = (index: number, direction: -1 | 1) => {
    const ids = goals.map((goal) => goal.id)
    const target = index + direction
    const currentId = ids[index]
    const targetId = ids[target]
    if (!currentId || !targetId) return
    ids[index] = targetId
    ids[target] = currentId
    onReorder(ids)
  }

  return (
    <section className="goals-panel" hidden={hidden}>
      <header className="goal-list-heading">
        <div className="goal-list-title">
          <h2>학습 목표</h2>
          <Button
            size="sm"
            variant={goals.length ? "ghost" : "primary"}
            label={goals.length ? "다시 제안" : "원문으로 학습 목표 만들기"}
            tooltip={!ready ? unavailableReason : "편집한 목표와 점검 기록은 유지됩니다."}
            icon={<Sparkles size={13} aria-hidden="true" />}
            isDisabled={!ready}
            onClick={onRegenerate}
          />
        </div>
        {!!goals.length && (
          <div className="goal-list-progress">
            <ProgressBar
              label="이해 점검 통과"
              isLabelHidden
              variant="success"
              max={goals.length}
              value={goals.filter((goal) => goal.checked).length}
            />
            <span>
              <CheckCircle2 size={12} aria-hidden="true" />
              점검 통과 {goals.filter((goal) => goal.checked).length}/{goals.length}
            </span>
            <span>
              탐색 {goals.filter((goal) => goal.explored).length}/{goals.length}
            </span>
          </div>
        )}
      </header>
      {!goals.length && (
        <p className="study-empty-note">
          {ready
            ? "원문 준비가 끝났습니다. 이 문서에서 함께 탐구할 질문을 만들어 보세요."
            : unavailableReason}
        </p>
      )}
      <ol className="goal-list" aria-label="문서 학습 목표">
        {goals.map((goal, index) => {
          const expanded = expandedId === goal.id
          const editing = editor?.id === goal.id
          const explanationSaved = hasExplanation(goal.id)
          const lessonSaved = hasLesson(goal.id)
          const refs = goal.evidenceIds.flatMap((id) => {
            const ref = evidence.find((item) => item.id === id)
            return ref ? [ref] : []
          })
          const pages = [...new Set(refs.map((ref) => ref.pageIndex + 1))].sort((a, b) => a - b)
          const state = goal.checked ? "checked" : goal.explored ? "explored" : "suggested"
          return (
            <li className="goal-row" key={goal.id} data-state={state} data-expanded={expanded}>
              <div className="goal-row-heading">
                <span className="goal-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>
                  <button
                    type="button"
                    id={`goal-heading-${goal.id}`}
                    className="goal-toggle"
                    aria-expanded={expanded}
                    aria-controls={`goal-detail-${goal.id}`}
                    onClick={() => setExpandedId(expanded ? null : goal.id)}
                  >
                    <span>{goal.question}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </h3>
              </div>
              <div className="goal-row-meta">
                <span className="goal-status">
                  {goal.checked ? (
                    <CheckCircle2 size={12} aria-hidden="true" />
                  ) : (
                    <Circle size={10} aria-hidden="true" />
                  )}
                  {goal.checked
                    ? "점검 통과"
                    : lessonSaved
                      ? "학습 준비됨"
                      : explanationSaved
                        ? "설명 있음"
                        : goal.explored
                          ? "탐색 기록"
                          : "탐색 전"}
                  {goal.userEdited && <span className="goal-edited"> · 편집함</span>}
                </span>
                <div className="goal-row-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    label="설명"
                    tooltip={!ready && !explanationSaved ? unavailableReason : "원문 근거와 함께 설명 보기"}
                    icon={<FileText size={13} aria-hidden="true" />}
                    isDisabled={!ready && !explanationSaved}
                    onClick={() => onExplain(goal)}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    label={lessonSaved ? "학습 이어보기" : "함께 공부하기"}
                    tooltip={!ready && !lessonSaved ? unavailableReason : undefined}
                    icon={<BookOpen size={13} aria-hidden="true" />}
                    isDisabled={!ready && !lessonSaved}
                    onClick={() => onStudy(goal)}
                  />
                  <DropdownMenu
                    alignment="end"
                    menuWidth={180}
                    renderTrigger={(trigger) => (
                      <IconButton
                        {...trigger}
                        size="sm"
                        variant="ghost"
                        label={`${goal.question} 더 보기`}
                        icon={<Ellipsis size={15} aria-hidden="true" />}
                      />
                    )}
                  >
                    <DropdownMenuItem
                      label="질문 편집"
                      icon={Pencil}
                      isDisabled={busy || saving}
                      onClick={() => {
                        setEditor({ id: goal.id, text: goal.question })
                        setExpandedId(goal.id)
                      }}
                    />
                    <DropdownMenuItem
                      label="위로 이동"
                      icon={ArrowUp}
                      isDisabled={index === 0 || busy || saving}
                      onClick={() => move(index, -1)}
                    />
                    <DropdownMenuItem
                      label="아래로 이동"
                      icon={ArrowDown}
                      isDisabled={index === goals.length - 1 || busy || saving}
                      onClick={() => move(index, 1)}
                    />
                    <DropdownMenuDivider />
                    <DropdownMenuItem
                      label="목표 삭제"
                      icon={Trash2}
                      variant="destructive"
                      isDisabled={busy || saving}
                      onClick={() => {
                        if (editing) setEditor(null)
                        onDelete(goal.id)
                      }}
                    />
                  </DropdownMenu>
                </div>
              </div>
              <section
                className="goal-detail"
                id={`goal-detail-${goal.id}`}
                aria-labelledby={`goal-heading-${goal.id}`}
                hidden={!expanded}
              >
                {editing && editor && (
                  <form
                    className="goal-inline-editor"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!editor.text.trim() || saving) return
                      void save({ ...goal, question: editor.text.trim() }, () => setEditor(null))
                    }}
                  >
                    <label>
                      목표 질문
                      <textarea
                        ref={editorInput}
                        value={editor.text}
                        disabled={saving}
                        onChange={(event) => setEditor({ ...editor, text: event.target.value })}
                      />
                    </label>
                    <div className="goal-editor-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        label="취소"
                        isDisabled={saving}
                        onClick={() => setEditor(null)}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        label="저장"
                        isLoading={saving}
                        isDisabled={!editor.text.trim()}
                      />
                    </div>
                  </form>
                )}
                {goal.prerequisites && (
                  <div className="goal-detail-block">
                    <h4>먼저 알아둘 것</h4>
                    <p>{goal.prerequisites}</p>
                  </div>
                )}
                {goal.checkQuestion && (
                  <div className="goal-detail-block goal-check-question">
                    <h4>이해 점검 질문</h4>
                    <p>{goal.checkQuestion}</p>
                  </div>
                )}
                {!!refs.length && (
                  <div className="goal-detail-evidence">
                    <span>원문 근거 · p. {pages.join(", ")}</span>
                    <div className="answer-citations">
                      {refs.map((ref) => (
                        <CitationChip key={ref.id} evidence={ref} onReveal={onReveal} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </li>
          )
        })}
      </ol>
      <form
        className="goal-add"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim() || saving || !snapshot?.index.blockCount) return
          void save(
            {
              id: crypto.randomUUID(),
              question: draft.trim(),
              prerequisites: "사용자가 추가한 질문",
              sectionId: null,
              evidenceIds: [],
              difficulty: "intermediate",
              checkQuestion: "자신의 말로 설명해 보세요.",
              userEdited: true,
              explored: false,
              checked: false,
              revision: snapshot.index.revision,
            },
            () => setDraft(""),
          )
        }}
      >
        <input
          aria-label="직접 학습 목표 추가"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="내가 탐구할 질문 추가"
        />
        <IconButton
          type="submit"
          size="sm"
          variant="ghost"
          label="학습 목표 추가"
          tooltip="학습 목표 추가"
          icon={<Plus size={15} aria-hidden="true" />}
          isDisabled={!draft.trim() || !snapshot?.index.blockCount || saving}
        />
      </form>
    </section>
  )
}
