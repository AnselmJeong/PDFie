import { mkdir, readFile, rename } from "node:fs/promises"
import { dirname } from "node:path"
import type { DocumentType, PdfTextHighlight } from "../../shared/pdf/domain"

export interface PersistedDocumentState {
  currentPage: number
  zoom: number
  rotation: number
  highlights: PdfTextHighlight[]
  documentType: DocumentType
  documentTypeSource: "auto" | "user"
  updatedAt: string
  viewPresetVersion: number
}

const CURRENT_VIEW_PRESET_VERSION = 2

const defaultState = (): PersistedDocumentState => ({
  currentPage: 1,
  zoom: 0,
  rotation: 0,
  highlights: [],
  documentType: "unknown",
  documentTypeSource: "auto",
  updatedAt: new Date(0).toISOString(),
  viewPresetVersion: CURRENT_VIEW_PRESET_VERSION,
})

export class DocumentStateRepository {
  #pendingWrite: Promise<void> = Promise.resolve()
  readonly #records = new Map<string, PersistedDocumentState>()

  private constructor(readonly path: string) {}

  static async open(path: string): Promise<DocumentStateRepository> {
    const repository = new DocumentStateRepository(path)
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, PersistedDocumentState>
      for (const [hash, state] of Object.entries(parsed)) repository.#records.set(hash, state)
    } catch {}
    return repository
  }

  get(documentHash: string): PersistedDocumentState {
    const stored = this.#records.get(documentHash)
    if (!stored) return defaultState()
    return {
      ...defaultState(),
      ...stored,
      highlights: Array.isArray(stored.highlights) ? stored.highlights : [],
      // Version 1 saved FitWidth as a numeric single-page zoom. Reusing that
      // value after switching to a spread would reopen legacy documents at
      // 150–180%, so migrate once to the new two-page FitWidth default.
      zoom: stored.viewPresetVersion === CURRENT_VIEW_PRESET_VERSION ? stored.zoom : 0,
      viewPresetVersion: CURRENT_VIEW_PRESET_VERSION,
    }
  }

  async save(documentHash: string, patch: Partial<Omit<PersistedDocumentState, "updatedAt">>): Promise<void> {
    this.#records.set(documentHash, {
      ...this.get(documentHash),
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    // Serialize atomic replacements: a slower page-position save must never
    // overwrite a newer annotation save after both have returned successfully.
    const write = this.#pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true })
        const temporary = `${this.path}.${crypto.randomUUID()}.tmp`
        await Bun.write(temporary, JSON.stringify(Object.fromEntries(this.#records), null, 2))
        await rename(temporary, this.path)
      })
    this.#pendingWrite = write
    await write
  }
}
