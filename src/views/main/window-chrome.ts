/**
 * Windows use a transparent, inset title bar (titleBarStyle "hiddenInset"):
 * PDFie's own title bars are the window's. Electrobun's preload starts a
 * window move on mousedown inside DRAG unless the target is inside NO_DRAG,
 * so every interactive cluster in a drag region must carry NO_DRAG.
 */
export const DRAG = "electrobun-webkit-app-region-drag"
export const NO_DRAG = "electrobun-webkit-app-region-no-drag"

/** Double-clicking empty title bar space zooms the window, as in other Mac apps. */
export function installTitleBarZoom(zoom: () => Promise<unknown>) {
  document.addEventListener("dblclick", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(`.${NO_DRAG}`) || !target.closest(`.${DRAG}`)) return
    void zoom().catch(() => undefined)
  })
}

/** macOS hides the window controls in full screen; title bars drop their leading inset. */
export function setFullScreenChrome(fullScreen: boolean) {
  if (fullScreen) document.documentElement.dataset.fullscreen = "true"
  else delete document.documentElement.dataset.fullscreen
}
