# ADR 008: Astryx design system and reader workspace redesign

Date: 2026-11-10  
Status: Implemented (reader, study panel, selection card and tokens; library; settings; study lists, lessons and feedback)

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

### Study lists, lessons and feedback (phase 4)

- Goal and section lists open with a compact header (title, 다시 제안, a passed-check `ProgressBar`). Row actions are Astryx buttons (설명, 함께 공부하기) and a `DropdownMenu` for edit, reorder, split, merge and delete, replacing the hand-built popovers and their outside-click handling. Hover-revealed actions stay visible while a row's menu is open.
- Lesson player controls (expand, answer check, reveal, previous/next/finish), the result view's back and regenerate actions, the generation stop button and the paper classification form use Astryx buttons.
- Errors and notices in the reader and library are Astryx toasts (`LayerProvider` + `useToast`, bottom end); errors persist until dismissed and the library's offer a reload.
- Reader notices (evidence return, highlight undo, read-aloud, viewer errors) float as pills over the canvas instead of pushing the page down.
- The navigation rail's tabs are a `SegmentedControl`; the annotations rail shows one card per passage tinted by its highlight color, with inline swatches, page link, delete and an inline note.
- Sidebar and library content tabs use the WAI-ARIA tabs pattern (`role="tablist"`, `panelId`).
- Generic descendant rules (`.lesson-player button`, `.study-actions button`, …) now exclude Astryx components, so app-layer CSS never restyles them.

## Consequences

- Astryx is pre-1.0. Pin exact versions and use `astryx upgrade --apply` codemods when moving.
- Menus and tooltips use the Popover API and CSS anchor positioning (Astryx "Tier 1": Safari 26+). On macOS 14/15 this requires current Safari/WebKit updates; older WebKit opens and dismisses layers correctly but may not place them next to their trigger. The selected-text card is positioned by PDFie and unaffected.
- Component docs are available offline: `bunx astryx component <Name>`, `bunx astryx docs <topic>`.

### Follow-ups (phase 5)

- **PDFie theme.** `src/views/main/theme/pdfie.source.ts` extends neutral with `defineTheme`, replacing Figtree (a Google Fonts download the CSP blocks) with the native macOS stack and Korean fallbacks. `bun run theme:build` writes the built module and stylesheet beside it (`pdfie.js`, `pdfie.css`, declarations); `bun run theme:check` fails when they are stale. The app loads `pdfie.css` as `astryx-theme.css`, sets `<html data-astryx-theme="pdfie">` and passes the built `pdfieTheme` to `<Theme>`, so the app stylesheet no longer overrides font tokens. Rebuild after upgrading Astryx. (Neutral's compact touch adaptation still names Figtree; it never applies on a Mac.)
- **Inset window chrome.** Both windows use `titleBarStyle: "hiddenInset"`, so PDFie's title bars are the windows'. Title bars carry Electrobun's `electrobun-webkit-app-region-drag` class and every control cluster `…-no-drag` (`src/views/main/window-chrome.ts`); the study panel header, a strip at the top of the canvas in focus mode and the top of the settings window are drag regions too. Leading title-bar padding (`--traffic-light-inset`, 80px) leaves room for the window controls. Double-clicking empty title-bar space zooms the window through `app.window.zoom`.
- **Window control position.** `BrowserWindow.setWindowButtonPosition(18, 16)` places the close button's top-left corner absolutely (Electrobun 1.18.1 `applyWindowButtonPosition`: 20pt spacing, title-bar container resized to fit, re-applied after resizes and full screen). With the standard 14×16 button frame that centres the controls in the title bars, which are all 48px (reader, study panel header, library). `trafficLightOffset` is not used: it is relative to the default position and is ignored once a custom position is set.
- **Full screen.** macOS hides the window controls in full screen. Each window's `resize` handler compares `isFullScreen()` and sends `app.window.fullScreen` to its view; views also ask `app.window.state` on load. `<html data-fullscreen>` drops `--traffic-light-inset` to 14px, so title bars start at the edge.
- **Classification form.** The topic is an Astryx `TextInput` with matching existing topics offered as chips (so papers reuse names); collections are a `CheckboxList`.
- **Lesson widgets.** The illustrative signal and experiment inputs are Astryx `Slider`s with value text; the experiment saves when a drag ends.

## Possible follow-ups

- If a future macOS changes the window button frame height, adjust `WINDOW_BUTTONS.y` in `src/bun/index.ts` (centre = y + height / 2 = 24).
