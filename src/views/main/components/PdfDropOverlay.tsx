import { FileUp } from "lucide-react"

export function PdfDropOverlay({ uploading }: { uploading: boolean }) {
  return (
    <div className="pdf-drop-overlay" role="status" aria-live="polite">
      <div className="pdf-drop-card">
        <span className="pdf-drop-icon" aria-hidden="true">
          <FileUp size={30} strokeWidth={1.6} />
        </span>
        <strong>{uploading ? "PDF를 여는 중…" : "여기에 PDF를 놓으세요"}</strong>
        <span>{uploading ? "문서를 안전하게 준비하고 있습니다." : "현재 문서는 자동으로 교체됩니다."}</span>
      </div>
    </div>
  )
}
