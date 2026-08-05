import type { PluginRegistry } from "@embedpdf/core"
import type { PdfDocumentObject, PdfPageGeometry, PdfTask, Rect } from "@embedpdf/models"
import type { SelectionCapability, SelectionRangeX } from "@embedpdf/plugin-selection"
import { normalizeSelectionText } from "../../../../../shared/pdf/selection"
import { getSelectedTextPreservingVisualHyphens } from "../adapters/selection-text"

interface GoldenCase {
  fixture: string
  caseId: string
  expectedText: string
  expectedPages: number[]
  notes: string
}

interface CoreDocumentState {
  document?: PdfDocumentObject
}

interface SelectionPluginTestAccess {
  getCoreDocument(documentId: string): CoreDocumentState | null
  getOrLoadGeometry(documentId: string, pageIndex: number): PdfTask<PdfPageGeometry>
  getSelectedText(documentId: string): PdfTask<string[]>
  applyInstantSelection(documentId: string, page: number, from: number, to: number, modeId: string): void
  updateRectsAndSlices(documentId: string, range: SelectionRangeX): void
  dispatch(action: { type: string; payload: unknown }): void
  provides(): SelectionCapability
  engine: {
    getTextSlices(
      document: PdfDocumentObject,
      requests: Array<{ pageIndex: number; charIndex: number; charCount: number }>,
    ): PdfTask<string[]>
  }
}

export interface GoldenSelectionResult {
  fixture: string
  caseId: string
  passed: boolean
  expectedText: string
  actualText: string
  expectedPages: number[]
  actualPages: number[]
  rects: Array<{ pageIndex: number; rect: Rect; segmentRects: Rect[] }>
  notes: string
  error?: string
}

function geometryCharacterCount(geometry: PdfPageGeometry): number {
  return geometry.runs.reduce((maximum, run) => Math.max(maximum, run.charStart + run.glyphs.length), 0)
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

interface PageTextIndex {
  text: string
  glyphAtTextOffset: number[]
  emptyGlyphs: Array<{ glyphIndex: number; flags: number; x: number; y: number }>
}

async function buildPageTextIndex(
  plugin: SelectionPluginTestAccess,
  document: PdfDocumentObject,
  documentId: string,
  pageIndex: number,
): Promise<PageTextIndex> {
  const geometry = await plugin.getOrLoadGeometry(documentId, pageIndex).toPromise()
  const count = geometryCharacterCount(geometry)
  if (!count) return { text: "", glyphAtTextOffset: [], emptyGlyphs: [] }

  const slices = await plugin.engine
    .getTextSlices(
      document,
      Array.from({ length: count }, (_, charIndex) => ({ pageIndex, charIndex, charCount: 1 })),
    )
    .toPromise()
  const raw: Array<{ character: string; glyphIndex: number }> = []
  const glyphs = new Map(
    geometry.runs.flatMap((run) =>
      run.glyphs.map((glyph, offset) => [run.charStart + offset, glyph] as const),
    ),
  )
  slices.forEach((slice, glyphIndex) => {
    if (slice) {
      for (const character of slice) raw.push({ character, glyphIndex })
      return
    }
    const glyph = glyphs.get(glyphIndex)
    const nextGlyph = glyphs.get(glyphIndex + 1)
    if (
      glyph &&
      nextGlyph &&
      glyph.width > 0 &&
      glyph.height > 0 &&
      Math.abs(nextGlyph.y - glyph.y) > Math.max(1, glyph.height * 0.5)
    ) {
      raw.push({ character: "-", glyphIndex }, { character: "\n", glyphIndex })
    }
  })
  const emptyGlyphs = geometry.runs.flatMap((run) =>
    run.glyphs.flatMap((glyph, offset) => {
      const glyphIndex = run.charStart + offset
      return slices[glyphIndex] ? [] : [{ glyphIndex, flags: glyph.flags, x: glyph.x, y: glyph.y }]
    }),
  )

  let text = ""
  const glyphAtTextOffset: number[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index]
    if (!token) continue
    if (token.character === "\r") {
      if (raw[index + 1]?.character === "\n") index += 1
      text += "\n"
      glyphAtTextOffset.push(token.glyphIndex)
      continue
    }
    if (token.character === "\n") {
      text += "\n"
      glyphAtTextOffset.push(token.glyphIndex)
      continue
    }
    for (const character of token.character.normalize("NFKC")) {
      text += /\s/u.test(character) ? " " : character
      glyphAtTextOffset.push(token.glyphIndex)
    }
  }
  return { text, glyphAtTextOffset, emptyGlyphs }
}

