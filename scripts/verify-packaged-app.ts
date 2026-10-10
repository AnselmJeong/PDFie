import { access, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const target = process.argv[2] ?? "build/stable-macos-arm64/PDFie.app"
let inspectionTarget = target
let temporaryDirectory: string | null = null

try {
  await access(join(target, "Contents/Resources/app"))
} catch {
  const resources = join(target, "Contents/Resources")
  const payload = (await readdir(resources)).find((name) => name.endsWith(".tar.zst"))
  if (!payload) throw new Error(`No unpacked app or stable payload found in ${target}`)

  temporaryDirectory = await mkdtemp(join(tmpdir(), "pdfie-package-verify-"))
  const extract = Bun.spawnSync([
    "tar",
    "--use-compress-program=unzstd",
    "-xf",
    join(resources, payload),
    "-C",
    temporaryDirectory,
  ])
  if (extract.exitCode !== 0) throw new Error(new TextDecoder().decode(extract.stderr))
  inspectionTarget = join(temporaryDirectory, "PDFie.app")
}

const requiredFiles = [
  "Contents/Info.plist",
  "Contents/MacOS/launcher",
  "Contents/Resources/app/bun/index.js",
  "Contents/Resources/app/views/main/index.html",
  "Contents/Resources/app/views/main/settings.html",
  "Contents/Resources/app/views/main/index.js",
  "Contents/Resources/app/views/main/app.css",
  "Contents/Resources/app/views/main/bootstrap.js",
  "Contents/Resources/app/views/main/assets/pdfium.wasm",
  "Contents/Resources/app/views/sandbox/index.html",
  "Contents/Resources/app/views/sandbox/index.js",
  "Contents/Resources/app/views/sandbox/host.html",
  "Contents/Resources/app/views/sandboxHost/host.js",
  "Contents/Resources/app/licenses/OpenIntelligentUI-LICENSE",
]

for (const relativePath of requiredFiles) await access(join(inspectionTarget, relativePath))

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    }),
  )
  return nested.flat()
}

const files = await walk(inspectionTarget)
const forbidden = files.filter((path) => /(^|\/)(cef|chromium)(\/|$)|Chromium|libcef/i.test(path))
if (forbidden.length) throw new Error(`CEF/Chromium assets found:\n${forbidden.join("\n")}`)

const wasmSize = (await stat(join(inspectionTarget, "Contents/Resources/app/views/main/assets/pdfium.wasm")))
  .size
if (wasmSize < 1_000_000) throw new Error(`pdfium.wasm is unexpectedly small: ${wasmSize} bytes`)

const totalBytes = (
  await Promise.all(
    files.map(async (path) => {
      const info = await stat(path)
      return info.size
    }),
  )
).reduce((sum, size) => sum + size, 0)

console.log(
  JSON.stringify(
    {
      target,
      renderer: "native-webkit",
      cefBundled: false,
      fileCount: files.length,
      totalBytes,
      pdfiumWasmBytes: wasmSize,
    },
    null,
    2,
  ),
)

if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
