# PDFie

PDFie is a native-WebKit macOS reader for academic papers and books. It renders the original PDF, preserves page-aware selections, provides thumbnail/bookmark navigation, classifies article versus book structure, restores reading state, and can send only the selected passage to an OpenAI-compatible chat endpoint.

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

## Architecture records

- `docs/decisions/000-desktop-runtime.md`
- `docs/decisions/001-pdf-viewer.md`
- `docs/decisions/002-md-reader-ai-port.md`
- `docs/qa/phase-0-results.md`
