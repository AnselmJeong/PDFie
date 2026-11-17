import { mkdir, readFile, rename, stat } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * File identity that changes whenever the file's bytes may have changed:
 * the inode, the size and both the content and status change times.
 */
export interface FileFingerprint {
  size: number
  mtimeMs: number
  ctimeMs: number
  ino: number
}

interface CachedHash extends FileFingerprint {
  hash: string
  usedAt: number
}

const MAX_ENTRIES = 2000
const WRITE_DELAY_MS = 400

export async function fingerprintOf(path: string): Promise<FileFingerprint> {
  const info = await stat(path)
  return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, ino: info.ino }
}

export function sameFingerprint(a: FileFingerprint, b: FileFingerprint): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.ino === b.ino
}

/**
 * Remembers the SHA-256 of PDFs PDFie has already read in full, keyed by path
 * and fingerprint, so reopening an unchanged file does not read it again.
 * A fingerprint mismatch is a miss: the caller hashes the file afresh.
 */
export class HashCache {
  readonly #entries = new Map<string, CachedHash>()
  #timer: ReturnType<typeof setTimeout> | null = null
  #pendingWrite: Promise<void> = Promise.resolve()

  private constructor(readonly path: string | null) {}

  /** An in-memory cache, for tests and when the cache file cannot be used. */
  static memory(): HashCache {
    return new HashCache(null)
  }

  static async open(path: string): Promise<HashCache> {
    const cache = new HashCache(path)
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, CachedHash>
      for (const [key, entry] of Object.entries(parsed)) {
        if (
          typeof entry?.hash === "string" &&
          /^[0-9a-f]{64}$/.test(entry.hash) &&
          [entry.size, entry.mtimeMs, entry.ctimeMs, entry.ino].every(Number.isFinite)
        )
          cache.#entries.set(key, entry)
      }
    } catch {}
    return cache
  }

  get(path: string, fingerprint: FileFingerprint): string | null {
    const entry = this.#entries.get(path)
    if (!entry || !sameFingerprint(entry, fingerprint)) return null
    entry.usedAt = Date.now()
    return entry.hash
  }

  set(path: string, fingerprint: FileFingerprint, hash: string): void {
    this.#entries.delete(path)
    this.#entries.set(path, { ...fingerprint, hash, usedAt: Date.now() })
    if (this.#entries.size > MAX_ENTRIES) {
      const oldest = [...this.#entries.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)
      for (const [key] of oldest.slice(0, this.#entries.size - MAX_ENTRIES)) this.#entries.delete(key)
    }
    this.#scheduleWrite()
  }

  /**
   * Record a hash computed elsewhere (the library importer) when the file is
   * still the one that was read: its fingerprint before reading must match now.
   */
  async remember(path: string, before: FileFingerprint, hash: string): Promise<void> {
    try {
      if (sameFingerprint(before, await fingerprintOf(path))) this.set(path, before, hash)
    } catch {}
  }

  get size(): number {
    return this.#entries.size
  }

  /** Write any pending change now; resolves once it is on disk. */
  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
      this.#write()
    }
    await this.#pendingWrite
  }

  #scheduleWrite() {
    if (!this.path || this.#timer) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.#write()
    }, WRITE_DELAY_MS)
  }

  #write() {
    const path = this.path
    if (!path) return
    const snapshot = JSON.stringify(Object.fromEntries(this.#entries))
    this.#pendingWrite = this.#pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(path), { recursive: true })
        const temporary = `${path}.${crypto.randomUUID()}.tmp`
        await Bun.write(temporary, snapshot)
        await rename(temporary, path)
      })
      .catch((error) => console.warn(`[HashCache] ${error instanceof Error ? error.message : error}`))
  }
}
