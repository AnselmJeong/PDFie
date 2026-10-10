import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { EvidenceRef, LessonSpec, StudySnapshot } from "../../../../shared/study/contracts"
import type { WidgetState } from "../../../../shared/study/intelligent-ui"
import { experimentValue } from "../../../../shared/study/validation"
import { rpc } from "../../rpc"
import { CitationChip } from "./CitationChip"
import { IntelligentLesson } from "./IntelligentLesson"
import { SandboxLesson } from "./SandboxLesson"

export function LessonPlayer({
  lesson,
  snapshot,
  documentId,
  onChange,
  onReveal,
  onError,
}: {
  lesson: LessonSpec
  snapshot: StudySnapshot
  documentId?: string
  onChange: () => void
  onReveal: (evidence: EvidenceRef) => void
  onError: (message: string) => void
}) {
  const saved = snapshot.progress.find((p) => p.lessonId === lesson.id)
  const [index, setIndex] = useState(Math.min(saved?.stepIndex ?? 0, lesson.steps.length - 1))
  const [parameters, setParameters] = useState(saved?.parameters ?? {})
  const [widgetStates, setWidgetStates] = useState(saved?.widgetStates ?? {})
  const currentState = useRef({ parameters, widgetStates })
  const saveQueue = useRef(Promise.resolve())
  const saveCount = useRef(0)
  const [expanded, setExpanded] = useState(false)
  const [choice, setChoice] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expanded) return
    const previous = document.activeElement as HTMLElement | null
    const root = dialog.current
    root?.querySelector<HTMLButtonElement>("button")?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setExpanded(false)
      } else if (event.key === "Tab" && root) {
        const controls = Array.from(
          root.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), iframe, [tabindex='0']",
          ),
        )
        const first = controls[0],
          last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", keydown)
    return () => {
      document.removeEventListener("keydown", keydown)
      previous?.focus()
    }
  }, [expanded])
  const step = lesson.steps[index]!
  const attempts = snapshot.attempts.filter((a) => a.lessonId === lesson.id && a.stepIndex === index)
  const last = attempts.at(-1)
  const selectedChoice =
    choice ??
    ((step.type === "quiz" || step.type === "prediction") && last
      ? step.options.indexOf(last.response)
      : null)
  const report = (cause: unknown) =>
    onError(cause instanceof Error ? cause.message : "학습 상태를 저장하지 못했습니다.")
  const save = async (
    nextIndex: number,
    nextParameters = currentState.current.parameters,
    complete = false,
    nextWidgetStates = currentState.current.widgetStates,
  ) => {
    currentState.current = { parameters: nextParameters, widgetStates: nextWidgetStates }
    setParameters(nextParameters)
    setWidgetStates(nextWidgetStates)
    saveCount.current++
    setPending(true)
    const progress = {
      lessonId: lesson.id,
      stepIndex: nextIndex,
      parameters: nextParameters,
      widgetStates: nextWidgetStates,
      ...(complete ? { completedAt: new Date().toISOString() } : {}),
    }
    try {
      const queued = saveQueue.current
        .catch(() => {})
        .then(async () => {
          if (documentId) await rpc.request["study.progress"]({ documentId, progress })
          else await rpc.request["library.progress"]({ documentHash: snapshot.documentHash, progress })
        })
      saveQueue.current = queued
      await queued
      setIndex(nextIndex)
      if (nextIndex !== index) setChoice(null)
      onChange()
    } catch (cause) {
      report(cause)
    } finally {
      saveCount.current--
      if (saveCount.current === 0) setPending(false)
    }
  }
  const submit = async (revealed: boolean) => {
    if ((step.type !== "quiz" && step.type !== "prediction") || pending) return
    const answer = revealed ? step.correctIndex : selectedChoice
    if (answer === null) return
    setPending(true)
    try {
      const assessment = {
        lessonId: lesson.id,
        stepIndex: index,
        choice: answer,
        revealed,
      }
      if (documentId) await rpc.request["study.assess"]({ documentId, ...assessment })
      else await rpc.request["library.assess"]({ documentHash: snapshot.documentHash, ...assessment })
      onChange()
    } catch (cause) {
      report(cause)
    } finally {
      setPending(false)
    }
  }
  const value = step.type === "experiment" ? (parameters[String(index)] ?? step.initial) : 0
  const reveal = (ref: EvidenceRef) => {
    setExpanded(false)
    onReveal(ref)
  }
  const saveWidget = (state: WidgetState) =>
    void save(index, currentState.current.parameters, false, {
      ...currentState.current.widgetStates,
      [String(index)]: state,
    })
  const content = (
    <section className={`lesson-player ${expanded ? "is-expanded" : ""}`} aria-label={lesson.title}>
      <header>
        <span className="study-eyebrow">
          직접 탐구하기 · {index + 1}/{lesson.steps.length}
        </span>
        <button type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "작게 보기" : "넓게 보기"}
        </button>
      </header>
      <h2>{lesson.title}</h2>
      {saved?.completedAt && (
        <p className="lesson-completed" role="status">
          수업을 마쳤습니다 · 언제든 다시 탐구할 수 있습니다.
        </p>
      )}
      <p className="study-muted">{lesson.coverage}</p>
      {lesson.revision !== snapshot.index.revision && (
        <p role="status">이 학습은 이전 문서 색인으로 작성되었습니다.</p>
      )}
      <div className="lesson-progress-bars" aria-hidden="true">
        {lesson.steps.map((s, i) => (
          <i key={`${s.type}-${s.title}`} data-active={i <= index} />
        ))}
      </div>
      {index === 0 && (
        <div className="lesson-prerequisites">
          <strong>학습 목표</strong>
          <ul>
            {lesson.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <strong>선수 개념</strong>
          <p>{lesson.prerequisites.join(" · ") || "본문을 먼저 읽어 보세요."}</p>
        </div>
      )}
      <h3>{step.title}</h3>
      {(step.type === "comparison" ||
        step.type === "concept-map" ||
        step.type === "evidence-map" ||
        step.type === "signal-experiment") && (
        <IntelligentLesson
          step={step}
          value={parameters[String(index)] ?? (step.type === "signal-experiment" ? step.initial : 0)}
          evidence={lesson.evidence}
          onValue={(value) => void save(index, { ...currentState.current.parameters, [index]: value })}
          onReveal={reveal}
        />
      )}
      {step.type === "sandbox" && (
        <SandboxLesson
          key={`${lesson.id}-${index}-${expanded}`}
          step={step}
          savedState={widgetStates[String(index)] ?? {}}
          onSave={saveWidget}
          onEvidence={(id) => {
            const ref = lesson.evidence.find((e) => e.id === id)
            if (ref) reveal(ref)
          }}
          onError={onError}
          onEscape={() => setExpanded(false)}
        />
      )}
      {step.type === "explanation" && <p className="lesson-explanation">{step.text}</p>}
      {step.type === "diagram" && (
        <>
          <ol className="lesson-diagram">
            {step.nodes.map((node, i) => (
              <li key={node}>
                <span>{i + 1}</span>
                {node}
              </li>
            ))}
          </ol>
          <p>{step.text}</p>
        </>
      )}
      {step.type === "experiment" && (
        <div className="lesson-experiment">
          <p className="illustration-label">교육용 가상값 · 논문에서 복원한 자료가 아닙니다.</p>
          <p>{step.text}</p>
          <label>
            입력: {value} {step.unit}
            <input
              type="range"
              min={step.min}
              max={step.max}
              step={step.step}
              value={value}
              disabled={pending}
              onChange={(e) => {
                const next = { ...currentState.current.parameters, [index]: Number(e.target.value) }
                currentState.current.parameters = next
                setParameters(next)
              }}
              onPointerUp={() => void save(index, parameters)}
              onKeyUp={() => void save(index, parameters)}
            />
          </label>
          <output>
            {step.formula === "linear" ? "y = 2x" : "표준오차 ∝ 1/√n"} →{" "}
            {experimentValue(step.formula, value).toFixed(3)}
          </output>
          <svg viewBox="0 0 300 100" role="img" aria-label="입력에 따라 변하는 교육용 계산 결과">
            <path d="M10 5 V90 H290" fill="none" stroke="currentColor" />
            <polyline
              points={Array.from({ length: 30 }, (_, i) => {
                const x = step.min + ((step.max - step.min) * i) / 29
                const max = experimentValue(step.formula, step.formula === "linear" ? step.max : step.min)
                return `${10 + i * 9.5},${90 - (75 * experimentValue(step.formula, x)) / max}`
              }).join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
            />
            <circle
              cx={10 + (285 * (value - step.min)) / (step.max - step.min)}
              cy={
                90 -
                (75 * experimentValue(step.formula, value)) /
                  experimentValue(step.formula, step.formula === "linear" ? step.max : step.min)
              }
              r="5"
              fill="var(--accent)"
            />
          </svg>
        </div>
      )}
      {(step.type === "quiz" || step.type === "prediction") && (
        <div className="lesson-quiz">
          <p>{step.question}</p>
          <fieldset>
            <legend className="sr-only">답변 선택</legend>
            {step.options.map((option, i) => (
              <label key={option} data-selected={selectedChoice === i}>
                <input
                  type="radio"
                  name={`${lesson.id}-${index}`}
                  checked={selectedChoice === i}
                  onChange={() => setChoice(i)}
                />
                {option}
              </label>
            ))}
          </fieldset>
          <div className="study-actions">
            <button
              type="button"
              disabled={selectedChoice === null || pending}
              onClick={() => void submit(false)}
            >
              답변 확인
            </button>
            <button type="button" disabled={pending} onClick={() => void submit(true)}>
              정답 열어보기
            </button>
          </div>
          {last && (
            <div className="quiz-feedback" role="status">
              <strong>
                {last.revealed
                  ? "정답을 열람했습니다"
                  : last.correct
                    ? "잘 이해했습니다"
                    : "근거를 다시 확인해 보세요"}
              </strong>
              <p>내 답변: {last.response}</p>
              <p>{last.feedback}</p>
              <small>
                {last.revealed
                  ? "스스로 통과한 점검으로 기록하지 않습니다."
                  : "답변과 피드백이 저장되었습니다."}
              </small>
            </div>
          )}
        </div>
      )}
      <div className="lesson-evidence">
        <span>원문 확인</span>
        {step.evidenceIds.map((id) => {
          const evidence = lesson.evidence.find((e) => e.id === id)
          return evidence ? (
            <CitationChip
              key={id}
              evidence={evidence}
              onReveal={(ref) => {
                setExpanded(false)
                onReveal(ref)
              }}
            />
          ) : null
        })}
      </div>
      <nav className="lesson-navigation" aria-label="학습 단계">
        <button type="button" disabled={index === 0 || pending} onClick={() => void save(index - 1)}>
          이전
        </button>
        <span>{lesson.dataKind === "illustrative" ? "교육용 예시 포함" : "원문에 근거한 학습"}</span>
        {index < lesson.steps.length - 1 ? (
          <button type="button" disabled={pending} onClick={() => void save(index + 1)}>
            다음
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || !!saved?.completedAt}
            onClick={() => void save(index, parameters, true)}
          >
            {saved?.completedAt ? "수업 마침" : "수업 마치기"}
          </button>
        )}
      </nav>
    </section>
  )
  return expanded
    ? createPortal(
        <div ref={dialog} role="dialog" aria-modal="true" aria-label={lesson.title}>
          {content}
        </div>,
        document.body,
      )
    : content
}
