export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1), Math.max(1, pageCount))
}

export function getPageGroup(page: number, pageCount: number, twoPages: boolean) {
  const current = clampPage(page, pageCount)
  const size = twoPages ? 2 : 1
  const first = Math.floor((current - 1) / size) * size + 1
  const last = Math.min(first + size - 1, Math.max(1, pageCount))
  return {
    first,
    last,
    previous: first > 1 ? first - size : null,
    next: last < pageCount ? last + 1 : null,
  }
}
