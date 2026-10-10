# ADR 004: Provider routing and isolated subscription inference

Date: 2026-10-10  
Status: Ollama and verified Codex 0.160.0 active; Claude deferred

## Requested result and boundary

Expand PDFie on macOS using the PRD and implementation plan, followed by the user's PDF extraction, sign-in, layout and permanently disabled goal-button fixes. Keep Electrobun/Bun, native WebKit and EmbedPDF. The same provider boundary handles chat, summaries, goals, lessons and images. The installed app is updated after preserving the previous app and study database. No commit or push is requested.

`StudyService` owns source retrieval, trusted instructions, bounded history, validated output, persistence and cancellation. The active provider/model is captured once per job. Switching providers preserves each provider's model setting and model-loading callbacks discard stale responses.

## Process and authentication design

Ollama Cloud retains its fixed HTTPS endpoint and existing encrypted key store. Vision is advertised only after `/api/show` confirms image capability. Authentication errors, unsupported images, truncated streams and invalid structured output do not fall back to another provider.

Codex uses the installed official CLI, pinned to the live-verified `codex-cli 0.160.0`; other versions fail closed until verified. It runs without a shell, in a PDFie-private home and scratch directory. The environment allowlist excludes inherited API keys, alternative endpoints and runtime-injection variables. Existing user Codex authentication/configuration files are not copied. Login uses official App Server account methods; token handling stays with the CLI, and official auth-host URLs are validated before opening.

The JSON-RPC transport bounds frames, drains stderr without logging its contents, settles requests and turn listeners on EOF/timeout, and denies unsolicited tool/approval requests. A lifecycle guard closes pending initialization on quit/cancel. Executable features, MCP, hooks and plugins are disabled; explicit empty `environments`, runtime workspace roots, dynamic tools and selected capability roots are sent using the installed experimental protocol. The server must confirm empty environments, roots and instruction sources, the requested model/OpenAI provider, and a read-only/no-network sandbox before inference. No tool item or server action request is accepted. Official Codex source documents that empty environments disable execution-environment access and suppress shell tools independently of approval policy.

## Subscription contract

Only `account.type=chatgpt` is accepted for account models. Models come from paginated `model/list`, not hard-coded ChatGPT web-model assumptions. Usage displays `ordinaryUsageAllowed` and applicable model/Codex buckets from `rateLimitsByLimitId` or its legacy equivalent. Missing eligibility stays unknown; exhausted windows stay exhausted. Quotas are shared with the user's other Codex usage.

`CodexProvider.generate` preflights the account, authoritative ordinary-usage eligibility, model catalog and image capability for every request. Each application request owns one ephemeral thread, with application-owned history sent once as data and trusted instructions set separately. Only the completed final answer becomes study data; commentary, reasoning, interrupted output and late notifications are discarded. Goals and answers use output schemas plus domain validation. Cancellation sends the matching `turn/interrupt`, bounds its acknowledgement and closes the process. No paid API adapter or quota-reset/purchase call is present. The default service tier is explicit.

Browser sign-in completion and account changes broadcast to both windows. A quota-refresh failure preserves the successful account connection. The separate Settings window shows a disabled “로그인 완료” button after connection; model selection and appearance changes synchronize with the reading window.

Claude is not connected. The official binary authentication, billing route, permitted integration form, image/stream/cancel behavior and executable-tool exposure require their separate G4 verification.

## Settings migration and validation

Legacy Ollama model, width, font size and encrypted secret are preserved. Before the first migrated write, the previous settings file is copied once with private permissions; the new file is written atomically. Unreadable settings are preserved and updates are blocked rather than overwriting the original.

Tests cover fake streaming/process EOF and malformed data, unsolicited tool requests, matching thread/turn identity, early deltas, final-answer deduplication, stopped/failed turns, history/image transport, quota interpretation, environment isolation, settings backup and routing spies. The user's existing PDFie login completed live text/schema and image inference through `gpt-6.1-sol`. A synthetic private-file canary could neither be read nor changed, with no executable items or server tool requests observed. A live interrupted turn acknowledged `turn/interrupt`, emitted no final answer and closed the process. Safe metadata are recorded in `docs/qa/codex-inference-20261010.json`; credentials and model output are never printed. This verifies the observed 0.160.0 configuration, not every future CLI or a billing ledger audit. Native app acceptance is recorded separately in the QA report.
