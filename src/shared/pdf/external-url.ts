/** Only web and mail links from a PDF may leave the app; anything else is refused. */
export function safeExternalUrl(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > 4096) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol === "http:" || url.protocol === "https:") return url.href
  if (url.protocol === "mailto:" && url.pathname.includes("@")) return url.href
  return null
}
