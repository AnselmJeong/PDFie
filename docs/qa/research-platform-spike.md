# PDFie research platform: implementation and verification

Date: 2026-10-10 (Asia/Seoul)  
Status: Working study beta; full R1/R2 release acceptance is not complete

## Delivered scope

- Page-checkpointed native text/geometry index and per-PDF SQLite storage.
- Bookmark/heading sections, editable titles and source-boundary split/merge.
- Bounded document/section/selection retrieval, durable conversation history, structured claim types and validated citation IDs.
- Quote previews, temporary PDF evidence highlights and previous-page return without changing user annotations.
- Editable/reorderable study goals and source-grounded section summaries.
- Region capture, privately stored PNG assets, actual image input for confirmed vision models, OCR-required status and image questions on scanned pages.
- Declarative learning cards, prediction/quiz feedback, illustrative sliders, expanded reading, and saved progress/attempts.
- Unified cancellation, bounded interrupted drafts, Markdown export and document-study deletion controls.
- Codex official isolated login/account/model/usage and text/image/schema inference on verified CLI 0.160.0, with an ephemeral thread per request and protocol cancellation.
- Separate native Settings window for connection, model, appearance and study records; login completion synchronizes the sidebar and disables duplicate sign-in.

The PRD and implementation plan were already locally edited before this implementation. They have been preserved. Existing document-drop/source-bridge, annotation and selection changes were also preserved. No unrelated work was committed or reset.

## Automated evidence

The baseline passed 76 Vitest tests plus the Bun source-bridge and reader-state integration scripts. The current implementation passes 129 tests in 20 files, including the 21-case viewer fixture manifest, and all three Bun integration scripts (`test:bridge`, `test:state`, `test:study`). TypeScript checking passes. Lint has no errors and 66 warnings, predominantly existing non-null assertions in integration tests.

New checks exercise forged source IDs/document hashes/rectangles, atomic failed ingest, same-page section boundaries and split/merge, partial/OCR status, bilingual scope retrieval, selection geometry boundaries, history, malformed evidence rejection, bounded lesson schemas, numeric experiments, answer-reveal versus independent passing, persistent progress, crash recovery, cancellation and late tokens, scanned-image input, PNG validation, settings migration backup and no-provider-fallback routing. Transport tests cover streaming EOF, unsupported images, malformed subprocess output and unsolicited tool requests. Codex turn tests cover early notifications, unrelated thread/turn filtering, final-answer deduplication, interrupted/failed output rejection, process failure, cancellation, confirmed empty environments/sources and no inference for unknown/exhausted allowance. Full-project Biome checking passes with 58 warnings (primarily non-null assertions); `git diff --check` passes.

`test:viewer` validates the existing fixture manifest; it is not a new live PDFium corpus run and does not replace human evidence-location QA.

## Native WebKit observations

A separate app with identifier `dev.aquatope.pdfie.study-qa` was run from `/private/tmp/pdfie-study-qa-20261010/`. Its data are separate from the user's normal PDFie records. Only generated fixture PDFs were transmitted. No Codex/Claude credential file was read or copied.

Observed in the app:

1. `two-column-paper.pdf` indexed 1/1 page and 11 native source units; the original PDF rendered.
2. A real section summary via `deepseek-v4-pro:0813` returned document claims, inference and missing evidence with validated source chips.
3. Clicking a source chip highlighted the LEFT COLUMN heading without highlighting the neighboring column; quote preview showed the matching source.
4. Direct exploration generated a four-step lesson (explanation → diagram → prediction → quiz). Selecting a prediction displayed grounded feedback and persisted the attempt.
5. A dragged left-column crop produced a real PNG containing that region; an unsupported model was blocked from image submission. With `gemma4:31b`, the actual image question succeeded and described the visible text.
6. After quitting and relaunching, the saved lesson resumed at step 3/4 with its previous feedback. Expanded mode opened as a full-width modal; Escape returned to the sidebar.
7. `long-book.pdf` prepared all 320 pages while the reader remained usable. Page 160 was reached by pasting its number into the page input. This is a synthetic-book smoke check, not the PRD's repeated p95/RSS benchmark.
8. The unpacked stable payload launched with the separate QA identity. Splitting at LEFT COLUMN created a user section; merging it restored the previous range. The existing lesson and conversations remained available.
9. A real goal request via `gemma4:31b` created five document-specific questions. Export through the native folder picker wrote a 10,101-byte Markdown file containing goals, citations, model metadata, the lesson and assessment feedback. Content review remains necessary: the model translated the technical fixture term awkwardly in one proposed goal.
10. `scanned-image.pdf` displayed 0/1 indexed pages and **OCR 필요 1**. Its selected image could still be submitted; the actual vision answer read both visible sentences, disclosed the absent text layer, and provided a region citation returning to the selected image area. It was not marked as successful native extraction.
11. In the final stable payload, a viewer selection used the **선택한 구절** scope and only 1/1 intersecting source unit. The selected partial phrase was reported as insufficient evidence rather than expanded into a claim about another column. The response citation revealed the corresponding original sentence. Final QA code and stable payload hashes match; see `research-platform-package.json`.

