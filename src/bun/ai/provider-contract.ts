import type { ModelInfo, ProviderId } from "../../shared/study/contracts"

export interface GenerationInput {
  requestId: string
  model: string
  system: string
  prompt: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  imageDataUrl?: string
  outputSchema?: Record<string, unknown>
  signal: AbortSignal
}
export interface StudyProvider {
  id: ProviderId
  models(): Promise<ModelInfo[]>
  generate(input: GenerationInput, onToken: (token: string) => void): Promise<void>
}
