/**
 * Files macOS asks PDFie to open: Finder's "Open With", a double-click when
 * PDFie is the default viewer, or a drop on the Dock icon. They arrive through
 * Electrobun's `open-url` event as file:// URLs, carry the file's real
 * location (so the library can reopen it later), and may arrive before the
 * window has loaded, so they wait here until the main view takes them.
 */

/** The PDF path in a file:// open request, or null for anything else. */
export function pdfPathFromOpenUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "file:" || (url.host && url.host !== "localhost")) return null
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  return path.toLowerCase().endsWith(".pdf") ? path : null
}

export class OpenRequests {
  #paths: string[] = []
  #listener: () => void = () => undefined

  /** Queue a request; returns false when the URL is not a local PDF. */
  add(raw: string): boolean {
    const path = pdfPathFromOpenUrl(raw)
    if (!path) return false
    this.#paths = [...this.#paths.filter((queued) => queued !== path), path]
    this.#listener()
    return true
  }

  /** Called whenever a request is queued; set once the main window exists. */
  onAdded(listener: () => void) {
    this.#listener = listener
    if (this.#paths.length) listener()
  }

  /** Hand every queued path to the caller, oldest first. */
  take(): string[] {
    const paths = this.#paths
    this.#paths = []
    return paths
  }
}
