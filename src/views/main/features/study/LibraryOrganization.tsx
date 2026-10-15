import { useEffect, useState } from "react"
import type { LibraryDocument, LibraryFacets } from "../../../../shared/study/library"
import { rpc } from "../../rpc"

export function LibraryOrganization({
  document,
  facets,
  onSaved,
  onError,
}: {
  document: LibraryDocument
  facets: LibraryFacets
  onSaved: () => void
  onError: (error: string) => void
}) {
  const [topic, setTopic] = useState(document.topic)
  const [ids, setIds] = useState(document.collections.map((c) => c.id))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [topicEdited, setTopicEdited] = useState(false)
  const classification = document.classification
  const pending = classification?.state === "queued" || classification?.state === "running"
  useEffect(() => {
    if (!topicEdited) setTopic(document.topic)
  }, [document.topic, topicEdited])
  return (
    <details className="library-organization">
      <summary>
        분류 · {document.topic || "미분류"}
        {document.collections.length ? ` · 컬렉션 ${document.collections.length}개` : ""}
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (saving) return
          setSaving(true)
          setSaved(false)
          try {
            await rpc.request["library.update"]({
              documentHash: document.documentHash,
              ...(topicEdited ? { topic } : {}),
              collectionIds: ids,
            })
            setSaved(true)
            setTopicEdited(false)
            onSaved()
          } catch (cause) {
            onError(cause instanceof Error ? cause.message : "분류를 저장하지 못했습니다.")
          } finally {
            setSaving(false)
          }
        }}
      >
        <label htmlFor="paper-topic">주제</label>
        <input
          id="paper-topic"
          list="library-topics"
          maxLength={80}
          placeholder="예: 네트워크 신경과학"
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value)
            setTopicEdited(true)
            setSaved(false)
          }}
        />
        <datalist id="library-topics">
          {facets.topics.map((item) => (
            <option key={item.name} value={item.name} />
          ))}
        </datalist>
        <div className="library-topic-status" aria-live="polite">
          <p>
            {classification?.state === "complete"
              ? "AI 자동 분류"
              : classification?.state === "manual"
                ? "직접 지정한 주제"
                : pending
                  ? "AI 분류 중…"
                  : "AI 자동 분류"}
            {classification?.model && ` · ${classification.model}`}
          </p>
          <p>{classification?.reason || "저장된 논문 본문을 바탕으로 자동 분류합니다."}</p>
          {classification?.pages?.length ? (
            <p>본문 발췌 {classification.pages.length}개 페이지 기준 · 언제든 수정할 수 있습니다.</p>
          ) : null}
          <button
            type="button"
            disabled={pending || saving || topicEdited}
            onClick={async () => {
              setSaving(true)
              try {
                await rpc.request["library.classify"]({ documentHash: document.documentHash })
                onSaved()
              } catch (cause) {
                onError(cause instanceof Error ? cause.message : "분류를 시작하지 못했습니다.")
              } finally {
                setSaving(false)
              }
            }}
          >
            {pending
              ? "자동 분류 대기·처리 중"
              : document.topic
                ? "AI로 주제 다시 지정"
                : "AI 분류 다시 시도"}
          </button>
          <p>직접 수정해 저장한 주제는 자동으로 덮어쓰지 않습니다.</p>
        </div>
        <fieldset>
          <legend>컬렉션 · 여러 개 선택 가능</legend>
          {facets.collections.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={ids.includes(item.id)}
                onChange={(event) => {
                  setIds((previous) =>
                    event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id),
                  )
                  setSaved(false)
                }}
              />
              {item.name}
            </label>
          ))}
          {!facets.collections.length && <p>서재 왼쪽의 ‘컬렉션 만들기’로 연구 묶음을 추가하세요.</p>}
        </fieldset>
        <div>
          <button type="submit" disabled={saving}>
            {saving ? "저장 중…" : "분류 저장"}
          </button>
          {saved && <span role="status">저장했습니다.</span>}
        </div>
      </form>
    </details>
  )
}
