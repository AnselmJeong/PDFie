import type { PdfSourceBridge } from "../pdf/document-source-bridge"
import type { StudyLibrary } from "../persistence/study-library"

export async function linkLibraryPdf(
  library: StudyLibrary,
  bridge: PdfSourceBridge,
  hash: string,
  path: string,
) {
  library.require(hash)
  const registered = await bridge.register(path)
  // A library record must match its own content: wait for the hash (instant
  // for a file read before) rather than show another document's records.
  let identified: string | null = null
  try {
    identified = await bridge.identify(registered.documentId)
  } catch (cause) {
    bridge.closeDocument(registered.documentId)
    throw cause
  }
  const source = bridge.getSource(registered.documentId)
  if (identified !== hash) {
    bridge.closeDocument(source.documentId)
    throw new Error(
      "이 기록의 원문과 다른 PDF입니다. 같은 내용의 원본 파일을 선택하세요. 학습 기록은 그대로 보존됩니다.",
    )
  }
  library.remember(hash, source.fileName, bridge.persistentPath(source.documentId))
  return source
}
