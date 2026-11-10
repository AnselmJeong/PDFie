import { access, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const target = process.argv[2] ?? "build/stable-macos-arm64/PDFie.app"
let inspectionTarget = target
let temporaryDirectory: string | null = null

/** Electrobun's bundled zstd, for runners without a system unzstd. */
async function bundledZstd() {
  const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "win" : "linux"
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const path = join("node_modules/electrobun", `dist-${platform}-${arch}`, "zig-zstd")
  await access(path)
  return path
}

// A stable build wraps the real app as a zstd payload inside a self-extracting
// bundle; inspect the payload when there is one, else the unpacked app.
const resources = join(target, "Contents/Resources")
const payload = (await readdir(resources)).find((name) => name.endsWith(".tar.zst"))
if (payload) {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "pdfie-package-verify-"))
  const tarPath = join(temporaryDirectory, "payload.tar")
  const system = Bun.which("unzstd")
  const decompress = system
    ? Bun.spawnSync([system, "-q", "-f", "-o", tarPath, join(resources, payload)])
    : Bun.spawnSync([
        await bundledZstd(),
        "decompress",
        "-i",
        join(resources, payload),
        "-o",
        tarPath,
        "--no-timing",
      ])
  if (decompress.exitCode !== 0) throw new Error(new TextDecoder().decode(decompress.stderr))
  const extract = Bun.spawnSync(["tar", "-xf", tarPath, "-C", temporaryDirectory])
  if (extract.exitCode !== 0) throw new Error(new TextDecoder().decode(extract.stderr))
  const app = (await readdir(temporaryDirectory)).find((name) => name.endsWith(".app"))
  if (!app) throw new Error(`The stable payload in ${target} holds no .app bundle`)
  inspectionTarget = join(temporaryDirectory, app)
} else {
  await access(join(target, "Contents/Resources/app"))
}

const requiredFiles = [
  "Contents/Info.plist",
  "Contents/MacOS/launcher",
  "Contents/Resources/app/bun/index.js",
  "Contents/Resources/app/bun/import-worker.js",
  "Contents/Resources/app/views/main/index.html",
  "Contents/Resources/app/views/main/settings.html",
  "Contents/Resources/app/views/main/index.js",
  "Contents/Resources/app/views/main/app.css",
  "Contents/Resources/app/views/main/astryx.css",
  "Contents/Resources/app/views/main/astryx-theme.css",
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
      inspected: payload ? `payload ${payload}` : "unpacked app",
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
