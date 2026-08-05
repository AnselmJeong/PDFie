# ADR 001: PDF viewer

Status: Accepted  
Date: 2026-08-04

## Decision

Use EmbedPDF headless 2.14.4 with its PDFium engine and a PDFie-owned React reader shell. The enabled plugins are document manager, viewport, vertical virtual scroll, two-page spread, render/tiling, zoom, interaction/pan, rotation, search, bookmarks and selection. The reading default is `SpreadMode.Even` with `ZoomMode.FitWidth`: the cover is shown alone and subsequent pages are paired. PDFie owns a contextual search rail that groups result excerpts by page and combines EmbedPDF's active-result state with explicit coordinate scrolling; page thumbnails are intentionally omitted because they provide little navigation value for text-dense academic documents.

## Why

- All 20 selection golden cases passed with correct normalized text, pages and PDF-coordinate rectangles.
- Two-column reading order remained local to the selected column.
- Cross-page selection returned a rectangle list for every page.
- Native WebKit rendered rotated, Korean, scanned and 320-page fixtures.
- Nested PDF bookmarks were available as a real tree and destinations navigated by page.
- The headless API lets PDFie own the visual system and domain adapter.

## Selection adapter rule

PDFium intentionally suppresses a discretionary line-end hyphen when returning text. PDFie preserves the visual source contract by restoring `-\n` only when the selected PDF geometry contains a positive-size text glyph whose text slice is empty and whose next selected glyph begins on another line. The same corrected text drives sidebar context, the PDFie copy action and Cmd+C.

Korean PDF text may contain non-breaking spaces. Raw text remains available while `normalizedText` uses NFKC and whitespace normalization for golden comparison, search and context matching.

EmbedPDF's stock text layer draws translucent run rectangles with `mix-blend-mode: multiply`. Overlapping glyph runs therefore create visibly darker seams even when the selected text is correct. PDFie keeps the plugin's PDFium hit-testing and text geometry but renders its own visual layer: close, vertically overlapping rectangles on the same line are unioned before painting. Distant columns and separate lines remain separate.

## Rejected alternatives

PDFSlick was not implemented because Candidate A passed every mandatory gate in the preferred native runtime. React-PDF remains rejected by the product contract. CEF and Electron were not exercised because the runtime fallback condition was not reached.

## Consequences

- PDFium WASM and the golden-case JSON are deterministic packaged assets.
- The QA button in the Phase 0 reader runs the selection API corpus for the current fixture and stores cumulative evidence locally.
- Viewer upgrades must rerun unit tests, all golden cases, manual drag checks, long-book memory checks, and dev/stable package smoke tests.
