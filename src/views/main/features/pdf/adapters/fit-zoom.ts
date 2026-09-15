export type FitMode = "fit-page" | "fit-width"

/** A gated zoom must be requested even when its value already matches 100%. */
export function resolveViewportZoom({
  fitZoom,
  savedZoom,
  currentZoom,
  initializing,
}: {
  fitZoom: number | null
  savedZoom: number | null
  currentZoom: number
  initializing: boolean
}): number | null {
  const target = fitZoom ?? (initializing ? savedZoom : null)
  if (target === null || (!initializing && Math.abs(target - currentZoom) < 0.001)) return null
  return target
}

export function calculateFitZoom(
  mode: FitMode,
  page: { width: number; height: number },
  viewport: { width: number; height: number },
  gap: number,
): number | null {
  const width = viewport.width - 2 * gap
  const height = viewport.height - 2 * gap
  if (width <= 0 || height <= 0 || page.width <= 0 || page.height <= 0) return null
  const fitWidth = width / page.width
  const scale = mode === "fit-width" ? fitWidth : Math.min(fitWidth, height / page.height)
  return Math.floor(Math.min(5, Math.max(0.25, scale)) * 1000) / 1000
}
