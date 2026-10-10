// OpenIntelligentUI's rendering contract, adapted for PDFie's cited lessons.
export type WidgetState = Record<string, string | number | boolean>
type Common = { title: string; text: string; evidenceIds: string[] }
export type IntelligentLessonStep =
  | (Common & {
      type: "comparison"
      concepts: string[]
      aspects: Array<{ label: string; values: string[]; evidenceIds: string[] }>
    })
  | (Common & {
      type: "concept-map"
      nodes: Array<{ label: string; detail: string; evidenceIds: string[] }>
      edges: Array<{ from: number; to: number; label: string; evidenceIds: string[] }>
    })
  | (Common & {
      type: "evidence-map"
      claims: Array<{
        claim: string
        support: string
        limitation: string
        nextCheck: string
        evidenceIds: string[]
      }>
    })
  | (Common & { type: "signal-experiment"; initial: number })
  | (Common & {
      type: "sandbox"
      initialHeight: number
      css: string
      html: string
      jsFunctions: string
      jsExpressions: string[]
      dataKind: "paper" | "illustrative"
    })
export type SandboxStep = Extract<IntelligentLessonStep, { type: "sandbox" }>

export function validateWidgetState(value: unknown): WidgetState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("맞춤 화면의 저장 상태가 올바르지 않습니다.")
  const entries = Object.entries(value)
  if (entries.length > 24) throw new Error("맞춤 화면의 저장 항목이 너무 많습니다.")
  const state: WidgetState = Object.create(null)
  for (const [key, item] of entries) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) ||
      ["constructor", "prototype", "__proto__"].includes(key) ||
      !(
        typeof item === "boolean" ||
        (typeof item === "string" && item.length <= 500) ||
        (typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 1e9)
      )
    )
      throw new Error("맞춤 화면의 저장 값이 올바르지 않습니다.")
    state[key] = item
  }
  return state
}

// Deterministic binary toy signal. The two displayed measurements are NOT
// estimates of neural complexity, Lempel-Ziv complexity, or a clinical state.
export function illustrativeSignal(randomness: number) {
  const mix = Math.max(0, Math.min(1, randomness))
  let seed = 1729
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
  const values = Array.from({ length: 96 }, (_, i) => {
    const replacement = random() < mix
    const bit = random() < 0.5 ? 0 : 1
    return replacement ? bit : i % 2
  })
  const p = values.filter((v) => v === 1).length / values.length
  const entropy = p === 0 || p === 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
  const transitions = values.slice(1).filter((v, i) => v !== values[i]).length / (values.length - 1)
  return { values, entropy, transitions }
}
