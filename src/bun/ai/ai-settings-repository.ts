import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

interface EncryptedSecret {
  iv: string
  tag: string
  value: string
}

interface StoredAiSettings {
  apiKey?: EncryptedSecret
  selectedModel: string
  sidebarWidth: number
  sidebarFontSize: number
}

export interface AiSettingsStatus {
  endpoint: "https://ollama.com/v1"
  hasApiKey: boolean
  selectedModel: string
  sidebarWidth: number
  sidebarFontSize: number
}

const DEFAULTS: StoredAiSettings = {
  selectedModel: "",
  sidebarWidth: 390,
  sidebarFontSize: 14,
}

export class AiSettingsRepository {
  #settings: StoredAiSettings = { ...DEFAULTS }
  #key: Buffer | null = null

  private constructor(
    readonly path: string,
    readonly keyPath: string,
  ) {}

  static async open(path: string, keyPath: string): Promise<AiSettingsRepository> {
    const repository = new AiSettingsRepository(path, keyPath)
    try {
      repository.#settings = {
        ...DEFAULTS,
        ...(JSON.parse(await readFile(path, "utf8")) as Partial<StoredAiSettings>),
      }
    } catch {}
    return repository
  }

  status(): AiSettingsStatus {
    return {
      endpoint: "https://ollama.com/v1",
      hasApiKey: Boolean(process.env.OLLAMA_API_KEY?.trim() || this.#settings.apiKey),
      selectedModel: this.#settings.selectedModel,
      sidebarWidth: this.#settings.sidebarWidth,
      sidebarFontSize: this.#settings.sidebarFontSize,
    }
  }

  async getApiKey(): Promise<string> {
    const environmentKey = process.env.OLLAMA_API_KEY?.trim()
    if (environmentKey) return environmentKey
    const secret = this.#settings.apiKey
    if (!secret) return ""
    const key = await this.#getOrCreateKey()
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"))
    decipher.setAuthTag(Buffer.from(secret.tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(secret.value, "base64")), decipher.final()]).toString(
      "utf8",
    )
  }

  async update(patch: {
    apiKey?: string
    clearApiKey?: boolean
    selectedModel?: string
    sidebarWidth?: number
    sidebarFontSize?: number
  }): Promise<AiSettingsStatus> {
    if (patch.clearApiKey) this.#settings.apiKey = undefined
    if (patch.apiKey?.trim()) {
      const key = await this.#getOrCreateKey()
      const iv = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key, iv)
      const encrypted = Buffer.concat([cipher.update(patch.apiKey.trim(), "utf8"), cipher.final()])
      this.#settings.apiKey = {
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        value: encrypted.toString("base64"),
      }
    }
    if (typeof patch.selectedModel === "string") this.#settings.selectedModel = patch.selectedModel.trim()
    if (Number.isFinite(patch.sidebarWidth)) {
      this.#settings.sidebarWidth = Math.min(560, Math.max(320, Math.round(patch.sidebarWidth ?? 390)))
    }
    if (Number.isFinite(patch.sidebarFontSize)) {
      this.#settings.sidebarFontSize = Math.min(19, Math.max(12, Math.round(patch.sidebarFontSize ?? 14)))
    }
    await this.#persist()
    return this.status()
  }

  async #getOrCreateKey(): Promise<Buffer> {
    if (this.#key) return this.#key
    try {
      const key = await readFile(this.keyPath)
      if (key.length === 32) {
        this.#key = key
        return key
      }
    } catch {}

    const key = randomBytes(32)
    await mkdir(dirname(this.keyPath), { recursive: true })
    await writeFile(this.keyPath, key, { mode: 0o600 })
    await chmod(this.keyPath, 0o600)
    this.#key = key
    return key
  }

  async #persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${crypto.randomUUID()}.tmp`
    await Bun.write(temporary, JSON.stringify(this.#settings, null, 2))
    await chmod(temporary, 0o600)
    await rename(temporary, this.path)
  }
}
