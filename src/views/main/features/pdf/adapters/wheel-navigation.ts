type PageWheelEvent = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>

/** One page per wheel gesture, including the trackpad's momentum tail. */
export function createWheelPageNavigation() {
  let lastEventAt = Number.NEGATIVE_INFINITY
  let lastTurnAt = Number.NEGATIVE_INFINITY
  let accumulated = 0
  let turned = false

  return (event: PageWheelEvent, now: number, viewportHeight: number): -1 | 0 | 1 => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !event.deltaY ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    )
      return 0

    if (now - lastEventAt > 180) {
      accumulated = 0
      turned = false
    }
    lastEventAt = now
    if (turned || now - lastTurnAt < 280) return 0

    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1
    const delta = event.deltaY * unit
    if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0
    accumulated += delta
    if (Math.abs(accumulated) < 32) return 0

    turned = true
    lastTurnAt = now
    return accumulated > 0 ? 1 : -1
  }
}
