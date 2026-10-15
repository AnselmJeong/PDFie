import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { PdfOutlineNode } from "../../shared/pdf/domain"
import { INDEX_VERSION, type PageAnalysis } from "../../shared/study/contracts"
import type { StudyStore } from "../persistence/study-store"

async function* chunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      yield result.value
    }
  } finally {
    reader.releaseLock()
  }
}

export type BackgroundIndexer = (
  path: string,
  hash: string,
  signal: AbortSignal,
  progress: (page: number, total: number) => void,
) => Promise<void>

/** Isolated PDFium process: a malformed PDF cannot block the reader or the import queue. */
export function backgroundIndexer(store: StudyStore): BackgroundIndexer {
  return async (path, hash, signal, progress) => {
    const here = dirname(fileURLToPath(import.meta.url))
    const packagedWorker = join(here, "import-worker.js")
    const packaged = existsSync(packagedWorker)
    const worker = packaged ? packagedWorker : join(here, "import-worker.ts")
    const wasm = packaged
      ? join(here, "../views/main/assets/pdfium.wasm")
      : fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm"))
    const cached = store.index(hash).revision === `${hash}:${INDEX_VERSION}` ? store.completedPages(hash) : []
    signal.throwIfAborted()
    const child = Bun.spawn([process.execPath, worker, path, wasm, hash, JSON.stringify(cached)], {
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
    })
    const stop = () => child.kill("SIGKILL")
    signal.addEventListener("abort", stop, { once: true })
    let timeout = false
    const timer = setTimeout(() => {
      timeout = true
      stop()
    }, 120000)
    // Drain diagnostics with a bound; do not log document contents.
    const errors = (async () => {
      let text = ""
      for await (const chunk of chunks(child.stderr))
        text = (text + new TextDecoder().decode(chunk)).slice(-3000)
      return text
    })()
    let buffer = "",
      done = false,
      total = 0
    const decoder = new TextDecoder()
    try {
      for await (const chunk of chunks(child.stdout)) {
        signal.throwIfAborted()
        buffer += decoder.decode(chunk, { stream: true })
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (line.startsWith('{"type":')) {
            const packet = JSON.parse(line) as {
              type: string
              pageCount: number
              outline: PdfOutlineNode[]
              page: PageAnalysis
            }
            if (packet.type === "begin") {
              total = packet.pageCount
              store.begin(hash, total, packet.outline)
              progress(cached.length, total)
            } else if (packet.type === "page") {
              store.ingest(hash, packet.page)
              progress(packet.page.pageIndex + 1, total)
            } else if (packet.type === "done") done = true
          }
          newline = buffer.indexOf("\n")
        }
        if (buffer.length > 8_000_000) throw new Error("본문 분석 응답이 너무 큽니다.")
      }
      const code = await child.exited
      await errors
      signal.throwIfAborted()
      if (timeout) throw new Error("PDF 분석 시간이 초과되었습니다. 파일을 확인하고 다시 추가하세요.")
      if (code !== 0 || !done)
        throw new Error("PDF 본문을 분석하지 못했습니다. 손상·암호 여부를 확인하고 다시 추가하세요.")
    } finally {
      clearTimeout(timer)
      signal.removeEventListener("abort", stop)
      if (child.exitCode === null) stop()
      await child.exited
      await errors
    }
  }
}
