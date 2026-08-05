# Phase 0 manual selection checklist

Use `tests/golden-selection/cases.json` in the native Electrobun build. For every case:

1. Open the named fixture from `tests/fixtures/pdf/generated/`.
2. Drag from the first visible glyph to the final visible glyph in the case.
3. Copy once with the native Edit menu and once with PDFie's selection action.
4. Record the raw text, normalized text, page list, and PDF-coordinate rectangles.
5. Repeat at 75%, 100%, 150%, and after one 90-degree rotation.

The case passes only when normalized text equals `expectedText`, page numbers equal `expectedPages`, and every selection overlay remains aligned. The scanned fixture passes only when selection is unavailable with an explicit explanation.

Long-book QA additionally records first-page time, resident memory near pages 1/160/320, and resident memory after closing the document. Nested-bookmark QA records the full Part → Chapter tree.
