# PDFie

PDFie is a native-WebKit macOS reader for academic papers and books. It renders the original PDF, preserves page-aware selections, provides contextual search/bookmark navigation, classifies article versus book structure, restores reading state, and can send only the selected passage to an OpenAI-compatible chat endpoint.

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

## AI sidebar

Open AI settings in the sidebar and enter an HTTPS OpenAI-compatible endpoint, model, and API key. Endpoint and model are remembered; the API key stays only in memory for the current app run. With a PDF selection, PDFie sends that exact text and its page list. Without a selection, the assistant is instructed to disclose that it has no extracted PDF evidence.

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
- `docs/qa/phase-0-results.md`
