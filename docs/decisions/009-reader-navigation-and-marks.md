# ADR 009: Fast opening, navigation, layout and marks

Status: Accepted  
Date: 2026-11-17

Context: `docs/update_plan.md` compared PDFie with SoloPDF (Tauri + PDF.js) and recommended porting its reading features onto PDFie's existing EmbedPDF/PDFium reader instead of replacing the engine.

## Decisions

**Open first, identify in the background.** `PdfSourceBridge.register` reads only the PDF header and the file's fingerprint (inode, size, modification and status-change times). A file PDFie has hashed before and that is unchanged is identified from `pdfie-hash-cache-v1.json`; the library importer seeds that cache with the hash it already computes. Any other file is served by range at once and hashed in the background. Until `pdf.identify` returns, the source has `documentHash: null`: hash-bound features (annotations, captures, study panel, saved view) are blocked or show a pending state, so no other document's records can appear. Backend study handlers wait for the hash. The view logs `[open] … first page ready in N ms`, and the bridge logs how long identification took.

**Back/forward history over jumps only.** Outline, search results, the page field, the annotation list, evidence, PDF links and reference previews record a jump (page and the top of the visible part of the page). Scrolling and page turns do not. ⌘[ / ⌘], the dock arrows and mouse back/forward buttons walk the history; the evidence notice's "읽던 페이지로" is a back step.

**Links and references without blocking selection.** A per-page `ReferenceLayer` registers interaction-manager handlers alongside text selection in `pointerMode`: it previews on hover and follows only a click that did not drag. Targets are PDF link annotations (internal destinations converted from PDF user space; web/mail links open through `app.openExternal`, other schemes are refused) and textual mentions — "Figure 3", "Table S2", "그림 2", "[4–6, 9]" — found in PDFium's page text with glyph boxes. Mentions resolve against captions and bibliography entries derived from the study index blocks (`pdf.referenceTargets`), which grow as background indexing proceeds. A link over "3" in "Figure 3" previews the caption rather than the bare destination.

**Continuous scrolling and margin cropping in PDFie's own viewports.** `ContinuousViewport` mirrors the SDK scroller (virtualized by the scroll plugin) so it shares fit modes and rendering layers with `PaginatedViewport`. Cropping samples up to six pages at low resolution, takes the union of their inked bounds plus padding, and hides the margins without changing the PDF: the paged view clips the spread's outer margins; the continuous view clips side margins only, so page positions keep matching SDK coordinates. "더 자르기/덜 자르기" adjust the detected crop by 1% steps. Layout and crop are saved per document. Cropping is disabled while a page is rotated.

**Marks with the EmbedPDF annotation plugin.** Pen, highlighter pen, line, arrow, rectangle, ellipse, text box and note use `@embedpdf/plugin-annotation` with `@embedpdf/plugin-history` (undo/redo). Outside mark mode every annotation is locked, so clicks reach text selection and links. Marks PDFie creates are tracked by ID and saved as annotation JSON per document hash; on reopen they are imported again. The PDF's own annotations are now drawn (the render plugin never drew them) but are never saved or offered for deletion. Text highlights stay in PDFie's model, because selection, AI requests and evidence depend on it; they are not migrated.

**Export is a separate adapter.** "주석 포함 PDF 사본 저장" runs an isolated PDFium process (`export-worker`) that reads the original, creates every mark and highlight as a fresh standard annotation (so PDFium writes `/AP` appearance streams), and writes `<name> (PDFie 주석).pdf` in a chosen folder; the original is never written. Highlights become `/Highlight` or `/Underline` with the note as contents. Tests confirm the annotations and appearance streams in the copy and render it with Quick Look (PDFKit, as Preview does). "주석을 Markdown으로 내보내기" writes highlights with notes and a per-page list of marks.

## Not adopted

- Splitting one document into two panes, paper background colors and printed page numbers (marked "도입 안 함" in the plan).
- Migrating existing highlights to PDF annotations (kept in PDFie's model; exported on demand).
- Replacing PDFium with PDF.js.

## Known limitations

- PDFium draws text boxes with a standard Latin font. Korean or other non-Latin text in a text box would vanish in other viewers, so the export writes such a box as a note (Preview and Acrobat show its text in their own font). Inside PDFie the text box displays normally.
- Reference detection is heuristic: author–year citations and captions not at the start of a line are not resolved; a figure preview shows the region above its caption, which may include neighbouring content.
- In continuous mode, cropping hides side margins only.
