import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { LibraryImportStatus } from "../../../../shared/study/library"
import { rpc } from "../../rpc"

export type LibraryImport = ReturnType<typeof useLibraryImport>

/** Polls the batch importer; choosing files or a folder starts a batch. */
export function useLibraryImport() {
  const [status, setStatus] = useState<LibraryImportStatus | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState("")
  const [dismissed, setDismissed] = useState<string | null>(null)
  const active = status?.phase === "scanning" || status?.phase === "importing"
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await rpc.request["library.import.status"]({})
        if (!cancelled) setStatus(next)
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "가져오기 상태를 확인하지 못했습니다.")
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 1200)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
  const choose = useCallback(async (kind: "files" | "folder") => {
    setChoosing(true)
    setError("")
    try {
      const next = await rpc.request["library.import.choose"]({ kind })
      setStatus(next)
      setDismissed(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일을 추가하지 못했습니다.")
    } finally {
      setChoosing(false)
    }
  }, [])
  const cancel = useCallback(async () => {
    try {
      setStatus(await rpc.request["library.import.cancel"]({}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  return {
    status,
    active,
    choosing,
    error,
    clearError: () => setError(""),
    choose,
    cancel,
    /** A finished batch stays visible until it is dismissed; a running one always shows. */
    visible: Boolean(status?.batchId && (active || dismissed !== status.batchId)),
    dismiss: () => setDismissed(status?.batchId ?? null),
  }
}

/** Batch import progress and results, shown above the catalog while relevant. */
export function LibraryImportBanner({ intake }: { intake: LibraryImport }) {
  const { status, active } = intake
  if (intake.error)
    return (
      <Banner
        className="library-import-banner"
        status="error"
        title="PDF를 서재에 추가하지 못했습니다"
        description={intake.error}
        isDismissable
        dismissLabel="알림 닫기"
        onDismiss={intake.clearError}
      />
    )
  if (!status || !intake.visible) return null
  const processed = status.added + status.duplicates + status.failed
  const title =
    status.phase === "scanning"
      ? "폴더에서 PDF를 찾고 있습니다"
      : active
        ? `PDF 본문을 분석하고 있습니다 · ${processed}/${status.total}`
        : status.phase === "cancelled"
          ? "가져오기를 중지했습니다"
          : "PDF 가져오기를 마쳤습니다"
  return (
    <Banner
      className="library-import-banner"
      status={active ? "info" : status.failed ? "warning" : "success"}
      title={title}
      description={`추가 ${status.added} · 중복 ${status.duplicates} · 실패 ${status.failed}${
        status.cancelled ? ` · 취소 ${status.cancelled}` : ""
      } · 주제 분류 완료 ${status.classifications.complete}, 대기 ${status.classifications.pending}, 확인 필요 ${status.classifications.needsAttention}`}
      isDismissable={!active}
      dismissLabel="가져오기 결과 닫기"
      onDismiss={intake.dismiss}
      collapsible={{ defaultIsOpen: false }}
      endContent={
        active ? (
          <Button
            size="sm"
            variant="secondary"
            label="가져오기 중지"
            icon={<X size={14} />}
            onClick={() => void intake.cancel()}
          />
        ) : undefined
      }
    >
      <div className="library-import-details">
        {active && status.total > 0 && (
          <ProgressBar
            label="PDF 가져오기 진행률"
            isLabelHidden
            max={status.total}
            value={status.total - status.pending}
          />
        )}
        {status.active && (
          <p>
            {status.active.name}
            {status.active.total
              ? ` · 본문 ${status.active.page}/${status.active.total}페이지`
              : " · 파일 확인 중"}
          </p>
        )}
        <p>
          원본 PDF의 현재 위치에 연결합니다. 하위 폴더를 포함해 찾고, 같은 내용의 파일은 한 번만 추가합니다.
          추가된 자료는 중지해도 남고, 분류 실패는 자료의 ‘분류’에서 다시 시도할 수 있습니다.
        </p>
        {(status.notes.length > 0 || status.issues.length > 0) && (
          <details>
            <summary>건너뛴 항목·확인할 내용 (최대 100개)</summary>
            <ul>
              {[...new Set(status.notes)].map((note) => (
                <li key={note}>{note}</li>
              ))}
              {status.issues.map((issue) => (
                <li key={issue.id}>
                  {issue.name} — {issue.error}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Banner>
  )
}
