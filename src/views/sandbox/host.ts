// Trusted relay inside an RPC-disabled native webview. Generated code runs in
// its opaque-origin child frame and cannot reach this shell or the app window.
import type { SandboxStep, WidgetState } from "../../shared/study/intelligent-ui"

declare global {
  interface Window {
    __electrobunEventBridge?: { postMessage: (message: string) => void }
  }
}

type Init = { type: "pdfie-ui-init"; channel: string; step: SandboxStep; state: WidgetState }
let config: Init | null = null
const frame = document.querySelector<HTMLIFrameElement>("#lesson")
const initialize = (value: Init) => {
  config = value
  frame?.contentWindow?.postMessage(value, "*")
}
Object.defineProperty(window, "PDFieInitialize", { value: initialize, writable: false })
frame?.addEventListener("load", () => {
  if (config) frame.contentWindow?.postMessage(config, "*")
})
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== frame?.contentWindow || !config || !event.data || typeof event.data !== "object")
    return
  const data = event.data as Record<string, unknown>
  if (
    data.channel !== config.channel ||
    ![
      "pdfie-ui-ready",
      "pdfie-ui-resize",
      "pdfie-ui-state",
      "pdfie-ui-evidence",
      "pdfie-ui-error",
      "pdfie-ui-escape",
    ].includes(String(data.type))
  )
    return
  const bridge = window.__electrobunEventBridge
  if (!bridge || JSON.stringify(data).length > 16000) return
  bridge.postMessage(
    JSON.stringify({
      id: "webviewEvent",
      type: "message",
      payload: {
        id: window.__electrobunWebviewId,
        eventName: "host-message",
        detail: JSON.stringify(data),
      },
    }),
  )
})
