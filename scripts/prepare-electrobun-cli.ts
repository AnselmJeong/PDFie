import { existsSync } from "node:fs"
import { resolve } from "node:path"

const projectRoot = resolve(import.meta.dir, "..")
const bootstrap = resolve(projectRoot, "node_modules/electrobun/bin/electrobun.cjs")
const executable = resolve(projectRoot, "node_modules/electrobun/bin/electrobun")

if (!existsSync(bootstrap)) throw new Error("Electrobun is not installed. Run bun install first.")

if (!existsSync(executable)) {
  Bun.spawnSync([process.execPath, bootstrap, "--help"], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  })
}

if (!existsSync(executable)) throw new Error("Electrobun CLI download did not produce an executable.")

if (process.platform === "darwin") {
  const result = Bun.spawnSync(["/usr/bin/codesign", "--force", "--sign", "-", executable], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  })
  if (result.exitCode !== 0) throw new Error(`Unable to ad-hoc sign Electrobun CLI (${result.exitCode}).`)
}
