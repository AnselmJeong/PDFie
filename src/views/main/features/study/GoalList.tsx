import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  MoreHorizontal,
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
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ id: string; text: string } | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement | null>(null)
  const editorInput = useRef<HTMLTextAreaElement>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (hidden) setMenuId(null)
    else if (editor?.id) editorInput.current?.focus()
  }, [hidden, editor?.id])
  useEffect(() => {
    if (!menuId || hidden) return
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Element && !event.target.closest(".goal-more")) setMenuId(null)
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
  }, [menuId, hidden])

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
    setMenuId(null)
    onReorder(ids)
  }

  return (
    <section className="goals-panel" hidden={hidden}>
      <div className="goal-list-heading">
        <div>
          <span className="study-eyebrow">질문에서 이해로</span>
          <h2>학습 목표</h2>
        </div>
        {!!goals.length && <span className="goal-count">{goals.length}개 목표</span>}
      </div>
      <div className="goal-list-progress">
        <span>
          탐색 {goals.filter((goal) => goal.explored).length}/{goals.length}
        </span>
        <span>
          <CheckCircle2 size={12} aria-hidden="true" />
          점검 통과 {goals.filter((goal) => goal.checked).length}/{goals.length}
        </span>
      </div>
      <div className="goal-list-intro">
        <p className="study-muted">질문을 펼쳐 선수 지식과 이해 점검을 확인하세요.</p>
        <button
          type="button"
          className={goals.length ? "goal-quiet-action" : "study-primary"}
          disabled={!ready}
          title={!ready ? unavailableReason : "편집한 목표와 점검 기록은 유지됩니다."}
          onClick={onRegenerate}
        >
          <Sparkles size={13} aria-hidden="true" />
          {goals.length ? "목표 다시 제안" : "원문으로 학습 목표 만들기"}
        </button>
      </div>
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
          const refs = goal.evidenceIds.flatMap((id) => {
            const ref = evidence.find((item) => item.id === id)
            return ref ? [ref] : []
          })
          const pages = [...new Set(refs.map((ref) => ref.pageIndex + 1))].sort((a, b) => a - b)
          const state = goal.checked ? "checked" : goal.explored ? "explored" : "suggested"
          return (
            <li
              className="goal-row"
              key={goal.id}
              data-state={state}
              data-expanded={expanded}
              data-menu-open={menuId === goal.id}
            >
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
                  {goal.checked ? "점검 통과" : goal.explored ? "탐색 중" : "탐색 전"}
                  {goal.userEdited && <span className="goal-edited"> · 편집함</span>}
                </span>
                <div className="goal-row-actions">
                  <button
                    type="button"
                    className="goal-quiet-action"
                    disabled={!ready && !hasExplanation(goal.id)}
                    title={!ready && !hasExplanation(goal.id) ? unavailableReason : undefined}
                    onClick={() => onExplain(goal)}
                  >
                    <FileText size={12} aria-hidden="true" />
                    설명 확인
                  </button>
                  <button
                    type="button"
                    className="goal-study-action"
                    disabled={!ready}
                    title={!ready ? unavailableReason : undefined}
                    onClick={() => onStudy(goal)}
                  >
                    <BookOpen size={13} aria-hidden="true" />
                    함께 공부하기
                  </button>
                  <div className="goal-more">
                    <button
                      type="button"
                      className="goal-more-trigger"
                      aria-label={`${goal.question} 더 보기`}
                      aria-expanded={menuId === goal.id}
                      aria-controls={`goal-options-${goal.id}`}
                      onClick={(event) => {
                        menuTrigger.current = event.currentTarget
                        setMenuId(menuId === goal.id ? null : goal.id)
                      }}
                    >
                      <MoreHorizontal size={17} aria-hidden="true" />
                    </button>
                    {menuId === goal.id && (
                      <fieldset
                        className="goal-more-popover"
                        id={`goal-options-${goal.id}`}
                        aria-label="학습 목표 편집"
                      >
                        <button
                          type="button"
                          disabled={busy || saving}
                          onClick={() => {
                            setEditor({ id: goal.id, text: goal.question })
                            setExpandedId(goal.id)
                            setMenuId(null)
                          }}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          질문 편집
                        </button>
                        <button
                          type="button"
                          disabled={index === 0 || busy || saving}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp size={13} aria-hidden="true" />
                          위로 이동
                        </button>
                        <button
                          type="button"
                          disabled={index === goals.length - 1 || busy || saving}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown size={13} aria-hidden="true" />
                          아래로 이동
                        </button>
                        <button
                          type="button"
                          className="goal-delete-action"
                          disabled={busy || saving}
                          onClick={() => {
                            setMenuId(null)
                            if (editing) setEditor(null)
                            onDelete(goal.id)
                          }}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          목표 삭제
                        </button>
                      </fieldset>
                    )}
                  </div>
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
                    <div className="study-actions">
                      <button type="submit" disabled={!editor.text.trim() || saving}>
                        {saving ? "저장 중…" : "저장"}
                      </button>
                      <button type="button" disabled={saving} onClick={() => setEditor(null)}>
                        취소
                      </button>
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
        <button
          type="submit"
          aria-label="학습 목표 추가"
          disabled={!draft.trim() || !snapshot?.index.blockCount || saving}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
