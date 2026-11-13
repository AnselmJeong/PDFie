import { access } from "node:fs/promises"
import { join } from "node:path"

if (process.env.ELECTROBUN_OS !== "macos") process.exit(0)

const appName = process.env.ELECTROBUN_APP_NAME ?? "PDFie"
const bundlePath =
  process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH ??
  join(process.env.ELECTROBUN_BUILD_DIR ?? "build", appName.endsWith(".app") ? appName : `${appName}.app`)
const plistPath = join(bundlePath, "Contents/Info.plist")
await access(plistPath)

const plistBuddy = (command: string, { optional = false } = {}) => {
  const result = Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", command, plistPath])
  if (result.exitCode !== 0 && !optional)
    throw new Error(`PlistBuddy "${command}": ${new TextDecoder().decode(result.stderr)}`)
}

plistBuddy("Delete :LSMinimumSystemVersion", { optional: true })
plistBuddy("Add :LSMinimumSystemVersion string 14.0")
console.log(`Set LSMinimumSystemVersion=14.0 in ${plistPath}`)

// Offer PDFie in Finder's "Open With" for PDFs. Declare the system PDF type
// (com.adobe.pdf) as an alternate viewer; Electrobun's fileAssociations would
// instead export an app-specific UTI that macOS never assigns to .pdf files.
for (const key of ["CFBundleDocumentTypes", "UTExportedTypeDeclarations", "UTImportedTypeDeclarations"])
  plistBuddy(`Delete :${key}`, { optional: true })
for (const command of [
  "Add :CFBundleDocumentTypes array",
  "Add :CFBundleDocumentTypes:0 dict",
  "Add :CFBundleDocumentTypes:0:CFBundleTypeName string PDF document",
  "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Viewer",
  "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate",
  "Add :CFBundleDocumentTypes:0:LSItemContentTypes array",
  "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string com.adobe.pdf",
])
  plistBuddy(command)
console.log(`Declared PDFie as a PDF viewer (com.adobe.pdf) in ${plistPath}`)

// Bundle the isolated import worker beside the main process; it resolves PDFium from app resources.
const worker = await Bun.build({
  entrypoints: ["src/bun/pdf/import-worker.ts"],
  outdir: join(bundlePath, "Contents/Resources/app/bun"),
  target: "bun",
  naming: "import-worker.js",
  minify: true,
})
if (!worker.success) throw new Error(worker.logs.map(String).join("\n"))
