import { defineTheme } from "@astryxdesign/core/theme"
import { neutralTheme } from "@astryxdesign/theme-neutral"

/**
 * PDFie's Astryx theme: neutral's restrained grays with native macOS type and
 * Korean fallbacks (neutral ships Figtree from Google Fonts, which the app's
 * CSP blocks). Rebuild after editing or upgrading Astryx:
 *   bun run theme:build
 */
const body =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'
const heading =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'

export const pdfieTheme = defineTheme({
  name: "pdfie",
  extends: neutralTheme,
  tokens: {
    "--font-family-body": body,
    "--font-family-heading": heading,
  },
})
