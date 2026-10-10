import type { EvidenceRef } from "../../../../shared/study/contracts"
import { type IntelligentLessonStep, illustrativeSignal } from "../../../../shared/study/intelligent-ui"
import { CitationChip } from "./CitationChip"

export function IntelligentLesson({
  step,
  value,
  evidence,
  onValue,
  onReveal,
}: {
  step: Exclude<IntelligentLessonStep, { type: "sandbox" }>
  value: number
  evidence: EvidenceRef[]
  onValue: (value: number) => void
  onReveal: (ref: EvidenceRef) => void
}) {
  const citations = (ids: string[]) => (
    <div className="lesson-inline-evidence">
      {ids.map((id) => {
        const ref = evidence.find((e) => e.id === id)
        return ref ? <CitationChip key={id} evidence={ref} onReveal={onReveal} /> : null
      })}
    </div>
  )
  if (step.type === "comparison") {
    const selected = step.aspects[value] ?? step.aspects[0]!
    return (
      <div className="lesson-comparison">
        <p>{step.text}</p>
        <fieldset className="lesson-selectors" aria-label="비교 기준 선택">
          {step.aspects.map((aspect, i) => (
            <button type="button" key={aspect.label} aria-pressed={value === i} onClick={() => onValue(i)}>
              {aspect.label}
            </button>
          ))}
        </fieldset>
        <section className="lesson-table-scroll" aria-label={`${selected.label} 비교`}>
          <table>
            <caption>{selected.label}</caption>
            <thead>
              <tr>
                {step.concepts.map((concept) => (
                  <th scope="col" key={concept}>
                    {concept}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {selected.values.map((text, i) => (
                  <td key={step.concepts[i]}>{text}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
        {citations(selected.evidenceIds)}
      </div>
    )
  }
  if (step.type === "concept-map") {
    const selected = step.nodes[value] ?? step.nodes[0]!
    const linked = step.edges.filter((e) => e.from === value || e.to === value)
    return (
      <div className="lesson-concept-map">
        <p>{step.text}</p>
        <fieldset className="lesson-selectors" aria-label="개념 선택">
          {step.nodes.map((node, i) => (
            <button type="button" key={node.label} aria-pressed={value === i} onClick={() => onValue(i)}>
              {node.label}
            </button>
          ))}
        </fieldset>
        <div className="lesson-detail-panel" aria-live="polite">
          <strong>{selected.label}</strong>
          <p>{selected.detail}</p>
          {citations(selected.evidenceIds)}
        </div>
        <ul className="lesson-connections" aria-label="선택한 개념의 관계">
          {linked.map((edge) => (
            <li key={`${edge.from}-${edge.to}-${edge.label}`}>
              <div>
                <strong>{step.nodes[edge.from]?.label}</strong>
                <span aria-hidden="true"> → </span>
                <span>{edge.label}</span>
                <span aria-hidden="true"> → </span>
                <strong>{step.nodes[edge.to]?.label}</strong>
              </div>
              {citations(edge.evidenceIds)}
            </li>
          ))}
        </ul>
        {!linked.length && <p className="study-muted">이 발췌에서 확인된 연결이 없습니다.</p>}
      </div>
    )
  }
  if (step.type === "evidence-map") {
    const selected = step.claims[value] ?? step.claims[0]!
    return (
      <div className="lesson-evidence-map">
        <p>{step.text}</p>
        <fieldset className="lesson-selectors" aria-label="검토할 주장 선택">
          {step.claims.map((claim, i) => (
            <button type="button" key={claim.claim} aria-pressed={value === i} onClick={() => onValue(i)}>
              {claim.claim}
            </button>
          ))}
        </fieldset>
        <dl className="lesson-detail-panel" aria-live="polite">
          <dt>지지 근거</dt>
          <dd>
            {selected.support}
            {citations(selected.evidenceIds)}
          </dd>
          <dt>한계와 반론</dt>
          <dd>{selected.limitation}</dd>
          <dt>추가 검증 제안</dt>
          <dd>{selected.nextCheck}</dd>
        </dl>
      </div>
    )
  }
  const signal = illustrativeSignal(value)
  const baseline = illustrativeSignal(0)
  const path = (values: number[]) => values.map((v, i) => `${8 + i * 4},${v ? 15 : 65}`).join(" ")
  return (
    <div className="lesson-signal">
      <p className="illustration-label">교육용 이진 가상 신호 · 뇌 신호나 논문 측정값이 아닙니다.</p>
      <p>{step.text}</p>
      <label>
        무작위 치환 비율: {Math.round(value * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onValue(Number(e.target.value))}
        />
      </label>
      <div className="lesson-signal-plots">
        <figure>
          <figcaption>규칙적 교대 신호</figcaption>
          <svg viewBox="0 0 400 80" role="img" aria-label="0과 1이 번갈아 나타나는 규칙적 신호">
            <polyline points={path(baseline.values)} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </figure>
        <figure>
          <figcaption>조작한 신호</figcaption>
          <svg
            viewBox="0 0 400 80"
            role="img"
            aria-label={`무작위 치환 ${Math.round(value * 100)}퍼센트 신호`}
          >
            <polyline points={path(signal.values)} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          </svg>
        </figure>
      </div>
      <dl className="lesson-signal-metrics" aria-live="polite">
        <dt>단일 비트 Shannon 엔트로피</dt>
        <dd>
          {signal.entropy.toFixed(3)} bits · 교대 신호 {baseline.entropy.toFixed(3)}
        </dd>
        <dt>인접 비트가 바뀌는 비율</dt>
        <dd>
          {(signal.transitions * 100).toFixed(1)}% · 교대 신호 {(baseline.transitions * 100).toFixed(1)}%
        </dd>
      </dl>
      <p className="study-muted">
        비트 분포의 엔트로피가 비슷해도 시간적 구조는 다릅니다. 이 지표만으로 신경 복잡성, 의식 수준이나 임상
        상태를 판단할 수 없습니다.
      </p>
    </div>
  )
}
