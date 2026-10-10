import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createReadStream, rmSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

type OpenDocument = {
  id: string
  path: string
  fileName: string
  size: number
  hash: string
  owned: boolean
}

type DropUploadTicket = {
  fileName: string
  sizeBytes: number
  expiresAt: number
}

const PDF_MAGIC = "%PDF-"
const MAX_LOGGABLE_ERROR_LENGTH = 240
const MAX_PDF_SIZE_BYTES = 2 * 1024 * 1024 * 1024
const DROP_UPLOAD_TTL_MS = 60_000

function parseRange(value: string | null, size: number): { start: number; end: number } | null {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return null

  const startText = match[1] ?? ""
  const endText = match[2] ?? ""
  if (!startText && !endText) return null

  if (!startText) {
    const suffixLength = Number(endText)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }

  const start = Number(startText)
  const requestedEnd = endText ? Number(endText) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null
  if (start < 0 || requestedEnd < start || start >= size) return null
  return { start, end: Math.min(requestedEnd, size - 1) }
}

async function sha256(path: string): Promise<string> {
  const hasher = createHash("sha256")
  const stream = createReadStream(path)
  for await (const chunk of stream) hasher.update(chunk)
  return hasher.digest("hex")
}

export class PdfSourceBridge {
  readonly #documents = new Map<string, OpenDocument>()
  readonly #dropUploadTickets = new Map<string, DropUploadTicket>()
  readonly #token = randomBytes(32).toString("base64url")
  #server: ReturnType<typeof Bun.serve> | null = null
  #dropDirectory: string | null = null

