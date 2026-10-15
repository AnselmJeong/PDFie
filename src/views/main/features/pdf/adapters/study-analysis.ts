import type { PluginRegistry } from "@embedpdf/core"
import type { PdfDocumentObject, PdfTask, PdfTextRun } from "@embedpdf/models"
import type { PdfOutlineNode } from "../../../../../shared/pdf/domain"
import {
  analysisByteLength,
  MAX_PAGE_ANALYSIS_BYTES,
  MAX_PAGE_BLOCKS,
  type PageAnalysis,
} from "../../../../../shared/study/contracts"
import { groupNativeRuns } from "../../../../../shared/study/native-page-analysis"

export { groupNativeRuns } from "../../../../../shared/study/native-page-analysis"

interface NativeAccess {
  getCoreDocument(id: string): { document?: PdfDocumentObject } | null
}
export function nativeDocument(registry: PluginRegistry, id: string) {
  const selection = registry.getPlugin("selection") as unknown as NativeAccess | null
  const document = selection?.getCoreDocument(id)?.document
  if (!document) throw new Error("PDF 원문 분석 기능을 준비하지 못했습니다.")
  return document
}
export function beginNativeAnalysis(
  registry: PluginRegistry,
  sdkDocumentId: string,
  sourceId: string,
  pageCount: number,
  outline: PdfOutlineNode[],
  onChange: () => void,
  onError: (message: string) => void,
) {
  let cancelled = false
  let task: Pick<PdfTask<unknown>, "abort"> | null = null
  const run = async () => {
    const { rpc } = await import("../../../rpc")
    const document = nativeDocument(registry, sdkDocumentId)
    const begin = await rpc.request["study.index.begin"]({ documentId: sourceId, pageCount, outline })
    const cached = new Set(begin.completedPages)
    for (let pageIndex = 0; pageIndex < pageCount && !cancelled; pageIndex++) {
      if (cached.has(pageIndex)) continue
      const page = document.pages[pageIndex]
      if (!page) continue
      const data: PageAnalysis = {
        pageIndex,
        width: page.size.width,
        height: page.size.height,
        status: "failed",
        blocks: [],
      }
      try {
        const geometryTask = registry.getEngine().getPageGeometry(document, page)
        task = geometryTask
        const geometry = await geometryTask.toPromise()
        if (cancelled) return
        if (geometry.runs.length > 50000) throw new Error("페이지의 텍스트 조각이 처리 한도를 초과했습니다.")
        const textTask = registry.getEngine().getTextSlices(
          document,
          geometry.runs.map((run) => ({ pageIndex, charIndex: run.charStart, charCount: run.glyphs.length })),
        )
        task = textTask
        const texts = await textTask.toPromise()
        if (cancelled) return
        let richRuns: PdfTextRun[] | undefined
        try {
          const styleTask = registry.getEngine().getPageTextRuns(document, page)
          task = styleTask
          richRuns = (await styleTask.toPromise()).runs
        } catch {
          // Geometry remains usable when a PDF has no readable font metadata.
        }
        if (cancelled) return
        data.blocks = groupNativeRuns(geometry, texts, page.size.width, page.size.height, richRuns)
        data.status = data.blocks.length ? "ready" : "needs-ocr"
      } catch (cause) {
        if (cancelled) return
        data.error =
          cause instanceof Error ? cause.message.slice(0, 1000) : "원문 텍스트를 추출하지 못했습니다."
      }
      if (analysisByteLength(data) > MAX_PAGE_ANALYSIS_BYTES || data.blocks.length > MAX_PAGE_BLOCKS) {
        data.status = "failed"
        data.blocks = []
        data.error = "페이지 분석 데이터가 저장 한도를 초과했습니다."
      }
      await rpc.request["study.index.page"]({ documentId: sourceId, page: data })
      if (cancelled) return
      if (pageIndex % 3 === 0 || pageIndex === pageCount - 1) onChange()
      // Yield between pages so reading and selection keep priority.
      await new Promise<void>((resolve) => setTimeout(resolve, 15))
    }
    if (!cancelled) onChange()
  }
  void run().catch((cause) => {
    if (!cancelled) onError(cause instanceof Error ? cause.message : "문서 분석을 완료하지 못했습니다.")
  })
  return () => {
    cancelled = true
    task?.abort({ code: 5, message: "Document closed" })
  }
}
