import { useState } from "react"
import type { LibraryFacets, TopicChangePreview } from "../../../../shared/study/library"
import { rpc } from "../../rpc"

export function LibraryTopics({ facets, onChanged }: { facets: LibraryFacets; onChanged: () => void }) {
  const [source, setSource] = useState("")
  const [target, setTarget] = useState("")
  const [preview, setPreview] = useState<TopicChangePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [canUndo, setCanUndo] = useState(false)
  const act = async (work: () => Promise<void>) => {
    setBusy(true)
    setNotice("")
    try {
      await work()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "주제를 변경하지 못했습니다.")
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="library-topics-manager">
      <summary>주제 정리 · 이름 변경·합치기</summary>
      <p>새 PDF는 기존 주제를 우선 사용합니다. 기존 자료의 분류는 자동으로 다시 나누지 않습니다.</p>
      <div className="library-topics-fields">
        <label>
          정리할 주제
          <select
            value={source}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value)
              setPreview(null)
            }}
          >
            <option value="">주제 선택</option>
            {facets.topics.map((topic) => (
              <option key={topic.name} value={topic.name}>
                {topic.name} ({topic.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          바꿀 이름 또는 합칠 주제
          <input
            value={target}
            list="topic-merge-targets"
            maxLength={80}
            disabled={busy}
            placeholder="예: 인지 발달"
            onChange={(e) => {
              setTarget(e.target.value)
              setPreview(null)
            }}
          />
        </label>
        <datalist id="topic-merge-targets">
          {facets.topics.map((topic) => (
            <option key={topic.name} value={topic.name} />
          ))}
        </datalist>
        <button
          type="button"
          disabled={busy || !source || !target.trim()}
          onClick={() =>
            void act(async () => {
              setPreview(await rpc.request["library.topics.preview"]({ source, target }))
            })
          }
        >
          변경 범위 확인
        </button>
      </div>
      {preview && (
        <div className="library-topics-preview">
          <p>
            ‘{preview.source}’ → ‘{preview.target}’ {preview.merge ? "주제로 합치기" : "이름 변경"}
          </p>
          <p>
            보관함 포함 {preview.count}개 자료가 바뀝니다. 직접 지정한 자료 {preview.manualCount}개도
            포함됩니다. 학습 기록과 컬렉션은 유지됩니다.
          </p>
          <p>이전 이름은 새 이름으로 연결해, 이후 AI 분류에서도 새 이름을 사용합니다.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await rpc.request["library.topics.apply"](preview)
                setCanUndo(true)
                setPreview(null)
                setSource("")
                setTarget("")
                setNotice("주제를 정리했습니다.")
                onChanged()
              })
            }
          >
            {preview.count}개 자료의 주제 변경
          </button>
        </div>
      )}
      {canUndo && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await rpc.request["library.topics.undo"]({})
              setCanUndo(false)
              setNotice("이전 주제로 되돌렸습니다.")
              onChanged()
            })
          }
        >
          방금 변경 되돌리기
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  )
}
