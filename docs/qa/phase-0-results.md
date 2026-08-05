# Phase 0 validation results

Date: 2026-08-04  
Host: macOS arm64, native WebKit  
Viewer: EmbedPDF 2.14.4 + PDFium WASM  
Runtime: Electrobun 1.18.1, `bundleCEF: false`

## Selection golden corpus

The in-app QA runner executes the same PDFium selection capability used by the reader. It resolves PDF glyph indexes, retrieves selected text, and records 1-based pages and PDF-coordinate rectangles. `tests/golden-selection/cases.json` is the expected-value source.

| Fixture | Case | Pages | PDF rects `(x,y,w,h)` | Result |
| --- | --- | --- | --- | --- |
| single-column-en | title | 1 | `64,40,397,22` | PASS |
| single-column-en | abstract-sentence | 1 | `64,131,451,13` | PASS |
| single-column-en | methods | 1 | `64,245,452,13` | PASS |
| two-column-paper | left-column | 1 | `54,144,136,12`; `54,182,151,12`; `54,220,130,12` | PASS |
| two-column-paper | right-column | 1 | `320,144,155,12`; `320,182,151,12`; `320,220,152,12` | PASS |
| two-column-paper | footnote | 1 | `320,258,143,12` | PASS |
| korean-paper | korean-first | 1 | `64,99,264,13` | PASS |
| korean-paper | korean-order | 1 | `64,141,223,13` | PASS |
| korean-paper | korean-conclusion | 1 | `64,225,226,13` | PASS |
| ligature-hyphen | ligature-words | 1 | `64,131,376,13` | PASS |
| ligature-hyphen | line-hyphen | 1 | `64,169,109,13`; `64,207,211,13` | PASS |
| ligature-hyphen | superscript-like | 1 | `64,245,287,13` | PASS |
| rotated-page | rotated-title | 1 | `64,93,99,13` | PASS |
| rotated-page | rotated-sentence | 1 | `64,131,356,13` | PASS |
| multi-page | page-one | 1 | `64,131,300,13` | PASS |
| multi-page | pages-one-two | 1, 2 | p1 `64,169,372,13`; p2 `64,93,141,13` | PASS |
| multi-page | pages-two-three | 2, 3 | p2 `64,169,372,13`; p3 `64,93,141,13` | PASS |
| scanned-image | no-native-text | none | none | PASS — no native text layer |
| long-book | page-160 | 160 | `64,111,282,13` | PASS |
| nested-bookmarks | nested-chapter | 17 | `64,131,292,13` | PASS |

Result: **20/20 passed**. Actual normalized text equalled each case's `expectedText`; actual pages equalled `expectedPages`; every text case returned segment rectangles. Korean raw PDF text uses non-breaking spaces, which normalizes losslessly with NFKC. PDFium suppresses a visual line-end hyphen in its text slice; PDFie restores it only when a non-empty glyph box ends a line and the next selected glyph begins on another line. The restored raw result is `A deliberately hyphen-\nated word crosses the visual line boundary.`

## Manual native-view checks

- Dragged across the first two left-column lines in `two-column-paper.pdf`; the right column was not included.
- Sidebar quote and PDFie copy action both produced `The left argument begins here.\nIt continues without borrowing text`.
- Selection overlay stayed aligned at 153% zoom.
- `nested-bookmarks.pdf` exposed `Part I → Chapter 1 → 1.1 Selection` and the complete second Part tree.
- `long-book.pdf` exposed only a small thumbnail/page window at pages 1, 160 and 320. Bun process RSS was approximately 238 MB at both pages 160 and 320.

## Packaging checks

- Dev `.app`: PDF render, selection, range source, Blob module worker and local WASM passed.
- Stable `.app`: the same PDF and selection passed after copying the packaged app to a system-volume install location.
- Unpacked stable payload: 86,012,283 bytes; `pdfium.wasm`: 4,633,788 bytes; compressed app artifact: 21,028,808 bytes.
- No CEF, Chromium or `libcef` asset was present.
- Launching the stable self-extractor directly from the external `/Volumes/Aquatope` build directory hits Electrobun's `RenameAcrossMountPoints`; an installed/system-volume copy works. This is a packaging-tool location constraint, not a reader failure.
