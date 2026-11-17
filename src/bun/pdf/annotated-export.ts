import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const EXPORT_TIMEOUT_MS = 180_000

/** Write `output`, a copy of `input` with `annotations`, in an isolated PDFium process. */
export async function writeAnnotatedCopy(
  input: string,
  output: string,
  annotations: Array<Record<string, unknown>>,
): Promise<{ written: number; skipped: number }> {
  if (input === output) throw new Error("원본 PDF는 덮어쓰지 않습니다.")
  const here = dirname(fileURLToPath(import.meta.url))
  const packagedWorker = join(here, "export-worker.js")
  const packaged = existsSync(packagedWorker)
  const worker = packaged ? packagedWorker : join(here, "export-worker.ts")
  const wasm = packaged
    ? join(here, "../views/main/assets/pdfium.wasm")
    : fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm"))
  const child = Bun.spawn([process.execPath, worker, input, wasm, output], {
    stdin: new TextEncoder().encode(JSON.stringify({ annotations })),
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  })
  const timer = setTimeout(() => child.kill("SIGKILL"), EXPORT_TIMEOUT_MS)
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    const line = stdout.split("\n").find((text) => text.startsWith('{"type":"done"'))
    if (code !== 0 || !line) {
      console.error(`[annotated-export] ${stderr.slice(-600)}`)
      throw new Error(
        "주석을 넣은 PDF를 만들지 못했습니다. 원본 파일이 손상되거나 암호가 걸려 있지 않은지 확인하세요.",
      )
    }
    const result = JSON.parse(line) as { written: number; skipped: number }
    return { written: result.written, skipped: result.skipped }
  } finally {
    clearTimeout(timer)
  }
}
