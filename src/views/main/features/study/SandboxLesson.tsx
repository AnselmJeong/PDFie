import type { WebviewTagElement } from "electrobun/view"
import { createElement, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  type SandboxStep,
  validateWidgetState,
  type WidgetState,
} from "../../../../shared/study/intelligent-ui"

export function SandboxLesson({
  step,
  savedState,
  onSave,
  onEvidence,
  onError,
  onEscape,
}: {
  step: SandboxStep
  savedState: WidgetState
  onSave: (state: WidgetState) => void
  onEvidence: (id: string) => void
  onError: (message: string) => void
  onEscape: () => void
}) {
  const frame = useRef<WebviewTagElement>(null)
  const initial = useRef({ step, state: savedState, channel: crypto.randomUUID() })
  const callbacks = useRef({ onSave, onEvidence, onError, onEscape })
  callbacks.current = { onSave, onEvidence, onError, onEscape }
  const [height, setHeight] = useState(step.initialHeight)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const masks = useRef<Array<HTMLDivElement | null>>([])
  useEffect(() => {
    const nativeView = frame.current
    if (!nativeView || !ready || failed) return
    // Native webviews sit above the DOM. Mirror ancestor overflow clipping
    // into native masks so scrolling never draws over the modal or toolbar.
    const ancestors: HTMLElement[] = []
    for (let parent = nativeView.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) ancestors.push(parent)
    }
    const clip = () => {
      const rect = nativeView.getBoundingClientRect()
      let top = 0,
        left = 0,
        right = window.innerWidth,
        bottom = window.innerHeight
      for (const ancestor of ancestors) {
        const bounds = ancestor.getBoundingClientRect()
        top = Math.max(top, bounds.top + ancestor.clientTop)
        left = Math.max(left, bounds.left + ancestor.clientLeft)
        right = Math.min(right, bounds.left + ancestor.clientLeft + ancestor.clientWidth)
        bottom = Math.min(bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight)
      }
      const rectangles = [
        [rect.left, rect.top, rect.width, Math.max(0, top - rect.top)],
        [rect.left, bottom, rect.width, Math.max(0, rect.bottom - bottom)],
        [rect.left, rect.top, Math.max(0, left - rect.left), rect.height],
        [right, rect.top, Math.max(0, rect.right - right), rect.height],
      ]
      rectangles.forEach(([x = 0, y = 0, width = 0, height = 0], i) => {
        const mask = masks.current[i]
        if (mask)
          Object.assign(mask.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
          })
      })
      const hidden = rect.bottom <= top || rect.top >= bottom || rect.right <= left || rect.left >= right
      if (nativeView.hidden !== hidden) nativeView.toggleHidden(hidden)
      nativeView.syncDimensions(true)
    }
    const observer = new ResizeObserver(clip)
    observer.observe(nativeView)
    for (const ancestor of ancestors) observer.observe(ancestor)
    clip()
    document.addEventListener("scroll", clip, true)
    window.addEventListener("resize", clip)
    return () => {
      observer.disconnect()
      document.removeEventListener("scroll", clip, true)
      window.removeEventListener("resize", clip)
    }
  }, [ready, failed])
  useEffect(() => {
    const receive = (event: CustomEvent<unknown>) => {
      if (!event.detail || typeof event.detail !== "object") return
      const data = event.detail as Record<string, unknown>
      if (data.channel !== initial.current.channel) return
      switch (data.type) {
        case "pdfie-ui-ready":
          setReady(true)
          break
        case "pdfie-ui-resize":
          if (typeof data.height === "number" && Number.isFinite(data.height))
            setHeight(Math.min(1000, Math.max(180, data.height)))
          break
        case "pdfie-ui-state":
          try {
            callbacks.current.onSave(validateWidgetState(data.state))
          } catch {
            callbacks.current.onError("맞춤 화면의 저장 상태가 올바르지 않습니다.")
          }
          break
        case "pdfie-ui-evidence":
          if (typeof data.id === "string" && initial.current.step.evidenceIds.includes(data.id))
            callbacks.current.onEvidence(data.id)
          break
        case "pdfie-ui-escape":
          callbacks.current.onEscape()
          break
        case "pdfie-ui-error":
          setFailed(true)
          break
      }
    }
    const nativeView = frame.current
    const initialize = () =>
      nativeView?.executeJavascript(
        `window.PDFieInitialize(${JSON.stringify({ type: "pdfie-ui-init", ...initial.current })})`,
      )
    nativeView?.on("host-message", receive)
    nativeView?.on("dom-ready", initialize)
    const timeout = setTimeout(() => {
      if (!frame.current?.dataset.ready) setFailed(true)
    }, 12000)
    return () => {
      clearTimeout(timeout)
      nativeView?.off("host-message", receive)
      nativeView?.off("dom-ready", initialize)
    }
  }, [])
  return (
    <div className="lesson-sandbox">
      <p>{step.text}</p>
      {step.dataKind === "illustrative" && (
        <p className="illustration-label">교육용 가상 데이터 · 논문 측정값이 아닙니다.</p>
      )}
      {!ready && !failed && <p role="status">맞춤 학습 화면을 여는 중입니다…</p>}
      {failed && <p role="alert">맞춤 화면을 표시하지 못했습니다. 설명과 원문 근거를 확인해 주세요.</p>}
      {!failed &&
        createElement("electrobun-webview", {
          ref: frame,
          sandbox: "",
          renderer: "native",
          partition: `pdfie-lesson-${initial.current.channel}`,
          src: "views://sandbox/host.html",
          title: step.title,
          tabIndex: 0,
          masks: `.sandbox-mask-${initial.current.channel}`,
          "navigation-rules": JSON.stringify([
            "^*",
            "views://sandbox/host.html",
            "views://sandbox/index.html",
          ]),
          "data-ready": ready ? "true" : undefined,
          style: { height, display: failed ? "none" : "block", width: "100%" },
        })}
      {createPortal(
        [0, 1, 2, 3].map((i) => (
          <div
            key={i}
            ref={(element) => {
              masks.current[i] = element
            }}
            className={`sandbox-mask-${initial.current.channel}`}
            aria-hidden="true"
            style={{ position: "fixed", pointerEvents: "none", width: 0, height: 0 }}
          />
        )),
        document.body,
      )}
    </div>
  )
}