## Installed-app follow-up fixes

The supplied 17-page paper initially prepared only 5 pages. PDFium 2.14.4 could read every page; the failure came from treating word fragments as paragraphs, then rejecting pages at 1,000 runs/500 blocks/256 KB. The corrected extractor groups native runs into lines and same-column paragraphs, keeps individual line rectangles, uses bounded UTF-8 payloads, preserves failure reasons and retries failed pages. The extractor revision rebuilds only derived pages/blocks; saved conversations, goals, lessons and immutable evidence snapshots are preserved. That first fix prepared **17/17 pages, 841 source units, zero failures and zero OCR-required pages**. Its diagnostic is retained in `native-index-before-structure-20261010.json`; the current structure revision is described below.

Native app checks after installing the verified stable payload:

- **⌘,** and the sidebar settings button open a separate native window at `views://main/settings.html`. The connection tab shows ChatGPT connected, a disabled “로그인 완료” button, the selected account model and usable quota. No obsolete login error remains. The reading panel contains no inline connection or appearance controls.
- Appearance selection changed the saved font size from 14 to 15 px through the native UI; it was restored to 14 px. The user's panel width (554 px) was preserved. Settings changes broadcast to both windows.
- The goal button activated with the real account/model and readable source. The first real result exposed a language bug: Chinese prose passed the old shape/source-ID validation despite the Korean default instruction. The follow-up adds a final trusted Korean language instruction, Korean schema constraints on visible prose, and a save-time language guard. A Chinese-goal regression now proves that a failed language check cannot replace existing goals or progress. An explicitly requested alternative answer language remains supported.
- The installed corrected app regenerated **7 Korean goals** through `gpt-6.1-sol`, provider `codex`. All question/prerequisite/check-question fields are Korean, all source IDs match the completed request's evidence, and the saved request records `본문 17/17페이지 준비 · 이 요청의 원문 64/841단위 사용`. Prepared pages are distinct from the bounded excerpts used for that request.
- Clicking the first goal's citation moved from page 7 to the matching page-1 abstract, showed its quote and temporary source highlight, and “이전 읽던 페이지로” returned to page 7. The original PDF and annotations were not modified.

CLI acceptance used the existing PDFie-private login without reading or copying credentials. Live synthetic text/schema and image tests passed; the red-square image was identified correctly. An empty-environment thread could not read or overwrite a synthetic canary, with no tool requests/executable items observed. Live cancellation acknowledged the matching `turn/interrupt`, emitted no completed answer after stop and closed the process. These safe diagnostics are in `codex-inference-20261010.json`.

The original app and pre-fix database are preserved in `~/Library/Application Support/PDFie Backups/20261010-analysis-settings/`; an additional database backup preserves the initial Chinese result before repair. The installed app uses the regular identity/channel and existing private login. Package hashes and installed resource hashes are in `research-platform-package.json`.

## Conversation and section follow-up

Requests now carry a `composer` or `action` origin independently of the generation task. Only composer messages enter the conversation tab and subsequent conversation context. Older goal/lesson/summary requests are excluded using their task. The 14 known automatic records in the supplied paper's local database were tagged after a database backup: six records belonged to three button-triggered explanations matching saved goals and scopes. Their text, evidence, state and ordering were preserved; no messages or goals were deleted. New requests with identical text still remain visible when explicitly sent from the composer. Markdown export separates actual conversations from useful action answers and excludes internal prompts/completion notices. Button explanations and summaries use a separate result view; goal explanations and current-revision summaries can be reopened. Older goal explanations retain their evidence and show a regeneration notice. Automatic work preserves an unfinished composer question and attachment.

