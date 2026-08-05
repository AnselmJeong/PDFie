# ADR 000: Desktop runtime

Status: Accepted  
Date: 2026-08-04

## Decision

Use Electrobun 1.18.1 with the macOS native WebKit renderer. Keep `bundleCEF: false` and do not add Electron or CEF.

## Evidence

- Typed Bun/view RPC, native open dialog and application menus work in packaged apps.
- EmbedPDF's Blob module worker and the bundled PDFium WASM load offline through `views://`.
- The 20-case selection corpus passed, including Korean, two-column, rotation and cross-page cases.
- A 320-page fixture remained virtualized with a flat approximately 238 MB RSS trend between pages 160 and 320.
- Both dev and stable packaged applications opened and selected text from the same fixture.
- The stable payload is about 86 MB unpacked and 21 MB compressed, with no CEF/Chromium asset.

The CSP permits only the packaged view resources, Blob workers, Electrobun's localhost WebSocket, and the tokenized `127.0.0.1` PDF source. `SharedArrayBuffer` is not required by the selected configuration.

## PDF source transport

Use a Bun-owned loopback range source rather than copying a complete PDF through RPC into a Blob. The server binds only to `127.0.0.1`, uses a random per-launch token and opaque document UUID, supports GET/HEAD/OPTIONS and byte ranges, and never exposes or accepts a raw path. This avoids a second full-file copy and supports long-document random access.

## Consequences

- macOS 14+ is the explicit deployment target.
- WebKit compatibility remains a release gate for PDFium/worker upgrades.
- Stable self-extractor smoke tests must run from a system-volume install location; Electrobun currently fails cross-volume rename when launched in place from this external workspace.
- CEF and Electron comparison is unnecessary because native WebKit passed every mandatory gate.

See `docs/qa/phase-0-results.md` for measurements and observed behavior.
