/**
 * Back/forward history for jumps inside one document (outline, search, links,
 * figure and reference previews, evidence). Ordinary reading — scrolling and
 * turning pages — is not a jump and is not recorded.
 */
export interface ReadingPosition {
  /** 1-based page number. */
  page: number
  /** Top of the visible part of the page, in unscaled page units, when known. */
  y?: number
}

export interface NavigationHistory {
  back: ReadingPosition[]
  forward: ReadingPosition[]
}

export const MAX_HISTORY = 100
/** Positions closer than this on the same page are the same place. */
const SAME_PLACE_DISTANCE = 24

export const emptyHistory = (): NavigationHistory => ({ back: [], forward: [] })

export function samePlace(a: ReadingPosition, b: ReadingPosition): boolean {
  if (a.page !== b.page) return false
  if (a.y === undefined || b.y === undefined) return true
  return Math.abs(a.y - b.y) < SAME_PLACE_DISTANCE
}

/** Record that the reader jumped away from `from`; a new jump clears forward. */
export function recordJump(
  history: NavigationHistory,
  from: ReadingPosition,
  to: ReadingPosition,
): NavigationHistory {
  if (samePlace(from, to)) return history
  const last = history.back.at(-1)
  const back = last && samePlace(last, from) ? history.back : [...history.back, from]
  return { back: back.slice(-MAX_HISTORY), forward: [] }
}

/** Step back from `current`; returns the target, or null with nothing to return to. */
export function goBack(
  history: NavigationHistory,
  current: ReadingPosition,
): { history: NavigationHistory; target: ReadingPosition } | null {
  const target = history.back.at(-1)
  if (!target) return null
  return {
    history: {
      back: history.back.slice(0, -1),
      forward: [current, ...history.forward].slice(0, MAX_HISTORY),
    },
    target,
  }
}

export function goForward(
  history: NavigationHistory,
  current: ReadingPosition,
): { history: NavigationHistory; target: ReadingPosition } | null {
  const target = history.forward[0]
  if (!target) return null
  return {
    history: {
      back: [...history.back, current].slice(-MAX_HISTORY),
      forward: history.forward.slice(1),
    },
    target,
  }
}
