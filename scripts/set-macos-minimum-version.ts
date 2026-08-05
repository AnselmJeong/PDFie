import { access } from "node:fs/promises"
import { join } from "node:path"

if (process.env.ELECTROBUN_OS !== "macos") process.exit(0)

const appName = process.env.ELECTROBUN_APP_NAME ?? "PDFie"
const bundlePath =
  process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH ??
  join(process.env.ELECTROBUN_BUILD_DIR ?? "build", appName.endsWith(".app") ? appName : `${appName}.app`)
const plistPath = join(bundlePath, "Contents/Info.plist")
await access(plistPath)

const set = Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", "Delete :LSMinimumSystemVersion", plistPath])
void set
const add = Bun.spawnSync([
  "/usr/libexec/PlistBuddy",
  "-c",
  "Add :LSMinimumSystemVersion string 14.0",
  plistPath,
])
if (add.exitCode !== 0) throw new Error(new TextDecoder().decode(add.stderr))
console.log(`Set LSMinimumSystemVersion=14.0 in ${plistPath}`)
