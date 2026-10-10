# ADR 002: MD Reader AI port boundary

Status: Accepted for MVP foundation  
Date: 2026-08-04  
Reference: MD Reader commit `0a715c9`

## Ported behavior

- A persistent right-side conversation surface that remains independent from the viewer implementation.
- Provider endpoint/model settings, a session-only secret, explicit loading/error states and a typed submit contract.
- Selection-first context: text and page numbers are converted to an RPC DTO and the Bun process owns the provider request.
- Source-language preservation and a prohibition on invented page citations in the system instruction.

## Deliberately not copied

- Electron preload, IPC, window lifecycle and custom protocol code.
- Markdown/EPUB renderers, document save behavior, CFI, annotations and TTS.
- Whole-document `documentContent` prompt injection.
- `better-sqlite3` and unverified native bindings.

## PDFie implementation

The main view uses Electrobun typed RPC only. Provider fetches run in Bun. Endpoint and model use view preferences; API keys are not persisted. PDF reading state and document type overrides are stored by the Bun-owned `DocumentStateRepository` under Electrobun user data. The current provider call is a non-streaming OpenAI-compatible request; streaming cancellation, durable chat history, lexical chunk retrieval and source-chip navigation remain subsequent implementation-plan gates rather than being simulated.

## 2026-10-10 implementation update

The paragraph above records the original August foundation, not the current implementation. The current app uses the existing fixed Ollama Cloud endpoint and encrypted key repository. All generation entry points now share `StudyService`, a provider interface, streaming transport and cancellation. SQLite stores source blocks, immutable response evidence, durable conversations, goals and interactive learning progress. Bounded lexical retrieval and source-chip navigation are implemented. Codex login/account/model support exists, while inference remains behind G3. See ADR 003–005 and `docs/qa/research-platform-spike.md` for current validation and limitations.
