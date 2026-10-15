# Library catalog — 2026-10-15

The requested Gloss-style browsing model is adapted to PDFie's React 18 / Electrobun / SQLite architecture. No Gloss account, cloud store or PDF-to-HTML pipeline was added. The follow-up below adds classification through PDFie’s existing AI adapter. Existing PDF hashes remain document identities.

## Delivered

- Full-window card catalog, list view, and a separate full-width study detail with a return action. Catalog search, filtering and scroll position survive opening/closing a detail. Card/list preference survives app restart.
- Custom topics and multi-collection membership, collection creation/rename/removal, and combined search/status/topic/collection filters. Collection removal does not remove documents or learning records.
- Search includes topic/collection names and the existing saved study content. SQLite pagination remains 40 documents per request; topic and membership counts cover the full active/archived catalog, not just the visible page.
- Additive schema version 3 introduces organization and collection tables and indexes. Existing lessons, goals, messages, source evidence and PDF annotations keep their original storage and identity.

## Verification

- `bun run typecheck` passed.
- `bun run test` passed: 161 unit tests and all Bun integration suites. New organization integration covers 85 documents, multiple memberships, duplicate/invalid names, combined filters, literal search, pagination, archive-aware counts, rename, deletion isolation and restart durability.
- Biome on every changed TypeScript/TSX/CSS file passed. Repository-wide lint still reports three pre-existing formatting errors in `docs/qa/intelligent-ui-20261010.json`, `src/vendor/openintelligentui/design-system.ts` and `src/views/main/components/AiSidebar.tsx`, plus 68 warnings; these unrelated files were not changed.
- Stable build and packaged-resource verification passed (native WebKit, bundled PDFium, no CEF).
- Native UI validation used the separate identity `dev.aquatope.pdfie.library-qa-20261015`: a copy of the existing two-paper catalog plus 85 synthetic titles. Verified card layout, topic/collection/text intersection, list switching, detail navigation, manual topic save and restart. The changed topic and list preference survived restart. No synthetic records were inserted into the user's actual library.

## Installation and preservation

The verified stable package was installed at `/Applications/PDFie.app`. Original app, SQLite snapshot and pre-update row digests are retained under `~/Library/Application Support/PDFie Backups/20261015-library-catalog/`. Installed Bun, view and CSS payloads match the stable archive. Signing/notarization configuration remains as it was.

After installation, the actual two-paper catalog opened. The Carhart-Harris paper retained its two lessons, 11 goals and saved completed quiz/feedback. Before reopening the source PDF, a read-only digest comparison confirmed all original rows unchanged: 2 catalog entries, 2 documents, 81 learning entities, 21 indexed pages and 1,003 source blocks. The 17-page original subsequently rendered at its saved page 2, and ⌘L returned to the new catalog. The installed app is left open on the card catalog; provider generation was not exercised by this library change.

## Scope

Topics support manual assignment and the automatic classification follow-up below. Collections are local to this Mac. This release does not introduce bulk assignment, bibliography metadata extraction, PDF thumbnails or cloud sync. Scalability was tested with 85 synthetic records plus the existing two-paper catalog; this is not a large-corpus benchmark.

## Follow-up: automatic topics

- Additive schema version 4 stores classification state, provider/model, rationale and sampled page numbers separately from study records. Existing nonempty topics migrate as manual assignments.
- New and existing unclassified active papers are queued from stored body text. The packet prioritizes the abstract/introduction (up to 8,000 characters) and adds distributed body samples (up to 4,000 characters), excluding recognized references/back matter and uncertain extraction. It is a partial-document classification, not a full-text review. The current AI provider and model receive these excerpts through the existing adapter; no new credentials, fallback provider, file access or tools are introduced.
- Each paper gets one editable topic; collection membership remains user controlled. Manual saves, including clearing a topic, invalidate outstanding AI results. Saving collections alone does not change topic ownership. Explicit reclassification retains the previous topic until a valid replacement succeeds.
- Background requests are serialized, capped at 120 seconds, and preempted by study generation. Failure does not erase the paper or learning data. Refresh alone does not retry failed calls; explicit retry or a changed/restored AI connection does. Interrupted work resumes after restart. Insufficient-text records become eligible when indexing adds content.
- `bun run typecheck` and the full suite passed (161 Vitest tests plus Bun integration suites). New classifier tests verify source-text input, selected-model reuse, deduplication, empty text, manual-edit races, foreground priority/cancellation, malformed output/retry, deletion during inference, and restart recovery/preservation.

### Live verification of the follow-up

The final stable artifact was installed at `/Applications/PDFie.app` and its Resources files matched the extracted archive byte-for-byte. Backup before this follow-up: `~/Library/Application Support/PDFie Backups/20261015-204652-auto-topics/`.

The installed application automatically used the existing **Codex / gpt-6.1-sol** connection and saved:

- Sloutsky: **아동 탐색 행동의 인지 발달**, sampled pages 1–4.
- Carhart-Harris: **뇌 엔트로피와 의식 상태**, sampled pages 1, 2, 5, 7, 10, 11.

The actual native catalog showed both topics and zero unclassified papers. The detail showed the selected model, Korean classification rationale, sample coverage, editable topic input and explicit reclassification control. An inherited flex style that squeezed the rationale into columns was corrected and the stable app rebuilt/reinstalled.

A separate app identity `dev.aquatope.pdfie.topics-qa-20261015`, with only a copy of the catalog and no copied AI credentials, was used to change the Sloutsky topic to **발달 인지과학** through the native UI. Saving changed its state to `manual`; both that state and the displayed topic survived app restart. The test app was then quit. The real library retains both automatic results.

A read-only comparison against the pre-update backup confirmed byte-identical original rows: 2 catalog entries, 2 documents, 21 indexed pages, 1,005 blocks, 81 learning entities, and all original collections/memberships. Only the added organization/classification data changed. The final installed app was reopened on the real catalog.

## Version 0.2.0 release

The library catalog and automatic topic classification are released together as **0.2.0** (previously 0.1.0). `package.json` is the version source for Electrobun. The stable build and installed `/Applications/PDFie.app` both report 0.2.0 in `Resources/version.json` and `Info.plist`'s `CFBundleVersion`; every installed bundle file matches the extracted stable archive. Type checking, diff whitespace checks and packaged-resource verification passed. The existing full test run above covers this release's implementation; only version metadata changed afterward.

The previous app and database are backed up under `~/Library/Application Support/PDFie Backups/20261015-205402-before-0.2.0/`. A read-only digest comparison of all 10 database tables after launching 0.2.0 found no changes. The native catalog displayed both papers, their automatic topics and existing learning counts.
