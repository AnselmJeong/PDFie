# ADR 008: Astryx design system and reader workspace redesign

Date: 2026-11-10  
Status: Phases 1–3 implemented (reader, study panel, selection card, tokens; library; settings); later phases planned

## Context

PDFie's features had outgrown its presentation. The reader's title bar mixed document identity, page controls, zoom presets and a native `<select>`; a footer status bar repeated page, zoom, rotation, document type and a developer-facing "Native WebKit" badge. The study panel opened with a large "Study workspace" header, a repeated file name and a page indicator before any content. Explanations showed a "논문에서 확인" badge and a row of page chips under every paragraph. Selected text opened a dark one-line command bar. Every control was hand-styled in a single 5,400-line stylesheet.

## Decision

Adopt [Astryx](https://github.com/meta/astryx) (`@astryxdesign/core` 0.7.11, MIT) with `@astryxdesign/theme-neutral` as PDFie's component library and token source, and restructure the reader around reading.

### Integration

- React 18 → 19 (an Astryx peer requirement; EmbedPDF supports React ≥ 16.8). `@stylexjs/stylex` is a runtime peer only: Astryx ships prebuilt CSS, so the Bun/Electrobun build is unchanged.
- `index.html` and `settings.html` declare the cascade layer order first, then load `astryx.css` (components), the neutral `theme.css` and `app.css`:
  `reset → app-base → astryx-base → astryx-theme → app`.
  Element defaults live in `app-base`, below Astryx components, so a bare `button {}` rule can never restyle an Astryx button. PDFie's own classes live in `app`.
- Astryx's `reset.css` is not loaded: PDFie's existing screens were built against browser defaults. The theme's bare-element typography (`p`, `h1`–`h6`, `small`, …) is reverted outside Astryx components so study prose still inherits the reading-size setting.
- PDFie's historical token names (`--background`, `--muted-foreground`, `--accent`, `--radius`, `--shadow-lg`, …) are bridged to Astryx tokens. Because those use `light-dark()`, light and dark follow the system without a separate dark block, and the library and settings windows adopt the new palette before their components migrate.
- Typography overrides the theme's Figtree (a Google Fonts download, blocked by the CSP) with the native macOS stack and Korean fallbacks.
- `<Theme theme={neutralTheme} mode="system">` wraps both windows; `<html data-astryx-theme="neutral">` is set statically so tokens resolve before React mounts.

### Reader

- **Title bar**: navigation-rail toggle, library, document title (file-name separators removed) with type · page count · size; search, capture and annotations; a single **Ask AI** button that toggles the study panel; a **⋯** menu for document type, rotation, focus mode, export, settings and close. The footer status bar is gone.
- **Floating page dock** on the canvas (bottom-left): a view menu (one/two pages, actual size, fit page, fit width, rotate, focus mode), zoom in/out around the current percentage (click toggles fit page/fit width), an editable page box over the total, and previous/next.
- **Focus mode** (`F`, menu, or dock): hides the title bar, navigation rail and study panel. `F` or `Escape` exits.
- **Selected-text card**: annotation tools (highlight `H`, underline `U`, note, copy, delete), a color row, then actions — Ask AI, 요약하기, 쉽게 풀어 설명, 용어·개념 정의, 소리 내어 읽기. The two new actions are prompts over the existing selection request.

### Study panel

- Tabs (학습 목표 · 섹션 · 대화 · 학습) are the header; close sits beside them. Index progress appears only while pages are being prepared or need attention.
- Answers read as prose. Page citations sit inline at the end of the sentence they support (one chip per page, preview on hover, click to reveal). Only claims that go beyond the document carry a label (해석·추론, 배경 설명, 교육용 예시, 근거 부족). The same renderer (`AnswerBlocks`) serves chat, section summaries and the library.
- User questions are right-aligned bubbles with copy and rewrite; answers have copy, 직접 탐구하기 and a one-line model/coverage note.
- The empty conversation offers three starting questions, including a page-cited summary.
- The composer is one card: quoted passage and capture chips, the question, then scope, capture, key-concept and send.
- A footer shows the model and connection state and A−/A+ reading size (the existing `sidebarFontSize` setting).

### Library (phase 2)

- The library shares the reader's title bar: brand (or **서재** back button in a paper's detail), search, **읽던 PDF**, an **추가** menu (PDF 열기 ⌘O, PDF 여러 개 가져오기, 폴더 가져오기) and settings. The separate intake bar and the topic-cleanup disclosure are gone.
- The sidebar is an Astryx `SideNav`: kinds (전체 자료, 수업 있는 자료, 즐겨찾기, 보관함), topics with counts and 미분류, and collections with a per-row menu (rename, delete). Selecting a selected topic or collection again clears it; facets still combine, and active ones show as removable `Token`s above the results.
- Batch import progress and results are an Astryx `Banner` above the catalog with a `ProgressBar`; details expand on demand, and a finished batch can be dismissed.
- Topic cleanup, collection create/rename and paper rename are `Dialog`s; collection and paper deletion use `AlertDialog`.
- Cards lead with a topic `Badge` (a stable hue per topic), the title (three lines), collections and a passed-check bar; list view is a single bordered table. Sort is a ghost `Selector`, view a `SegmentedControl`.
- The paper detail header uses Astryx buttons (원문 PDF 열기 primary) and a ⋯ menu for rename, archive, relink and delete; content tabs are a `TabList`.
- The unused `EmptyLibrary` component and about 1,700 lines of superseded library CSS were removed.

### Settings (phase 3)

- A macOS-style preferences layout: a sidebar of pages (AI 연결, 화면) and grouped rows with text on the left and controls on the right.
- The AI service is a pair of `SelectableCard`s. The ChatGPT account shows a `StatusDot`, sign-in actions, the allowance as a `Badge` and each usage window as a `ProgressBar` with its reset time. Ollama's API key uses a password `TextInput`; the model is a `Selector` whose options note image support.
- New **appearance** setting (`system` · `light` · `dark`), stored with the existing settings and broadcast through `ai.settings.changed`; the root `<Theme mode>` applies it in every window. Previews are miniature windows drawn in each mode.
- Reading size and panel width are `Slider`s that save when the drag ends.

## Consequences

- Astryx is pre-1.0. Pin exact versions and use `astryx upgrade --apply` codemods when moving.
- Menus and tooltips use the Popover API and CSS anchor positioning (Astryx "Tier 1": Safari 26+). On macOS 14/15 this requires current Safari/WebKit updates; older WebKit opens and dismisses layers correctly but may not place them next to their trigger. The selected-text card is positioned by PDFie and unaffected.
- Component docs are available offline: `bunx astryx component <Name>`, `bunx astryx docs <topic>`.

## Later phases

1. Goal and section lists, the paper classification form, lesson player on Astryx primitives; replace remaining hand-rolled toasts with `ToastViewport`/`useToast`.
2. Optionally a `defineTheme` extension of neutral (built with `astryx theme build`) once PDFie needs its own accent or component overrides.
