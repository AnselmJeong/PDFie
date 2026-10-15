import { Files, FolderPlus, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { LibraryImportStatus } from "../../../../shared/study/library"
import { rpc } from "../../rpc"

export function LibraryIntake() {
  const [status, setStatus] = useState<LibraryImportStatus | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState(false)
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
  const choose = async (kind: "files" | "folder") => {
    setChoosing(true)
    setError("")
    try {
      const next = await rpc.request["library.import.choose"]({ kind })
      setStatus(next)
      setExpanded(Boolean(next.batchId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일을 추가하지 못했습니다.")
    } finally {
      setChoosing(false)
    }
  }
  return (
    <section className="library-intake" aria-label="서재에 PDF 추가">
      <div className="library-intake-toolbar">
        <span>서재에 추가</span>
        <button type="button" disabled={choosing || active} onClick={() => void choose("files")}>
          <Files size={15} />
          PDF 여러 개
        </button>
        <button type="button" disabled={choosing || active} onClick={() => void choose("folder")}>
          <FolderPlus size={15} />
          폴더 추가
        </button>
        <span className="library-intake-hint">하위 폴더 포함 · 중복 제외 · 본문 분석 후 자동 분류</span>
        {status?.batchId && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {active
              ? status.phase === "scanning"
                ? "PDF 찾는 중…"
                : `${status.added + status.duplicates + status.failed}/${status.total}개 처리`
              : "최근 가져오기 결과"}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {status?.batchId && (expanded || active) && (
        <div className="library-intake-status">
          <div className="library-intake-toolbar" aria-live="polite">
            <strong>
              {status.phase === "scanning"
                ? "폴더를 검색하고 있습니다"
                : active
                  ? "PDF 본문을 분석하고 있습니다"
                  : status.phase === "cancelled"
                    ? "가져오기를 중지했습니다"
                    : "파일 가져오기 완료"}
            </strong>
            {active && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    setStatus(await rpc.request["library.import.cancel"]({}))
                  } catch (cause) {
                    setError(String(cause))
                  }
                }}
              >
                <X size={14} />
                가져오기 중지
              </button>
            )}
          </div>
          <p>
            발견 {status.total}개 · 추가 {status.added}개 · 중복 {status.duplicates}개 · 실패 {status.failed}
            개{status.cancelled ? ` · 취소 ${status.cancelled}개` : ""}
          </p>
          {status.active && (
            <p>
              {status.active.name}
              {status.active.total
                ? ` · 본문 ${status.active.page}/${status.active.total}페이지`
                : " · 파일 확인 중"}
            </p>
          )}
          {active && status.total > 0 && (
            <progress
              aria-label="PDF 가져오기 진행률"
              max={status.total}
              value={status.total - status.pending}
            />
          )}
          <p>
            주제 분류: 완료 {status.classifications.complete}개 · 대기·처리 중{" "}
            {status.classifications.pending}개 · 확인 필요 {status.classifications.needsAttention}개
          </p>
          <p className="library-intake-hint">
            원본 PDF의 현재 위치에 연결합니다. 추가된 자료는 중지해도 남고, 분류 실패는 자료의 ‘분류’에서 다시
            시도할 수 있습니다.
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
      )}
    </section>
  )
}
