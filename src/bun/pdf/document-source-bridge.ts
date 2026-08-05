import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { basename } from "node:path"

type OpenDocument = {
  id: string
  path: string
  fileName: string
  size: number
  hash: string
}

const PDF_MAGIC = "%PDF-"
const MAX_LOGGABLE_ERROR_LENGTH = 240

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
  readonly #token = randomBytes(32).toString("base64url")
  #server: ReturnType<typeof Bun.serve> | null = null

  async start(): Promise<void> {
    if (this.#server) return
    this.#server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => this.#serve(request),
    })
  }

  get origin(): string {
    if (!this.#server) throw new Error("PDF source bridge is not running")
    return `http://127.0.0.1:${this.#server.port}`
  }

  async register(path: string) {
    await this.start()
    const file = Bun.file(path)
    const magic = await file.slice(0, PDF_MAGIC.length).text()
    if (magic !== PDF_MAGIC) throw new Error("선택한 파일은 유효한 PDF가 아닙니다.")

    const id = randomUUID()
    const document: OpenDocument = {
      id,
      path,
      fileName: basename(path),
      size: file.size,
      hash: await sha256(path),
    }
    this.#documents.set(id, document)
    return {
      documentId: id,
      transport: "loopback-range" as const,
      url: `${this.origin}/document/${encodeURIComponent(id)}?token=${encodeURIComponent(this.#token)}`,
      fileName: document.fileName,
      documentHash: document.hash,
      sizeBytes: document.size,
    }
  }

  closeDocument(documentId: string): boolean {
    return this.#documents.delete(documentId)
  }

  close(): void {
    this.#documents.clear()
    this.#server?.stop(true)
    this.#server = null
  }

  async #serve(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
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

  #corsResponse(body: BodyInit | null, status: number, headers: HeadersInit = {}): Response {
    return new Response(body, {
      status,
      headers: {
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
        ...headers,
      },
    })
  }
}

export { parseRange }
