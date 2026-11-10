# ADR 008: Astryx design system and reader workspace redesign

Date: 2026-11-10  
Status: Phase 1 implemented (reader, study panel, selection card, tokens); later phases planned

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

## Consequences

- Astryx is pre-1.0. Pin exact versions and use `astryx upgrade --apply` codemods when moving.
- Menus and tooltips use the Popover API and CSS anchor positioning (Astryx "Tier 1": Safari 26+). On macOS 14/15 this requires current Safari/WebKit updates; older WebKit opens and dismisses layers correctly but may not place them next to their trigger. The selected-text card is positioned by PDFie and unaffected.
- Component docs are available offline: `bunx astryx component <Name>`, `bunx astryx docs <topic>`.

## Later phases

1. Library: header as the same title bar, cards and filters on Astryx `Card`, `SideNav`, `TextInput`, `Selector`, `SegmentedControl`.
2. Settings window on Astryx `Field`, `TextInput`, `Selector`, `Switch`, `Button`.
3. Goal and section lists, lesson player and import panels on Astryx primitives; replace remaining hand-rolled toasts with `ToastViewport`/`useToast`.
4. Optionally a `defineTheme` extension of neutral (built with `astryx theme build`) once PDFie needs its own accent or component overrides.