function setCrossPageSelection(
  plugin: SelectionPluginTestAccess,
  documentId: string,
  range: SelectionRangeX,
): void {
  plugin.dispatch({ type: "SELECTION/START_SELECTION", payload: { documentId } })
  plugin.dispatch({ type: "SELECTION/SET_SELECTION", payload: { documentId, selection: range } })
  plugin.updateRectsAndSlices(documentId, range)
  plugin.dispatch({ type: "SELECTION/END_SELECTION", payload: { documentId } })
}

export async function runGoldenSelectionCases(
  registry: PluginRegistry,
  documentId: string,
  fixture: string,
): Promise<GoldenSelectionResult[]> {
  const response = await fetch("views://main/qa/golden-selection-cases.json")
  const allCases = (await response.json()) as GoldenCase[]
  const cases = allCases.filter((testCase) => testCase.fixture === fixture)
  const plugin = registry.getPlugin("selection") as unknown as SelectionPluginTestAccess | null
  if (!plugin) throw new Error("Selection plugin is not registered")
  const document = plugin.getCoreDocument(documentId)?.document
  if (!document) throw new Error("PDF document is not loaded")

  const results: GoldenSelectionResult[] = []
  for (const testCase of cases) {
    try {
      const pageIndexes = testCase.expectedPages.map((page) => page - 1)
      if (pageIndexes.length === 0) {
        const { text } = await buildPageTextIndex(plugin, document, documentId, 0)
        results.push({
          fixture,
          caseId: testCase.caseId,
          passed: text.length === 0,
          expectedText: testCase.expectedText,
          actualText: text,
          expectedPages: [],
          actualPages: [],
          rects: [],
          notes: testCase.notes,
        })
        continue
      }

      const pageTexts = new Map<number, PageTextIndex>()
      for (const pageIndex of pageIndexes) {
        pageTexts.set(pageIndex, await buildPageTextIndex(plugin, document, documentId, pageIndex))
      }

      const expectedParts = normalizeLineEndings(testCase.expectedText).split("\n")
      const firstPage = pageIndexes[0]
      const lastPage = pageIndexes.at(-1)
      if (firstPage === undefined || lastPage === undefined) throw new Error("Golden case has no page")
      const startNeedle =
        pageIndexes.length === 1 ? normalizeSelectionText(testCase.expectedText) : (expectedParts[0] ?? "")
      const endNeedle =
        pageIndexes.length === 1
          ? normalizeSelectionText(testCase.expectedText)
          : (expectedParts.at(-1) ?? "")
      const firstText = pageTexts.get(firstPage)
      const lastText = pageTexts.get(lastPage)
      if (!firstText || !lastText) throw new Error("PDFium page text index is unavailable")
      const startOffset = firstText.text.indexOf(startNeedle)
      const endOffset = lastText.text.indexOf(endNeedle)
      if (startOffset < 0 || endOffset < 0) {
        throw new Error(
          `Expected text was not found in PDFium text slices: ${JSON.stringify(firstText.text.slice(0, 240))}; empty glyphs: ${JSON.stringify(firstText.emptyGlyphs.slice(0, 24))}`,
        )
      }
      const start = firstText.glyphAtTextOffset[startOffset]
      const end = lastText.glyphAtTextOffset[endOffset + endNeedle.length - 1]
      if (start === undefined || end === undefined) throw new Error("PDF glyph index mapping failed")

      if (firstPage === lastPage) {
        plugin.applyInstantSelection(documentId, firstPage, start, end, "golden-qa")
      } else {
        setCrossPageSelection(plugin, documentId, {
          start: { page: firstPage, index: start },
          end: { page: lastPage, index: end },
        })
      }

      const scope = plugin.provides().forDocument(documentId)
      const actualText = normalizeLineEndings(
        (await getSelectedTextPreservingVisualHyphens(registry, documentId, scope)).join("\n"),
      )
      const rects = scope.getFormattedSelection()
      const actualPages = [...new Set(rects.map((selection) => selection.pageIndex + 1))]
      results.push({
        fixture,
        caseId: testCase.caseId,
        passed:
          normalizeSelectionText(actualText) === normalizeSelectionText(testCase.expectedText) &&
          JSON.stringify(actualPages) === JSON.stringify(testCase.expectedPages) &&
          rects.every((selection) => selection.segmentRects.length > 0),
        expectedText: testCase.expectedText,
        actualText,
        expectedPages: testCase.expectedPages,
        actualPages,
        rects,
        notes: testCase.notes,
      })
    } catch (error) {
      results.push({
        fixture,
        caseId: testCase.caseId,
        passed: false,
        expectedText: testCase.expectedText,
        actualText: "",
        expectedPages: testCase.expectedPages,
        actualPages: [],
        rects: [],
        notes: testCase.notes,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
