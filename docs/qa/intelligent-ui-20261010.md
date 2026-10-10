# OpenIntelligentUI integration acceptance — 2026-10-10

The installed `/Applications/PDFie.app` was built and verified with the native OpenIntelligentUI adapter. Existing library records and the earlier lesson remain present.

## Real paper

Carhart-Harris, *The entropic brain today* (17 PDF pages), existing goal 2 comparing single-dimensional and multidimensional approaches to consciousness. The actual connected Codex provider generated and saved **의식의 수준과 경험의 폭: 두 축으로 비교하기** with six steps: explanation, prediction, comparison, sandbox, evidence map, and quiz. It has 21 source references. Lesson ID: `0ead2b7a-f7f3-4ba9-b2b2-1bcbf16cbc32`.

## Installed-app observations

- Comparison criterion selection changes the displayed two-column explanation and source buttons. The selected EBH criterion survives restart.
- The custom two-axis screen changes its explanation and plot when arousal and experience breadth are selected. High/narrow controls survive leaving the lesson and restarting the app.
- The generated EBH source button opens the saved quotation and navigates to actual PDF page 2 with a highlighted source passage.
- The evidence map separates the author's claim, the lesson's interpretation, limitations, and proposed further checks.
- Expanded custom content follows scrolling and is clipped to the modal bounds. Escape from inside the custom screen closes the expanded view.
- No quiz was submitted during manual acceptance. Control manipulation does not mark the learning goal passed.

## Automated and package checks

Type checking passed. All 147 unit tests across 22 files passed, as did source-bridge, document-state, study-platform, study-library, and adaptive-lesson integration checks. The integration check covers generation, nested source validation, durable controls after reopening the store, assessment semantics, and Markdown export. Stable build and installed-package verification passed, including both sandbox shell pages, their bundles, and the upstream MIT license. `git diff --check` passed.

## Delivery scope

PDFie uses OpenIntelligentUI's sandbox output contract and vendored MIT design system through its existing providers. It validates the full lesson before rendering; streamed UI previews are not implemented. Generated toy scenarios are labeled and are not clinical measurements. Isolation and valid source IDs do not establish scientific correctness.

Structured results: [intelligent-ui-20261010.json](intelligent-ui-20261010.json). Architecture and isolation: [ADR 007](../decisions/007-openintelligentui.md).
