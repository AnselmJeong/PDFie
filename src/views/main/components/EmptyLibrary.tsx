import { FileText, FolderOpen, LockKeyhole, MessageSquareText } from "lucide-react"

export function EmptyLibrary({ onOpen, opening }: { onOpen: () => void; opening: boolean }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-brand" role="img" aria-label="PDFie">
        <span className="brand-mark">P</span>
        <span>PDFie</span>
      </div>
      <section className="welcome-copy">
        <p className="eyebrow">Academic PDF reader for macOS</p>
        <h1>
          논문과 책을
          <br />
          원본 그대로 읽으세요.
        </h1>
        <p className="welcome-lede">
          정확한 문장 선택과 페이지 근거를 유지하면서, 필요한 순간에만 AI와 대화합니다.
        </p>
        <button className="primary-action" type="button" onClick={onOpen} disabled={opening}>
          <FolderOpen size={17} />
          {opening ? "여는 중…" : "PDF 열기"}
          <kbd>⌘O</kbd>
        </button>
        <p className="drop-hint">또는 Finder에서 PDF를 이 창에 끌어놓으세요.</p>
      </section>
      <ul className="welcome-rules" aria-label="PDFie 핵심 기능">
        <li>
          <FileText size={16} />
          <span>
            <strong>원본 PDF</strong>를 변환 없이 표시
          </span>
        </li>
        <li>
          <MessageSquareText size={16} />
          <span>
            선택한 구절을 <strong>page context</strong>와 함께 질문
          </span>
        </li>
        <li>
          <LockKeyhole size={16} />
          <span>
            파일은 로컬에 두고 <strong>필요한 text만</strong> 전송
          </span>
        </li>
      </ul>
      <div className="paper-ghost" aria-hidden="true">
        <div className="paper-line line-short" />
        <div className="paper-title" />
        <div className="paper-line" />
        <div className="paper-line" />
        <div className="paper-line line-mid" />
        <div className="paper-columns">
          <span />
          <span />
        </div>
      </div>
    </main>
  )
}
