import { Button } from "@astryxdesign/core/Button"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { Selector } from "@astryxdesign/core/Selector"
import { TextInput } from "@astryxdesign/core/TextInput"
import { useState } from "react"
import type { LibraryFacets, TopicChangePreview } from "../../../../shared/study/library"
import { rpc } from "../../rpc"

/** Rename a topic or merge it into another, after previewing every affected paper. */
export function TopicCleanupDialog({
  facets,
  isOpen,
  onOpenChange,
  onChanged,
}: {
  facets: LibraryFacets
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onChanged: () => void
}) {
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
  const mergeTargets = facets.topics.filter((topic) => topic.name !== source).slice(0, 12)
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={480} purpose="form">
      <DialogHeader
        title="주제 정리"
        subtitle="이름을 바꾸거나 다른 주제로 합칩니다. 기존 자료는 자동으로 다시 나누지 않습니다."
        onOpenChange={onOpenChange}
      />
      <div className="topic-cleanup">
        <Selector
          label="정리할 주제"
          placeholder="주제 선택"
          value={source || undefined}
          isDisabled={busy}
          hasSearch={facets.topics.length > 8}
          searchPlaceholder="주제 검색"
          options={facets.topics.map((topic) => ({
            value: topic.name,
            label: `${topic.name} (${topic.count})`,
          }))}
          onChange={(value) => {
            setSource(value ?? "")
            setPreview(null)
          }}
        />
        <TextInput
          label="새 이름 또는 합칠 주제"
          placeholder="예: 인지 발달"
          value={target}
          isDisabled={busy}
          onChange={(value) => {
            setTarget(value)
            setPreview(null)
          }}
        />
        {source && mergeTargets.length > 0 && (
          <div className="topic-cleanup-targets">
            <span>기존 주제로 합치기</span>
            {mergeTargets.map((topic) => (
              <button
                type="button"
                key={topic.name}
                aria-pressed={target === topic.name}
                onClick={() => {
                  setTarget(topic.name)
                  setPreview(null)
                }}
              >
                {topic.name}
              </button>
            ))}
          </div>
        )}
        {preview && (
          <div className="topic-cleanup-preview" role="status">
            <strong>
              ‘{preview.source}’ → ‘{preview.target}’ {preview.merge ? "주제로 합치기" : "이름 변경"}
            </strong>
            <p>
              보관함을 포함해 {preview.count}개 자료가 바뀝니다. 직접 지정한 자료 {preview.manualCount}개도
              포함됩니다. 학습 기록과 컬렉션은 유지되고, 이전 이름은 새 이름으로 연결되어 이후 AI 분류에서도
              새 이름을 씁니다.
            </p>
          </div>
        )}
        {notice && (
          <p className="topic-cleanup-notice" role="status">
            {notice}
          </p>
        )}
      </div>
      <footer className="dialog-footer">
        {canUndo && (
          <Button
            variant="ghost"
            label="방금 변경 되돌리기"
            isDisabled={busy}
            onClick={() =>
              void act(async () => {
                await rpc.request["library.topics.undo"]({})
                setCanUndo(false)
                setNotice("이전 주제로 되돌렸습니다.")
                onChanged()
              })
            }
          />
        )}
        <span className="dialog-footer-spacer" />
        {preview ? (
          <Button
            variant="primary"
            label={`${preview.count}개 자료의 주제 변경`}
            isLoading={busy}
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
          />
        ) : (
          <Button
            variant="primary"
            label="변경 범위 확인"
            isDisabled={!source || !target.trim()}
            isLoading={busy}
            onClick={() =>
              void act(async () => {
                setPreview(await rpc.request["library.topics.preview"]({ source, target }))
              })
            }
          />
        )}
      </footer>
    </Dialog>
  )
}
