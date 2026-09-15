# Viewer controls regression checks

Verified 2026-09-15 with EmbedPDF 2.14.4.

## Behavior

- One-page and two-page modes render only the current page or pair. Pairs are 1–2, 3–4, etc.; the final odd page appears alone.
- Previous/next buttons and keyboard navigation advance one visible group. Search and outline navigation select the group containing the requested page.
- Pages are centered horizontally and vertically in the PDF viewing area. Oversized pages remain scrollable.
- The zoom dropdown provides Fit Page, Fit Width and 25–500% presets, and displays a custom current percentage after incremental zoom.
- The Rotate wrapper applies both intrinsic PDF rotation and document rotation to tiles, search results and selection layers. Pointer conversion and the selection menu use the same effective rotation.
- The development-only selection QA button, shortcut and result panel are removed from reader chrome. The fixture corpus remains available for tests.

## Verification

- Typecheck and Biome: passed.
- Vitest: 60 tests passed, including page-group boundaries, odd/even endings and invalid page input.
- Bun source bridge integration: passed.
- Development macOS build: passed.
- Native WebKit: opened `multi-page.pdf` through the real file dialog; verified pages 1–2, navigation to final page 3, content rotation, zoom dropdown and centered single/rotated spreads.
- The native test used a copy of the development app with a separate bundle identifier to avoid targeting another running PDFie instance. Its application code is the development build. The installed stable app was not replaced.
- Chromium, using the same reader source and PDFium: checked 200% zoom with scrolling while only the active pair remained mounted; mode switches preserved page 3; searching `page 2` navigated to pages 1–2; dragging a rotated sentence returned the expected text and page rectangle.
- DOM measurement of the centered final page differed from the viewport center by less than 0.01 CSS pixels on both axes.

## Active-spread fit regression

- Replaced document-wide fit sizing with the visible spread's rotated width and height. A final unpaired page no longer reserves the width of an invisible second page.
- Fit Page constrains both dimensions; Fit Width constrains only width. The selected menu item includes the actual percentage. Width-limited layouts may correctly produce equal percentages.
- Native WebKit, same window and final page: Fit Page displayed 100%; Fit Width displayed 138% and expanded the content to the viewport width.
- Chromium: the same transition was 135% to 179%; closing the navigation panel recomputed Fit Width to 216%; manual zoom left fit mode.
- Added tests for unpaired pages, two-page gutters, equal modes on width-limited layouts and sidebar resizing.
