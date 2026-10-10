# ADR 003: Local source identity and evidence snapshots

Date: 2026-10-10  
Status: Implemented beta; corpus validation remains open

The original PDF byte hash owns each document's study records. Open-tab IDs are translated to that hash in Bun using the registered source bridge; the renderer cannot choose a storage path. Native PDFium geometry and `getTextSlices` are paired by engine ranges, without assuming JavaScript string offsets equal PDF glyph indexes.

Analysis runs sequentially per page, checkpoints completed pages, and sends bounded page batches. Bun validates page bounds, rectangles, text sizes and roles, then creates its own IDs from revision, page, order, original text and geometry. SQLite uses WAL, foreign keys and transactions. Reader-state JSON stays separate.

Sections begin at actual source blocks; their final block stops immediately before the next boundary, including boundaries on the same page. Users can rename, split and merge sections. Edits survive reopen. Previously generated response evidence retains its quote, revision, section label and rectangles rather than silently changing with section edits.

Answers accept only IDs supplied to the provider. A document claim without IDs becomes unknown; unknown IDs reject the result. This checks identity, not semantic entailment. The claim–evidence human review in AC-04 remains required. Low-confidence locations use page-only navigation. Captures get region evidence, never a fabricated native-text quote.

The beta uses native text runs with line rectangles and conservative heading/caption heuristics. Full paragraph joining, repeated headers, table/equation semantics, exact printed page labels, cross-page spans, quote rebinding after extractor changes and OCR/layout workers are deferred. Retrieval is bounded lexical search with a small bilingual dictionary, not a complete multilingual relevance solution.
