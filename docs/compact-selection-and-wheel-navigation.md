# Compact selection actions and fit-page wheel navigation

- Reduce the selection toolbar button height from 34px to 28px, icons from 16px
  to 14px, text to 11px and horizontal padding from 13px to 8px. Keep all actions.
- Handle vertical wheel gestures only inside the PDF viewport in fit-page mode.
  Route turns through the existing page/spread navigation, including boundaries.
- Accumulate small trackpad movements and ignore momentum until the gesture ends.
  Leave modified/horizontal gestures, editable controls and zoomed scrolling alone.
- Verify gesture units, momentum, direction reversal and repeated gestures with
  focused tests, then run typecheck/lint/tests and exercise the native viewer.

Validation: typecheck, lint, 76 Vitest checks and both Bun integration checks passed.
Native WebKit development build: wheel moved 3 → 1 → 3 in two-page view and
3 → 2 in single-page view. At manual 110% zoom, wheel scrolling kept page 2.
Selecting text displayed all actions in the smaller toolbar (about 34px total
height versus 42px previously, including padding and borders).
