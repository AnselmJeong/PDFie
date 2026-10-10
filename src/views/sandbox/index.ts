// Adapter of OpenIntelligentUI's MCP assembly and continuous sizing bridge.
// Runs inside an opaque-origin iframe in an RPC-disabled native webview.
import { type SandboxStep, validateWidgetState, type WidgetState } from "../../shared/study/intelligent-ui"
import { FORM_STYLES_CSS, SVG_CLASSES_CSS, THEME_CSS } from "../../vendor/openintelligentui/design-system"

let initialized = false
let channel = ""
let evidenceIds: string[] = []
let state: WidgetState = {}
const send = (type: string, data: Record<string, unknown> = {}) =>
  window.parent.postMessage({ type, channel, ...data }, "*")
const saveState = (value: unknown) => {
  try {
    state = validateWidgetState(value)
    send("pdfie-ui-state", { state })
  } catch {
    send("pdfie-ui-error", { message: "조작 상태를 저장할 수 없습니다." })
  }
}
const fail = () => {
  const content = document.getElementById("content")
  if (content) content.textContent = "맞춤 화면을 실행하지 못했습니다. 위의 설명과 원문 근거를 확인하세요."
  send("pdfie-ui-error", { message: "맞춤 화면을 실행하지 못했습니다." })
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") send("pdfie-ui-escape")
})
window.addEventListener("error", fail)
window.addEventListener("unhandledrejection", fail)
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || initialized || !event.data || typeof event.data !== "object") return
  const data = event.data as Record<string, unknown>
  if (data.type !== "pdfie-ui-init" || typeof data.channel !== "string" || !data.step) return
  initialized = true
  channel = data.channel
  const step = data.step as SandboxStep
  try {
    state = validateWidgetState(data.state ?? {})
    const restoredState = { ...state }
    evidenceIds = step.evidenceIds
    // Only these two operations reach the parent, which validates source,
    // channel, source IDs, size, and state before calling its own APIs.
    Object.defineProperty(window, "PDFie", {
      value: Object.freeze({
        get savedState() {
          return { ...state }
        },
        saveState,
        revealEvidence: (id: string) => {
          if (evidenceIds.includes(id)) send("pdfie-ui-evidence", { id })
        },
      }),
      writable: false,
      configurable: false,
    })
    const style = document.createElement("style")
    style.textContent = `${THEME_CSS}\n${SVG_CLASSES_CSS}\n${FORM_STYLES_CSS}\n${step.css}\nbody { padding: 12px; } #content { overflow-wrap: anywhere; } svg { max-width: 100%; } :focus-visible { outline: 2px solid var(--color-text-info); outline-offset: 3px; }`
    document.head.append(style)
    const content = document.getElementById("content")
    if (!content) throw new Error("Missing sandbox root")
    content.innerHTML = step.html
    const run = (code: string) => {
      const script = document.createElement("script")
      script.textContent = code
      document.body.append(script)
    }
    run(step.jsFunctions)
    for (const expression of step.jsExpressions) run(expression)
    const controls = content.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[id], select[id], textarea[id]",
    )
    for (const control of controls) {
      const saved = restoredState[control.id]
      if (saved === undefined) continue
      if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type))
        control.checked = saved === true
      else control.value = String(saved)
      control.dispatchEvent(new Event("input", { bubbles: true }))
      control.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const persistControls = () => {
      const next = { ...state }
      for (const control of controls) {
        if (control instanceof HTMLInputElement && ["password", "file"].includes(control.type)) continue
        next[control.id] =
          control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)
            ? control.checked
            : control.value
      }
      saveState(next)
    }
    content.addEventListener("input", persistControls)
    content.addEventListener("change", persistControls)
    // Disable all navigation, including fragment links that would replace the
    // sandbox's loaded shell. Source navigation uses the explicit bridge.
    content.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) event.preventDefault()
    })
    const reportHeight = () => send("pdfie-ui-resize", { height: Math.ceil(content.scrollHeight + 24) })
    new ResizeObserver(reportHeight).observe(content)
    window.addEventListener("resize", reportHeight)
    reportHeight()
    send("pdfie-ui-ready")
  } catch {
    fail()
  }
})
