# Selected-text actions restoration

Scope: restore MD_Reader's Ask AI, Summarize, four highlight colors, red underline,
Copy, Read and passage notes in the current paginated PDF viewer. Preserve the
original PDF and existing worktree changes; annotations remain in document state.

- Render the menu from the actual visible selection geometry in a body portal,
  independent of continuous-scroll menu placement and page clipping.
- Cancel stale asynchronous selection reads. Retain a snapshot of the quote when
  opening AI; replace timer/event handoffs with typed requests and draft fallback.
- Preserve highlights across restyling; add note editing/removal and a saved list.
- Add read/stop controls, clipboard error feedback and selection shortcuts.
- Validate typecheck, lint, unit/bridge tests, build and native viewer interaction.

Initial reproduction: at 70% zoom, a drag through glyph gaps did nothing with
`toleranceFactor: 0`; moving a few pixels produced the existing four-item menu.
The AI sidebar also used a 60ms timer and silently dropped requests when its model
was not ready. SDK menu placement depended on virtual continuous-scroll metrics.

## Verification — 2026-09-26

- TypeScript and repository lint passed; 71 Vitest checks passed (including the
  selection fixture manifest, not a claim of fresh interactive QA for every PDF).
- The isolated commit snapshot also passed typecheck, lint and 70 Vitest checks;
  the additional pre-existing selection test remains outside this commit.
- Bun source bridge and concurrent document-state persistence checks passed.
- Stable build and package inspection passed; bundled PDFium WASM present, no CEF.
- Installed updated local build at `/Applications/PDFie.app`. Previous bundle is
  retained at `build/selection-restoration-backup/PDFie.app`.
- Native WebKit checks with generated `multi-page.pdf`, page 3:
  - Drag selection exposes Ask AI, Summarize, Highlight, Copy, Read and notes.
  - Green highlight and note editing work; selected note editor saves correctly.
  - Copy then paste into the composer reproduces the selected text.
  - Ask AI reopens the closed sidebar, retains the quote and focuses the composer.
  - AI streaming request completed; a mock provider test separately verifies exact
    selected text and page numbers in the outbound request.
  - Read enters its running state and completes. Audio quality was not evaluated.
  - A note and yellow highlight survive a full app restart and document reopen.
  - Delete and undo restore both annotation and note. QA annotation then removed.
  - Rotating 90 degrees keeps the menu upright and visible above the selection.
- Local bundle only: Developer ID signing and notarization remain disabled by the
  existing build configuration.

The Read action uses the platform speech synthesis voices, rather than copying
MD_Reader's speech backend/settings. Notes and marks are stored separately from
original PDF bytes. Closing the AI sidebar preserves the current conversation;
durable chat history across application restarts remains outside this change.
