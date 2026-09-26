export function selectionMenuPosition(
  anchor: { left: number; top: number; right: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 8
  const above = anchor.top - menu.height - margin
  return {
    left: Math.max(
      margin,
      Math.min((anchor.left + anchor.right - menu.width) / 2, viewport.width - menu.width - margin),
    ),
    top: Math.max(
      margin,
      Math.min(above >= margin ? above : anchor.bottom + margin, viewport.height - menu.height - margin),
    ),
  }
}
