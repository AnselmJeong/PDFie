# PDFie

PDFie is a native-WebKit macOS reader and study workspace for academic papers and books. It renders the original PDF and connects source passages to explanations, editable study goals, section summaries, figure questions and interactive learning. Reading state and annotations remain independent from study records.

## Requirements

- macOS 14 or newer
- Bun

## Run and verify

```sh
bun install
bun run dev
bun run typecheck
bun run lint
bun run test
bun run test:viewer
bun run build:stable
bun run verify:package
```

Stable artifacts are written to `artifacts/`. Because this workspace is on an external volume, copy the stable `.app` to `/Applications` or another system-volume location before first launch; Electrobun's self-extractor cannot rename its staging bundle across volumes.

## Study workspace

Open a PDF and use the four tabs in the right sidebar:

- **학습 목표**: generate questions from available source excerpts, edit/add/reorder goals, and distinguish exploration from independently passed quizzes.
- **섹션**: review headings/bookmarks as a nested outline (sections and their subsections), rename sections, split at a real extracted source block, merge with the preceding section, summarize, or start learning. Summarizing a section includes its subsections. References, acknowledgements, funding, competing-interest and data-availability statements are marked **부가 정보** and left out of document-wide summaries, goals and lessons; choose such a section directly to work with it.
- **대화**: ask about the document, a section, or selected passage. Explanations distinguish document claims, inference, background, examples and missing evidence. Source chips preview the quote and reveal its PDF position; the return button takes you back to the previous page.
- **학습**: the existing AI connection chooses and composes cited comparisons, concept relationships, evidence maps, illustrative signal experiments, predictions and checks. When those components cannot express an interaction, it can generate a custom HTML/SVG screen using the adapted OpenIntelligentUI contract. Lessons expand into a reading surface; selections, controls, attempts, feedback and the current step are saved.

Use **그림·표 캡처** and drag on the PDF to attach an image. PDFie sends the actual PNG only to a model whose image capability was confirmed. Scanned pages are marked **OCR 필요**; they can be discussed through a selected capture, but native OCR is not included.

The download icon exports goals, conversations, citations, complete lesson steps and study attempts to Markdown in a chosen folder. Record management lives in the study library; deletion preserves the original PDF and the reader's saved annotations.

## Study library

The app opens to **학습 서재**. Use **⌘L**, the sidebar's book icon or the reader's **학습 서재** button to return to it. The current PDF stays open while browsing the library.

- Search paper titles and the contents of saved goals, lessons and explanations; sort by recent study or title. Favorites and an archive keep a growing collection manageable; lists load in batches of 40.
- Select a paper to reopen **Interactive learning**, study goals, summaries and conversations. Review, slider experiments, quiz attempts, feedback and saved progress work without the original PDF or an AI connection. Finishing a lesson and independently passing a quiz are tracked separately.
- Source chips open the saved quote. Opening the PDF page is a separate action. Reconnecting a moved PDF checks its byte hash before attaching it to existing records.
- Rename, favorite, archive, export or delete a paper's study materials from the library. Settings contain only AI connection and appearance.

Legacy records migrate additively into the catalog. Older records did not save filenames or source paths; the catalog recovers a title from their saved lesson or heading until the original is reconnected or the title is edited. PDFs dropped from Finder are temporary viewer files; the library preserves learning materials and evidence, without retaining a PDF copy.

## AI connections and storage

Open the separate **설정** window with the settings icon or **⌘,**. AI connection, model and appearance are organized there.

**Ollama Cloud** uses the existing fixed endpoint `https://ollama.com/v1`. Configure its API key in AI settings or the Bun process's `OLLAMA_API_KEY` environment. Keys entered in settings use the existing local AES-GCM secret file; this is not macOS Keychain storage. Old settings are backed up before their first study-settings migration. Model choices are remembered separately per provider.

**ChatGPT 구독 · Codex 연결** supports text/image generation through official App Server using a PDFie-private home. CLI **0.160.0** is the currently verified version. Each request checks the signed-in account, selected account model and ordinary-usage allowance before starting an ephemeral thread with no execution environments, workspace roots or injected tools. Other CLI versions and unknown/exhausted allowance are blocked with an explanation. Successful sign-in automatically clears the login warning and disables the login button. Generation becomes available once the connection, model and readable source are ready. Visible study prose defaults to Korean; schema and save-time checks reject a wrong-language result before it replaces goals or progress. An explicit alternative response-language request is respected. It does not fall back to paid API calls. Claude integration is not enabled in this build.

Native PDF text is indexed page by page in local SQLite. Sections are then derived from the whole document: usable PDF bookmarks come first, and headings are judged against the document's body text style (font size, bold/italic/color read from font names when PDFium reports no weight), numbering sequences and known section names. Running headers/footers, figure labels and table cells are not promoted to headings. `bun scripts/check-native-index.ts <pdf> [report.json]` prints the resulting outline; `tests/fixtures/pdf/structure` holds paper-like layouts generated by `scripts/generate-structure-fixtures.py` that `bun run test` checks. Source quotes and coordinates used by completed explanations are saved as evidence snapshots. Conversations, goals, lessons and attempts persist per PDF byte hash. Interrupted responses retain a bounded unverified draft. Captures use private PNG files and opaque IDs; referenced images are preserved, and unreferenced images older than 24 hours are pruned on startup.

Context is bounded and lexical, with a limited Korean–English term expansion. Every answer reports the prepared pages and source units included in its request. A clickable citation verifies source identity and location; it does not by itself prove that a model's interpretation is correct. This build has not passed the PRD's full research-paper corpus and claim-support review.

OpenIntelligentUI integration ports its MIT-licensed design system and CSS → HTML → JavaScript rendering contract at upstream revision `f6e4388b26a64b9a0714943b08a1ce622b924eec`. PDFie uses its own Codex/Ollama provider and durable study store. Custom screens render after generation and validation, inside an opaque-origin iframe hosted by a separate RPC-disabled native webview. Network requests and external navigation are blocked; the host accepts only bounded control state, resizing and allowlisted source evidence. It does not install the upstream Next.js/Python server or require a separate Jev/API-key connection. See [ADR 007](docs/decisions/007-openintelligentui.md) for the integration boundary and limitations.

## Selected-text actions

Select a passage to Ask AI, Summarize, Copy, Read with system voices, add a note,
or apply yellow/green/blue/pink highlighting or a red underline. `H` highlights
and `U` underlines the current selection; `Escape` dismisses selection or stops
reading. AI keeps the selected quote when the composer receives focus, and
retains a summary draft if the model is not ready.

The **주석** navigation tab lists saved passages, lets you change colors/edit notes,
and jumps back to their pages. Annotation changes can be undone. Highlights and
notes persist per document without modifying the original PDF.

## Architecture records

- `docs/decisions/000-desktop-runtime.md`
- `docs/decisions/001-pdf-viewer.md`
- `docs/decisions/002-md-reader-ai-port.md`
- `docs/decisions/003-evidence-model.md`
- `docs/decisions/004-provider-auth.md`
- `docs/decisions/005-lesson-runtime.md`
- `docs/qa/phase-0-results.md`
- `docs/qa/research-platform-spike.md`