  async start(): Promise<void> {
    if (this.#server) return
    this.#dropDirectory = await mkdtemp(join(tmpdir(), "pdfie-drop-"))
    this.#server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      maxRequestBodySize: MAX_PDF_SIZE_BYTES,
      fetch: (request) => this.#serve(request),
    })
  }

  get origin(): string {
    if (!this.#server) throw new Error("PDF source bridge is not running")
    return `http://127.0.0.1:${this.#server.port}`
  }

  async register(path: string, options: { fileName?: string; owned?: boolean } = {}) {
    await this.start()
    const file = Bun.file(path)
    const magic = await file.slice(0, PDF_MAGIC.length).text()
    if (magic !== PDF_MAGIC) throw new Error("선택한 파일은 유효한 PDF가 아닙니다.")

    const id = randomUUID()
    const document: OpenDocument = {
      id,
      path,
      fileName: options.fileName ?? basename(path),
      size: file.size,
      hash: await sha256(path),
      owned: options.owned ?? false,
    }
    this.#documents.set(id, document)
    return this.#sourceFor(document)
  }

  async prepareDropUpload(fileName: string, sizeBytes: number) {
    await this.start()
    const safeFileName = basename(fileName.trim())
    if (!safeFileName?.toLowerCase().endsWith(".pdf")) {
      throw new Error("PDF 파일만 열 수 있습니다.")
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new Error("비어 있거나 크기를 확인할 수 없는 파일입니다.")
    }
    if (sizeBytes > MAX_PDF_SIZE_BYTES) {
      throw new Error("2GB보다 큰 PDF는 열 수 없습니다.")
    }

    const now = Date.now()
    for (const [ticket, pending] of this.#dropUploadTickets) {
      if (pending.expiresAt <= now) this.#dropUploadTickets.delete(ticket)
    }

    const ticket = randomBytes(32).toString("base64url")
    this.#dropUploadTickets.set(ticket, {
      fileName: safeFileName,
      sizeBytes,
      expiresAt: now + DROP_UPLOAD_TTL_MS,
    })
    return { uploadUrl: `${this.origin}/upload/${ticket}` }
  }

  getSource(documentId: string) {
    const document = this.#documents.get(documentId)
    if (!document) throw new Error("드롭한 PDF를 찾을 수 없습니다. 다시 시도해 주세요.")
    return this.#sourceFor(document)
  }

  persistentPath(documentId: string): string | null {
    const document = this.#documents.get(documentId)
    return document && !document.owned ? document.path : null
  }

  #sourceFor(document: OpenDocument) {
    return {
      documentId: document.id,
      transport: "loopback-range" as const,
      url: `${this.origin}/document/${encodeURIComponent(document.id)}?token=${encodeURIComponent(this.#token)}`,
      fileName: document.fileName,
      documentHash: document.hash,
      sizeBytes: document.size,
    }
  }

  closeDocument(documentId: string): boolean {
    const document = this.#documents.get(documentId)
    if (!document) return false
    this.#documents.delete(documentId)
    if (document.owned) rmSync(document.path, { force: true })
    return true
  }

  close(): void {
    for (const documentId of this.#documents.keys()) this.closeDocument(documentId)
    this.#dropUploadTickets.clear()
    this.#server?.stop(true)
    this.#server = null
    if (this.#dropDirectory) rmSync(this.#dropDirectory, { recursive: true, force: true })
    this.#dropDirectory = null
  }

  async #serve(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const uploadMatch = /^\/upload\/([^/]+)$/.exec(url.pathname)
      if (uploadMatch) return await this.#receiveDropUpload(request, decodeURIComponent(uploadMatch[1] ?? ""))

      const match = /^\/document\/([^/]+)$/.exec(url.pathname)
      if (!match || url.searchParams.get("token") !== this.#token) {
        return new Response("Not found", { status: 404 })
      }

      const documentId = decodeURIComponent(match[1] ?? "")
      const document = this.#documents.get(documentId)
      if (!document) return new Response("Not found", { status: 404 })
      if (request.method === "OPTIONS") return this.#corsResponse(null, 204)
      if (request.method !== "GET" && request.method !== "HEAD") {
        return this.#corsResponse("Method not allowed", 405)
      }

      const file = Bun.file(document.path)
      const rangeHeader = request.headers.get("range")
      const range = parseRange(rangeHeader, document.size)
      if (rangeHeader && !range) {
        return this.#corsResponse("Range not satisfiable", 416, {
          "Content-Range": `bytes */${document.size}`,
        })
      }

      if (range) {
        const length = range.end - range.start + 1
        const body = request.method === "HEAD" ? null : file.slice(range.start, range.end + 1)
        return this.#corsResponse(body, 206, {
          "Accept-Ranges": "bytes",
          "Content-Length": String(length),
          "Content-Range": `bytes ${range.start}-${range.end}/${document.size}`,
          "Content-Type": "application/pdf",
          "Cache-Control": "no-store",
        })
      }

      return this.#corsResponse(request.method === "HEAD" ? null : file, 200, {
        "Accept-Ranges": "bytes",
        "Content-Length": String(document.size),
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[PdfSourceBridge] ${message.slice(0, MAX_LOGGABLE_ERROR_LENGTH)}`)
      return this.#corsResponse("Unable to read PDF", 500)
    }
  }

  async #receiveDropUpload(request: Request, ticketId: string): Promise<Response> {
    const ticket = this.#dropUploadTickets.get(ticketId)
    if (!ticket || ticket.expiresAt <= Date.now()) {
      this.#dropUploadTickets.delete(ticketId)
      return this.#corsResponse("Upload expired", 410)
    }
    if (request.method === "OPTIONS") return this.#corsResponse(null, 204)
    if (request.method !== "POST") return this.#corsResponse("Method not allowed", 405)

    this.#dropUploadTickets.delete(ticketId)
    const contentLengthHeader = request.headers.get("content-length")
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader)
      if (!Number.isFinite(contentLength) || contentLength !== ticket.sizeBytes) {
        return this.#corsResponse("Upload size mismatch", 400)
      }
    }
    if (!request.body || !this.#dropDirectory) return this.#corsResponse("Missing upload body", 400)

    const destination = join(this.#dropDirectory, `${randomUUID()}.pdf`)
    try {
      const writer = Bun.file(destination).writer()
      const reader = request.body.getReader()
      let written = 0
      try {
        while (true) {
          const { done, value: chunk } = await reader.read()
          if (done) break
          written += chunk.byteLength
          if (written > ticket.sizeBytes) throw new Error("업로드된 PDF가 예상 크기보다 큽니다.")
          writer.write(chunk)
        }
      } catch (error) {
        await reader.cancel(error).catch(() => undefined)
        throw error
      } finally {
        reader.releaseLock()
        await writer.end()
      }
      if (written !== ticket.sizeBytes) throw new Error("업로드된 PDF 크기가 원본과 다릅니다.")
      const source = await this.register(destination, { fileName: ticket.fileName, owned: true })
      return this.#corsResponse(JSON.stringify({ documentId: source.documentId }), 201, {
        "Content-Type": "application/json",
      })
    } catch (error) {
      rmSync(destination, { force: true })
      throw error
    }
  }

  #corsResponse(body: BodyInit | null, status: number, headers: HeadersInit = {}): Response {
    return new Response(body, {
      status,
      headers: {
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
        ...headers,
      },
    })
  }
}

export { parseRange }
