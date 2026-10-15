# Library batch import and stable topics — 2026-10-15

## Behavior

- Native multiple-file picker and recursive folder import feed a durable SQLite queue. Content hashes avoid duplicate catalog records. The original path is linked, not copied into managed storage.
- A packaged Bun/PDFium worker indexes each PDF independently, so a corrupt file does not stop other imports. Cancellation preserves completed work; application shutdown leaves unfinished work resumable.
- The existing AI provider classifies new papers from sampled body excerpts using the saved topic vocabulary. It cannot silently reclassify old papers. Manual assignments remain protected.
- Explicit topic rename/merge previews affected counts, including archived/manual assignments. Retired names resolve to their canonical replacement. A revision and preview fingerprint reject stale edits. Undo rejects intervening changes rather than overwriting them.

## Automated checks

- `bun run typecheck`: passed.
- `bun run test`: 161 Vitest tests in 24 files, plus all Bun integration suites passed.
- Import integration: real PDFium extraction, recursive discovery, filename commas, ambiguous picker output, byte-identical duplicates, scanned/corrupt PDFs, source preservation, cancellation and restart.
- Taxonomy integration: archived/manual preview counts, rename/merge, safe undo, stale preview rejection, alias reuse by AI and persistence after restart.
- Changed-file Biome check: no errors; two existing non-null-assertion warnings moved with the shared native page analysis code.
- Stable build and packaged-resource verification passed. Package contains the new import worker and PDFium WASM.

## Live AI acceptance

`bun run scripts/check-library-import.ts --live docs/qa/local/library-import-live-20261015.json`

An isolated temporary library used the installed app's existing Codex connection (`gpt-6.1-sol`) to import a real 17-page paper and an identical copy in a nested directory. Result: one added, one duplicate, one completed classification, no pending/failed classifications. Topic: `의식 신경과학`; source sample: pages 1, 2, 5, 7, 10 and 11. A pre-existing manual assignment and its library detail were unchanged. The production library was opened read-only; temporary copies and the temporary database were removed after the check.

## Native app acceptance

A separate app identity with a copy of the two-paper library and no AI credentials was used for destructive test scenarios.

1. Native multiple-file selection of `paper, one.pdf` and a corrupt PDF produced two discovered, one added and one failed. The comma was preserved; the unopened corrupt document did not create a catalog card.
2. Selecting the containing folder then discovered four PDFs, added the scanned PDF, skipped two duplicates, and reported the corrupt PDF. The catalog contained the original two papers plus the two valid fixtures.
3. The result panel correctly showed damaged/encrypted-file advice and a one-page OCR requirement. Missing AI configuration left two papers needing attention without pretending classification succeeded.
4. Topic rename preview showed the affected paper count. Applying it updated the topic filter and paper card. Immediate undo restored the original topic and retained study counts.

## Installed app

The existing app and SQLite database were backed up before replacement. `/Applications/PDFie.app` was replaced with the verified stable build; all 25 bundle files matched the staged artifact byte-for-byte. The installed app launched with both import buttons and the topic manager visible. The nine pre-existing data tables were compared row-for-row against the backup and were unchanged, including both papers, their classifications, 21 pages, 1,005 blocks and 81 study entities. Only additive schema migrations and taxonomy seed rows were introduced. Initial acceptance used version 0.2.0; the release version is 0.3.0.

## Limits

No OCR or password-unlocking workflow was added. Folder traversal skips hidden entries and symbolic links. Limits are 10,000 PDFs per batch, 512 MB per file, depth 64 and 20,000 folders. This does not constitute a 10,000-paper load benchmark. Topic classification remains a model suggestion from sampled excerpts. Splitting or globally reclustering the whole library is not automatic; individual corrections and explicit topic rename/merge are supported.
