import type { PdfRect } from "../pdf/domain"
export function unrotatePoint(x: number, y: number, width: number, height: number, rotation: number) {
  switch (rotation % 4) {
    case 1:
      return { x: y, y: height - x }
    case 2:
      return { x: width - x, y: height - y }
    case 3:
      return { x: width - y, y: x }
    default:
      return { x, y }
  }
}
export function dragRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  height: number,
): PdfRect {
  const left = Math.max(0, Math.min(start.x, end.x)),
    top = Math.max(0, Math.min(start.y, end.y))
  return {
    x: left,
    y: top,
    width: Math.max(0, Math.min(width, Math.max(start.x, end.x)) - left),
    height: Math.max(0, Math.min(height, Math.max(start.y, end.y)) - top),
  }
}
