import type { PluginRegistry } from "@embedpdf/core"
import type { PdfDocumentObject, PdfGlyphSlim } from "@embedpdf/models"
import type { SelectionScope } from "@embedpdf/plugin-selection"

interface SelectionPluginDocumentAccess {
  getCoreDocument(documentId: string): { document?: PdfDocumentObject } | null
}

function glyphsByCharacterIndex(scope: SelectionScope, pageIndex: number): Map<number, PdfGlyphSlim> {
  const geometry = scope.getState().geometry[pageIndex]
  const glyphs = new Map<number, PdfGlyphSlim>()
  for (const run of geometry?.runs ?? []) {
    run.glyphs.forEach((glyph, offset) => {
      glyphs.set(run.charStart + offset, glyph)
    })
  }
  return glyphs
}

function isSuppressedLineEndHyphen(
  glyph: PdfGlyphSlim | undefined,
  nextGlyph: PdfGlyphSlim | undefined,
): boolean {
  if (!glyph || !nextGlyph || glyph.width <= 0 || glyph.height <= 0) return false
  return Math.abs(nextGlyph.y - glyph.y) > Math.max(1, glyph.height * 0.5)
}

export async function getSelectedTextPreservingVisualHyphens(
  registry: PluginRegistry,
  documentId: string,
  scope: SelectionScope,
): Promise<string[]> {
  try {
    const plugin = registry.getPlugin("selection") as unknown as SelectionPluginDocumentAccess | null
    const document = plugin?.getCoreDocument(documentId)?.document
    if (!document) return await scope.getSelectedText().toPromise()

    const pageTexts: string[] = []
    const slices = scope.getState().slices
    for (const pageIndex of Object.keys(slices)
      .map(Number)
      .sort((left, right) => left - right)) {
      const slice = slices[pageIndex]
      if (!slice) continue
      const requests = Array.from({ length: slice.count }, (_, offset) => ({
        pageIndex,
        charIndex: slice.start + offset,
        charCount: 1,
      }))
      const textSlices = await registry.getEngine().getTextSlices(document, requests).toPromise()
      const glyphs = glyphsByCharacterIndex(scope, pageIndex)
      let text = ""
      textSlices.forEach((value, offset) => {
        if (value) {
          text += value
          return
        }
        const characterIndex = slice.start + offset
        if (isSuppressedLineEndHyphen(glyphs.get(characterIndex), glyphs.get(characterIndex + 1))) {
          text += "-\n"
        }
      })
      pageTexts.push(text.replaceAll("\r\n", "\n").replaceAll("\r", "\n"))
    }
    return pageTexts.length ? pageTexts : await scope.getSelectedText().toPromise()
  } catch {
    return await scope.getSelectedText().toPromise()
  }
}
