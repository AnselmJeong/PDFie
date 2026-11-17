import type { PluginRegistry } from "@embedpdf/core"
import { type PageReference, pageReferences } from "../../../../../shared/pdf/page-references"
import { isSelfReference, type ReferenceTarget } from "../../../../../shared/pdf/reference-links"
import { nativeDocument } from "./study-analysis"

export { hitTest, type PageReference } from "../../../../../shared/pdf/page-references"

/**
 * Per-document cache of each page's links and textual references, plus the
 * captions and bibliography entries the study index has found so far.
 */
export class ReferenceIndex {
  readonly #pages = new Map<number, Promise<PageReference[]>>()
  #targets: ReferenceTarget[] = []
  #listeners = new Set<() => void>()
  #loadingTargets: Promise<void> | null = null
  #closed = false

  constructor(
    private readonly registry: PluginRegistry,
    private readonly sdkDocumentId: string,
    private readonly loadTargets: () => Promise<ReferenceTarget[]>,
  ) {}

  get targets(): ReferenceTarget[] {
    return this.#targets
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  close() {
    this.#closed = true
    this.#listeners.clear()
  }

  /** Reload captions and bibliography entries (the index grows in the background). */
  refreshTargets(): Promise<void> {
    if (this.#loadingTargets) return this.#loadingTargets
    this.#loadingTargets = this.loadTargets()
      .then((targets) => {
        if (this.#closed) return
        this.#targets = targets
        for (const listener of this.#listeners) listener()
      })
      .catch(() => undefined)
      .finally(() => {
        this.#loadingTargets = null
      })
    return this.#loadingTargets
  }

  page(pageIndex: number): Promise<PageReference[]> {
    const cached = this.#pages.get(pageIndex)
    if (cached) return cached
    const loading = this.#loadPage(pageIndex).catch(() => [] as PageReference[])
    this.#pages.set(pageIndex, loading)
    return loading
  }

  /** Mentions on a page that point to themselves (a caption line) are not links. */
  visible(pageIndex: number, references: PageReference[]): PageReference[] {
    return references.filter(
      (reference) =>
        reference.type !== "mention" || !isSelfReference(reference.mention, pageIndex, this.#targets),
    )
  }

  async #loadPage(pageIndex: number): Promise<PageReference[]> {
    const document = nativeDocument(this.registry, this.sdkDocumentId)
    const page = document.pages[pageIndex]
    if (!page) return []
    return pageReferences(this.registry.getEngine(), document, page)
  }
}
