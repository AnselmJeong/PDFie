import { readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { CodexProvider } from "../src/bun/ai/providers/codex-provider"

if (!process.argv.includes("--live")) throw new Error("Pass --live to run this small live acceptance check.")
const imagePath = process.argv.find((value) => value.endsWith(".png"))
if (!imagePath) throw new Error("Pass the generated red-square PNG fixture path.")
const home = join(homedir(), "Library/Application Support/dev.aquatope.pdfie/stable/codex")
const provider = new CodexProvider(home)
const reportPath = join(process.cwd(), "docs/qa/codex-inference-20261010.json")
try {
  const report = JSON.parse(await readFile(reportPath, "utf8"))
  const transport = await provider.connect()
  const models = await provider.models()
  const model = models.find((row) => row.id === report.model && row.vision)
  if (!model) throw new Error("A verified image-capable model is required")
  let text = ""
  await provider.generate(
    {
      requestId: "qa-image",
      model: model.id,
      system:
        "Return a JSON object with color: the dominant color in the supplied image, in English. No other text.",
      prompt: "Identify the dominant color of the image.",
      history: [],
      imageDataUrl: `data:image/png;base64,${(await readFile(imagePath)).toString("base64")}`,
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["color"],
        properties: { color: { type: "string" } },
      },
      signal: AbortSignal.timeout(90000),
    },
    (token) => {
      text += token
    },
  )
  report.imageInference = JSON.parse(text).color.toLowerCase().includes("red")
  const controller = new AbortController()
  const request = transport.request.bind(transport)
  let interruptAcknowledged = false
  transport.request = async <T>(method: string, params: unknown): Promise<T> => {
    const response = await request<T>(method, params)
    if (method === "turn/start") setTimeout(() => controller.abort(), 25)
    if (method === "turn/interrupt") interruptAcknowledged = true
    return response
  }
  let emitted = 0
  let stopped = false
  try {
    await provider.generate(
      {
        requestId: "qa-stop",
        model: model.id,
        system: "Return one JSON object. This is a synthetic interruption test.",
        prompt: "Write a long JSON array of 2000 numbered example sentences.",
        history: [],
        signal: controller.signal,
      },
      () => {
        emitted++
      },
    )
  } catch {
    stopped = controller.signal.aborted
  }
  report.stopCheck = {
    stopped,
    interruptAcknowledged,
    emittedAfterStop: emitted,
    processClosed: transport.closed,
  }
  if (!report.imageInference || !stopped || !interruptAcknowledged || emitted !== 0 || !transport.closed)
    throw new Error("Media/stop acceptance check failed")
  report.mediaCheckedAt = new Date().toISOString()
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ imageInference: report.imageInference, stopCheck: report.stopCheck }))
} finally {
  provider.close()
}
