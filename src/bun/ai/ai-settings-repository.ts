import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { constants } from "node:fs"
import { chmod, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { ProviderId } from "../../shared/study/contracts"

interface EncryptedSecret {
  iv: string
  tag: string
  value: string
}

interface StoredAiSettings {
  provider: ProviderId
  providerModels: Partial<Record<ProviderId, string>>
  apiKey?: EncryptedSecret
  selectedModel: string
  sidebarWidth: number
  sidebarFontSize: number
}

export interface AiSettingsStatus {
  provider: ProviderId
  endpoint: "https://ollama.com/v1"
  hasApiKey: boolean
  selectedModel: string
  sidebarWidth: number
  sidebarFontSize: number
}

const DEFAULTS: StoredAiSettings = {
  provider: "ollama-cloud",
  providerModels: {},
  selectedModel: "",
  sidebarWidth: 390,
  sidebarFontSize: 14,
}

export class AiSettingsRepository {
  #settings: StoredAiSettings = { ...DEFAULTS }
  #key: Buffer | null = null
  #legacy = false
  #loadFailed = false

  private constructor(
    readonly path: string,
    readonly keyPath: string,
  ) {}

  static async open(path: string, keyPath: string): Promise<AiSettingsRepository> {
    const repository = new AiSettingsRepository(path, keyPath)
    try {
      const stored = JSON.parse(await readFile(path, "utf8")) as Partial<StoredAiSettings>
      repository.#legacy = !stored.provider
      repository.#settings = {
        ...DEFAULTS,
        ...stored,
        provider: stored.provider === "codex" ? "codex" : "ollama-cloud",
        providerModels: stored.providerModels ?? {},
      }
    } catch (cause) {
      repository.#loadFailed = (cause as NodeJS.ErrnoException).code !== "ENOENT"
    }
    return repository
  }

  status(): AiSettingsStatus {
    return {
      provider: this.#settings.provider,
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
    provider?: ProviderId
    apiKey?: string
    clearApiKey?: boolean
    selectedModel?: string
    sidebarWidth?: number
    sidebarFontSize?: number
  }): Promise<AiSettingsStatus> {
    if (this.#loadFailed)
      throw new Error("기존 AI 설정 파일을 읽지 못했습니다. 원본을 보존했으므로 복구 후 다시 시도하세요.")
    if (patch.provider && patch.provider !== this.#settings.provider) {
      if (!["ollama-cloud", "codex"].includes(patch.provider)) throw new Error("지원하지 않는 AI 연결입니다.")
      this.#settings.providerModels[this.#settings.provider] = this.#settings.selectedModel
      this.#settings.provider = patch.provider
      this.#settings.selectedModel = this.#settings.providerModels[patch.provider] ?? ""
    }
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
    if (this.#legacy) {
      try {
        await copyFile(this.path, `${this.path}.pre-study-v1.bak`, constants.COPYFILE_EXCL)
        await chmod(`${this.path}.pre-study-v1.bak`, 0o600)
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause
      }
    }
    const temporary = `${this.path}.${crypto.randomUUID()}.tmp`
    await Bun.write(temporary, JSON.stringify(this.#settings, null, 2))
    await chmod(temporary, 0o600)
    await rename(temporary, this.path)
    this.#legacy = false
  }
}
