# ADR 007: OpenIntelligentUI learning integration

Date: 2026-10-10  
Status: Implemented beta; supersedes ADR 005's closed component catalog

PDFie's lessons previously allowed explanatory text, an ordered list of nodes, quizzes and two fixed illustrative formulas. The existing source-grounded model now selects and composes comparison, concept-map, evidence-map and signal-experiment components as well. Each comparison criterion, concept, relationship and claim must link to an actual evidence ID from the request. A separate prediction and quiz retain the existing assessment semantics.

For interactions beyond this catalog, a `sandbox` step adapts OpenIntelligentUI's `generateSandboxedUi` fields: initialHeight, CSS, HTML, named JavaScript functions and ordered expressions. The upstream MIT design-system code is vendored from `CopilotKit/OpenIntelligentUI` commit `f6e4388b26a64b9a0714943b08a1ce622b924eec`; its license is included in the packaged app. This is a native adapter, not the upstream CopilotKit runtime, Next.js server, Python agent or Jev routing service. PDFie's existing model makes the selection in one generation request. Complete output is validated before publication; streamed preview rendering is deferred.

## Native isolation

Electrobun 1.18.1 injects its preload into all WKWebView frames. An iframe in the trusted main view would therefore expose native RPC despite an opaque web origin. Custom content instead lives in a separate `<electrobun-webview sandbox>` with a transient partition and no native RPC handlers, socket port, key, or child-webview creation. A fixed host shell relays messages from an inner `sandbox="allow-scripts"` iframe. The inner frame has no same-origin access to the shell. Native navigation rules allow only the two local shell pages. CSP blocks network connections, external scripts, subframes and form submissions; CSS/DOM code runs only in the isolated frame. Native components continue to render text through React.

The host checks the specific webview event, per-mount channel, finite bounded resize, stored state shape/size and exact step evidence IDs. Generated code cannot call assessments, read PDF files, invoke the AI provider, or open arbitrary links. Widget state stores at most 24 scalar controls per step. Controls with stable IDs save automatically; other interaction state uses `PDFie.saveState`/`PDFie.savedState`. Source navigation uses `PDFie.revealEvidence`. Failed screens show their plain explanation and evidence, and dispose the native view. Escape exits the expanded screen.

## Durable learning and scientific limits

Legacy schema-version-1 lessons remain readable. New step types and optional widgetStates extend the existing JSON entity store without destructive migrations. Per-step selected criteria/concepts/claims, signal settings and custom controls persist; navigation merges prior custom state. Widget interactions do not pass an assessment. Markdown exports preserve explanations, nested citations, selected control state and claims; custom executable code is viewed only in the app.

The signal experiment mixes an alternating binary signal with seeded random bit replacements. Single-bit Shannon entropy and the fraction of adjacent transitions describe that toy signal. They do not estimate neural complexity, LZc, consciousness or a clinical outcome. Generated scenarios must label illustrative data. Source IDs verify provenance and location; neither schema validation nor isolation proves scientific correctness. Malformed or scientifically misleading generated screens can still require regeneration and human review. Arbitrary long-running JavaScript has no scientific or performance guarantee.

## Validation

`tests/unit/intelligent-ui.test.ts` covers nested evidence, table dimensions, graph endpoints, illustrative labeling, channel size, saved-state bounds and metric distinctions. `scripts/test-intelligent-ui.ts` exercises the provider → validation → persistence → restart → assessment → export path. `scripts/check-intelligent-ui.ts --live` checks the actual second goal in the 17-page Carhart-Harris paper through the private Codex connection; `--publish` adds only that validated new lesson to its existing library record after checking the source revision. Packaged-app verification requires both native sandbox shells, their bundles and the upstream license. Native runtime observations are recorded in the accompanying QA report.