`native-styled-headings-v3` reads PDFium rich text metadata in addition to geometry. Predominantly bold/colored headings define boundaries, wrapped same-style heading lines form one heading, and author affiliations, years, table captions and running headers are not promoted by height alone. With detected headings, page-level bookmarks cannot interrupt a continued section. Reindexing retains goals and immutable evidence; edited section titles and manual boundaries retain source anchors. Old goal scopes fall back to available matching sections or the document rather than requesting a vanished section.

The same paper now has **17/17 prepared pages, 819 source units, 23 sections including document metadata, and no failures/OCR-needed pages**, in the diagnostic and installed app. “Single versus multi-dimensional approaches to consciousness” is one complete heading with its following body; “The entropic brain today” includes the abstract rather than only its title. See `native-index-20261010.json` for section titles, page ranges and unit counts. This remains a paper-specific acceptance check, not the 10-paper structure corpus gate.

The summary prompt follows the section's actual argument and function. Its trusted instruction explicitly rejects a mandatory purpose/methods/results/limitations/open-questions template and requires evidence for the supplied content. Installed-app Codex generation on the problematic conceptual-comparison section completed with **11/11 section source units**, summarized its distinctions and reasoning in Korean, preserved the unfinished question and did not appear in conversation. All seven prior goals remained byte-for-byte unchanged. The database contains 16 retained message records (including the new summary pair) and zero actual conversations. The pre-change app/database are preserved under `~/Library/Application Support/PDFie Backups/20261010-conversation-structure/`.

Docling was evaluated through its official documentation as a candidate for background layout analysis, with PDFium retained for immediate viewing and coordinates. It is not included in this build. A comparative corpus benchmark (heading boundaries, reading order, source-coordinate fidelity, latency, memory and model distribution) is needed before adopting it. Documentation: <https://docling-project.github.io/docling/usage/advanced_options/> and <https://docling-project.github.io/docling/usage/heading_levels/>.

## Gates and remaining acceptance

| Gate | Current evidence | Release state |
| --- | --- | --- |
| G1 coordinates | Actual two-column citation/crop; four-way inverse-rotation unit tests; original selection fixtures retained | CropBox, intrinsic rotation, multi-page anchor corpus still required |
| G2 structure | Native-run index, heading/bookmark sectioning, source-boundary edits, OCR-needed state | 10-paper labeled structure and 100-anchor human comparison still required |
| G3 Codex | CLI 0.160.0: existing PDFie login, actual model/ordinary-usage preflight, live text/schema/image, empty environments/sources, file canary and acknowledged interrupt; fake protocol/EOF/quota tests | Enabled only for verified 0.160.0; other versions blocked. Observed execution isolation is verified; no billing ledger audit or future-version guarantee |
| G4 Claude | No active adapter in this build | Deferred; official integration/billing and account tests required |
| G5 lessons | Validated templates, real four-step lesson, saved prediction/feedback, restart and expanded-mode observations | Full 10-module content/keyboard/template acceptance still required |
| G6 storage/performance | SQLite ran in bundled native app; transactions/crash tests; synthetic 320-page preparation | General-table lexical fallback used; FTS5 and 80/320-page repeated performance benchmark not certified |

Additional gaps: OCR/layout extraction, cross-page paragraphs, running-header detection, multilingual retrieval benchmarking, semantic claim-support review, free-response assessment/appeals, automatic structured-output repair, and broader cache invalidation/rebinding after extractor upgrades. The model may still attach a valid but semantically unsuitable citation; AC-04 remains a human review task.

## Package boundary

Stable arm64 app/DMG generation and packaged-resource inspection are part of this handoff. Native WebKit, local PDFium WASM (4,633,788 bytes) and no CEF/Chromium payload are retained. Signing and notarization are disabled in the existing configuration. The follow-up fixes update the user's installed `/Applications/PDFie.app` after preserving the original app and study database in `~/Library/Application Support/PDFie Backups/20261010-analysis-settings/`. The stable payload was extracted onto the system volume and run under the QA identifier/channel so it could use the separate test records. Only bundle identity/channel metadata were altered for isolation. A source test, package inspection and separate QA-app launch are distinct pieces of evidence and do not establish all installed-app acceptance scenarios.

## Reproduction

```sh
bun run typecheck
bun run test
bun run test:viewer
bun run build:stable
bun run verify:package
```

For native QA, open generated fixtures in a separate app identity, configure Ollama Cloud, summarize a section, inspect a source chip, capture a region with an image-capable model, generate a lesson, answer a prediction, and reopen the same PDF after restarting. Do not send a private research PDF merely to test transport.
