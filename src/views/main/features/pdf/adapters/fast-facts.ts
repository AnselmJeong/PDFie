import type { PluginRegistry } from "@embedpdf/core"
import type { PdfDocumentObject, PdfPageGeometry, PdfTask } from "@embedpdf/models"
import type { PdfFastFacts } from "../../../../../shared/pdf/classification"
import type { PdfOutlineNode } from "../../../../../shared/pdf/domain"

interface SelectionAccess {
  getCoreDocument(documentId: string): { document?: PdfDocumentObject } | null
  getOrLoadGeometry(documentId: string, pageIndex: number): PdfTask<PdfPageGeometry>
}

function characterCount(geometry: PdfPageGeometry): number {
  return geometry.runs.reduce((maximum, run) => Math.max(maximum, run.charStart + run.glyphs.length), 0)
}

async function pageText(
  registry: PluginRegistry,
  plugin: SelectionAccess,
  document: PdfDocumentObject,
  documentId: string,
  pageIndex: number,
) {
  const geometry = await plugin.getOrLoadGeometry(documentId, pageIndex).toPromise()
  const count = characterCount(geometry)
  if (!count) return ""
  return (
    (
      await registry
        .getEngine()
        .getTextSlices(document, [{ pageIndex, charIndex: 0, charCount: count }])
        .toPromise()
    )[0] ?? ""
  )
}

export async function collectPdfFastFacts(
  registry: PluginRegistry,
  documentId: string,
  pageCount: number,
  outline: PdfOutlineNode[],
): Promise<PdfFastFacts> {
  const plugin = registry.getPlugin("selection") as unknown as SelectionAccess | null
  const document = plugin?.getCoreDocument(documentId)?.document
  if (!plugin || !document) throw new Error("PDF text capability is unavailable")
  const firstIndexes = Array.from({ length: Math.min(3, pageCount) }, (_, index) => index)
  const lateStart = Math.max(0, Math.floor(pageCount * 0.8))
  const lateIndexes = Array.from(
    { length: Math.min(3, pageCount - lateStart) },
    (_, index) => lateStart + index,
  )
  const [firstPages, latePages] = await Promise.all([
    Promise.all(firstIndexes.map((index) => pageText(registry, plugin, document, documentId, index))),
    Promise.all(lateIndexes.map((index) => pageText(registry, plugin, document, documentId, index))),
  ])
  return { pageCount, firstPagesText: firstPages.join("\n"), latePagesText: latePages.join("\n"), outline }
}
