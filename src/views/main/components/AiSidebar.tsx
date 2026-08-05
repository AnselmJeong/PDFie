import { Copy, PanelRightClose, RefreshCw, Send, Settings2, Sparkles, Square } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { PdfSelection } from "../../../shared/pdf/domain"
import { rpc } from "../rpc"

interface AiStatus {
  endpoint: "https://ollama.com/v1"
  hasApiKey: boolean
  selectedModel: string
  sidebarWidth: number
  sidebarFontSize: number
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  quotedText?: string
  streaming?: boolean
}

const quickActions = [
  { label: "요약", prompt: "선택한 구절의 핵심 주장과 논리 흐름을 간결하게 요약해 주세요." },
  { label: "비판", prompt: "선택한 구절의 전제, 강점, 한계와 반론 가능성을 비판적으로 분석해 주세요." },
  { label: "핵심 개념", prompt: "선택한 구절의 핵심 개념과 전문 용어를 문맥에 맞게 설명해 주세요." },
]

export function AiSidebar({
  selection,
  activePage,
  documentTitle,
  onClose,
}: {
  selection: PdfSelection | null
  activePage: number
  documentTitle: string
  onClose: () => void
}) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelError, setModelError] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState("")
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const widthRef = useRef(390)

  const loadModels = useCallback(async (preferredModel?: string) => {
    setLoadingModels(true)
    setModelError(null)
    try {
      const { models: nextModels } = await rpc.request["ai.models"]({})
      setModels(nextModels)
      const nextModel =
        preferredModel && nextModels.includes(preferredModel) ? preferredModel : (nextModels[0] ?? "")
      if (nextModel && nextModel !== preferredModel) {
        const nextStatus = await rpc.request["ai.settings.update"]({ selectedModel: nextModel })
        setStatus(nextStatus)
      }
    } catch (cause) {
      setModels([])
      setModelError(cause instanceof Error ? cause.message : "Cloud model 목록을 불러오지 못했습니다.")
    } finally {
      setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void rpc.request["ai.settings.get"]({}).then((saved) => {
      if (cancelled) return
      setStatus(saved)
      widthRef.current = saved.sidebarWidth
      if (saved.hasApiKey) void loadModels(saved.selectedModel)
      else setSettingsOpen(true)
    })
    return () => {
      cancelled = true
    }
  }, [loadModels])

  useEffect(() => {
    const onToken = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; token: string }>).detail
      setMessages((current) =>
        current.map((message) =>
          message.id === detail.requestId ? { ...message, text: message.text + detail.token } : message,
        ),
      )
    }
    window.addEventListener("pdfie:ai-token", onToken)
    return () => window.removeEventListener("pdfie:ai-token", onToken)
  }, [])

  useEffect(() => {
    if (messages.length < 0) return
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const stopStreaming = useCallback(async () => {
    if (!activeRequestId) return
    await rpc.request["ai.stop"]({ requestId: activeRequestId })
  }, [activeRequestId])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !activeRequestId) return
      event.preventDefault()
      void stopStreaming()
    }
    window.addEventListener("keydown", keydown, true)
    return () => window.removeEventListener("keydown", keydown, true)
  }, [activeRequestId, stopStreaming])

  const send = useCallback(
    async (rawQuestion: string) => {
      const value = rawQuestion.trim()
      const model = status?.selectedModel ?? ""
      if (!value || !model || activeRequestId) return
      const requestId = crypto.randomUUID()
      const quotedText = selection?.text
      setChatError(null)
      setQuestion("")
      setActiveRequestId(requestId)
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text: value, quotedText },
        { id: requestId, role: "assistant", text: "", streaming: true },
      ])
      try {
        await rpc.request["ai.chatStream"]({
          requestId,
          model,
          question: value,
          activePage,
          selection: selection
            ? { text: selection.text, pages: selection.pages.map((page) => page.pageNumber) }
            : null,
        })
      } catch (cause) {
        setChatError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.")
      } finally {
        setActiveRequestId(null)
        setMessages((current) =>
          current.map((message) => (message.id === requestId ? { ...message, streaming: false } : message)),
        )
      }
    },
    [activePage, activeRequestId, selection, status?.selectedModel],
  )

  const saveApiKey = useCallback(async () => {
    const next = await rpc.request["ai.settings.update"]({ apiKey: apiKeyDraft })
    setStatus(next)
    setApiKeyDraft("")
    if (next.hasApiKey) await loadModels(next.selectedModel)
  }, [apiKeyDraft, loadModels])

  useEffect(() => {
    const submit = (event: Event) => {
      void send((event as CustomEvent<string>).detail)
    }
    window.addEventListener("pdfie:ai-submit", submit)
    return () => window.removeEventListener("pdfie:ai-submit", submit)
  }, [send])

  useEffect(() => {
    const focusComposer = () => composerRef.current?.focus()
    window.addEventListener("pdfie:ai-focus", focusComposer)
    return () => window.removeEventListener("pdfie:ai-focus", focusComposer)
  }, [])

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = widthRef.current
    const move = (moveEvent: PointerEvent) => {
      const width = Math.min(560, Math.max(320, startWidth + startX - moveEvent.clientX))
      widthRef.current = width
      setStatus((current) => (current ? { ...current, sidebarWidth: width } : current))
    }
    const end = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      void rpc.request["ai.settings.update"]({ sidebarWidth: widthRef.current })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end, { once: true })
  }

  const selectedPages = selection?.pages.map((page) => page.pageNumber).join("–")
  const disabled = !status?.selectedModel || Boolean(activeRequestId)

  return (
    <aside
      className="ai-sidebar"
      aria-label="AI sidebar"
      style={
        {
          width: status?.sidebarWidth ?? 390,
          "--ai-sidebar-font-size": `${status?.sidebarFontSize ?? 14}px`,
        } as React.CSSProperties
      }
    >
      <div className="sidebar-resize-handle" onPointerDown={beginResize} aria-hidden="true" />
      <header className="ai-header">
        <div className="ai-heading-row">
          <div className="ai-title">
            <span>
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Conversation</strong>
              <select
                value={status?.selectedModel ?? ""}
                disabled={!models.length || loadingModels}
                onChange={(event) => {
                  const selectedModel = event.target.value
                  setStatus((current) => (current ? { ...current, selectedModel } : current))
                  void rpc.request["ai.settings.update"]({ selectedModel })
                }}
                title={status?.selectedModel || "Ollama Cloud model"}
              >
                <option value="">
                  {loadingModels ? "모델 불러오는 중…" : models.length ? "모델 선택" : "Cloud model 없음"}
                </option>
                {models.map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="ai-header-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="AI 설정"
            >
              <Settings2 size={16} />
            </button>
            <button className="icon-button" type="button" onClick={onClose} aria-label="AI sidebar 닫기">
              <PanelRightClose size={17} />
            </button>
          </div>
        </div>
        <div className="ai-context-line" title={documentTitle}>
          <span>PDF</span>
          <strong>{documentTitle}</strong>
          <em>p. {activePage}</em>
        </div>
      </header>

      {settingsOpen && (
        <section className="ai-settings" aria-label="Ollama Cloud 설정">
          <div className="ai-settings-heading">
            <div>
              <strong>Ollama Cloud</strong>
              <span>https://ollama.com/v1</span>
            </div>
            <button
              type="button"
              onClick={() => void loadModels(status?.selectedModel)}
              disabled={!status?.hasApiKey || loadingModels}
            >
              <RefreshCw size={13} className={loadingModels ? "is-spinning" : ""} /> 모델 새로고침
            </button>
          </div>
          <div className="api-key-row">
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={status?.hasApiKey ? "저장된 API key 유지" : "Ollama Cloud API key"}
              autoComplete="off"
            />
            <button type="button" onClick={() => void saveApiKey()} disabled={!apiKeyDraft.trim()}>
              저장
            </button>
          </div>
          <label className="font-size-setting">
            <span>
              Sidebar text <b>{status?.sidebarFontSize ?? 14}px</b>
            </span>
            <input
              type="range"
              min="12"
              max="19"
              value={status?.sidebarFontSize ?? 14}
              onChange={(event) => {
                const sidebarFontSize = Number(event.target.value)
                setStatus((current) => (current ? { ...current, sidebarFontSize } : current))
              }}
              onPointerUp={() =>
                void rpc.request["ai.settings.update"]({ sidebarFontSize: status?.sidebarFontSize })
              }
            />
          </label>
          {modelError && <p className="chat-error">{modelError}</p>}
        </section>
      )}

      <div className="chat-messages" aria-live="polite">
        {selection && (
          <div className="selected-context">
            <div>
              <i />
              <span>Selected context · p. {selectedPages}</span>
            </div>
            <blockquote>{selection.text}</blockquote>
          </div>
        )}
        {!messages.length && (
          <div className="ai-empty">
            <span>
              <Sparkles size={21} />
            </span>
            <strong>
              Your reading
              <br />
              companion is ready.
            </strong>
            <p>구절을 선택해 질문하거나, 현재 페이지를 읽으며 대화를 시작하세요.</p>
          </div>
        )}
        {messages.map((message) => (
          <article className={`chat-message is-${message.role}`} key={message.id}>
            {message.role === "assistant" && (
              <div className="assistant-label">
                <Sparkles size={11} /> Assistant
              </div>
            )}
            {message.quotedText && <blockquote>{message.quotedText}</blockquote>}
            <div className="message-text">
              {message.text ||
                (message.streaming ? (
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  "응답이 비어 있습니다."
                ))}
            </div>
            {message.streaming && message.text && <i className="streaming-cursor" />}
            {message.role === "assistant" && !message.streaming && message.text && (
              <button
                className="copy-message"
                type="button"
                onClick={() => navigator.clipboard.writeText(message.text)}
              >
                <Copy size={11} /> Copy
              </button>
            )}
          </article>
        ))}
        {chatError && <p className="chat-error">{chatError}</p>}
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-actions">
        {quickActions.map((action) => (
          <button
            type="button"
            key={action.label}
            disabled={disabled || !selection}
            onClick={() => void send(action.prompt)}
          >
            <Sparkles size={12} /> {action.label}
          </button>
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void send(question)
        }}
      >
        <textarea
          ref={composerRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send(question)
            }
          }}
          rows={1}
          placeholder={status?.selectedModel ? "문서에 관해 질문하세요…" : "Ollama Cloud model을 설정하세요…"}
          disabled={!status?.selectedModel}
        />
        {activeRequestId ? (
          <button type="button" onClick={() => void stopStreaming()} aria-label="응답 중지">
            <Square size={13} />
          </button>
        ) : (
          <button type="submit" disabled={disabled || !question.trim()} aria-label="질문 보내기">
            <Send size={15} />
          </button>
        )}
      </form>
    </aside>
  )
}
