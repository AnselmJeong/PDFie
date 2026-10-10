import { BookOpen, Copy, Download, PanelRightClose, Send, Settings2, Sparkles, Square } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { PdfSelection, PdfViewerSource, SelectionAiRequest } from "../../../shared/pdf/domain"
import type {
  CaptureAsset,
  EvidenceRef,
  StudyEvent,
  StudyGoal,
  StudyOrigin,
  StudyScope,
  StudySnapshot,
  StudyTask,
} from "../../../shared/study/contracts"
import { conversationMessages } from "../../../shared/study/conversation"
import { reusableGoalAnswer } from "../../../shared/study/goal-context"
import { sectionSummaryQuestion } from "../../../shared/study/section-summary"
import { CitationChip } from "../features/study/CitationChip"
import { GoalList } from "../features/study/GoalList"
import { LessonPlayer } from "../features/study/LessonPlayer"
import { SectionList } from "../features/study/SectionList"
import { useAiConnection } from "../features/study/useAiConnection"
import { rpc } from "../rpc"

const labels = {
  "document-claim": "논문에서 확인",
  inference: "해석·추론",
  background: "배경 설명",
  illustration: "교육용 예시",
  unknown: "근거 부족",
}
const phaseLabels = {
  retrieving: "근거 찾는 중",
  generating: "학습 자료 작성 중",
  completed: "완료",
  stopped: "중지됨",
  failed: "생성 실패",
}
type Tab = "chat" | "goals" | "sections" | "learning"

export function AiSidebar({
  selection,
  request,
  visible,
  activePage,
  source,
  capture,
  onDismissCapture,
  onStartCapture,
  onReveal,
  onClose,
}: {
  selection: PdfSelection | null
  request: SelectionAiRequest | null
  visible: boolean
  activePage: number
  source: PdfViewerSource
  capture: CaptureAsset | null
  onDismissCapture: () => void
  onStartCapture: () => void
  onReveal: (evidence: EvidenceRef) => void
  onClose: () => void
}) {
  const {
    status,
    setStatus,
    models,
    providerState,
    loadingModels,
    error: connectionError,
    setError: setConnectionError,
    refreshProvider,
  } = useAiConnection()
  const [snapshot, setSnapshot] = useState<StudySnapshot | null>(null)
  const [tab, setTab] = useState<Tab | "result">("goals")
  const [actionView, setActionView] = useState<{
    requestId: string
    returnTab: Tab
    title: string
  } | null>(null)
  const [scope, setScope] = useState<StudyScope>({ type: "document" })
  const [question, setQuestion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<StudyEvent | null>(null)
  const [stopping, setStopping] = useState<string | null>(null)
  const [quoted, setQuoted] = useState<PdfSelection | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const mounted = useRef(true),
    active = useRef<string | null>(null),
    activeOrigin = useRef<StudyOrigin | null>(null),
    handled = useRef<string | null>(null)
  const composer = useRef<HTMLTextAreaElement>(null),
    messagesEnd = useRef<HTMLDivElement>(null)
  const effectiveSelection = dismissed ? null : (quoted ?? selection)
  const conversation = conversationMessages(snapshot?.messages ?? [])
  const goalAnswer = (goal: StudyGoal) => (snapshot ? reusableGoalAnswer(snapshot, goal) : undefined)
  const displayedMessages =
    tab === "result"
      ? (snapshot?.messages.filter(
          (message) => message.id === actionView?.requestId && message.role === "assistant",
        ) ?? [])
      : conversation
  const report = useCallback(
    (cause: unknown) => setError(cause instanceof Error ? cause.message : "작업을 완료하지 못했습니다."),
    [],
  )
  const refresh = useCallback(async () => {
    try {
      const next = await rpc.request["study.snapshot"]({ documentId: source.documentId })
      if (mounted.current) setSnapshot(next)
    } catch (cause) {
      if (mounted.current) report(cause)
    }
  }, [source.documentId, report])
  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => {
      mounted.current = false
      if (active.current) void rpc.request["ai.stop"]({ requestId: active.current }).catch(() => undefined)
    }
  }, [refresh])
  useEffect(() => {
    if (providerState?.connected)
      setError((message) => (message?.includes("ChatGPT에 로그인") ? null : message))
  }, [providerState?.connected])
  const applyStudyEvent = useCallback(
    (detail: StudyEvent) => {
      if (
        !mounted.current ||
        detail.documentHash !== source.documentHash ||
        detail.requestId !== active.current
      )
        return
      setBusy(detail)
      if (["completed", "stopped", "failed"].includes(detail.phase)) {
        const submittedQuestion = activeOrigin.current === "composer"
        active.current = null
        activeOrigin.current = null
        setBusy(null)
        setStopping(null)
        if (detail.error) setError(detail.error)
        void refresh()
        if (detail.phase !== "completed") void refreshProvider()
        if (detail.phase === "completed" && submittedQuestion) {
          setQuestion("")
          if (capture) onDismissCapture()
        }
      }
    },
    [source.documentHash, refresh, refreshProvider, capture, onDismissCapture],
  )
  useEffect(() => {
    const index = () => void refresh()
    const event = (event: Event) => applyStudyEvent((event as CustomEvent<StudyEvent>).detail)
    window.addEventListener("pdfie:records-changed", index)
    window.addEventListener("pdfie:index-updated", index)
    window.addEventListener("pdfie:study-event", event)
    return () => {
      window.removeEventListener("pdfie:records-changed", index)
      window.removeEventListener("pdfie:index-updated", index)
      window.removeEventListener("pdfie:study-event", event)
    }
  }, [refresh, applyStudyEvent])
  const busyRequestId = busy?.requestId
  useEffect(() => {
    if (!busyRequestId) return
    const requestId = busyRequestId
    let disposed = false
    let checking = false
    const reconcile = async () => {
      if (checking || active.current !== requestId) return
      checking = true
      try {
        const job = await rpc.request["study.job.status"]({ documentId: source.documentId, requestId })
        // Recover a missed terminal notification using durable job state.
        if (!disposed && !job.active && job.terminal) applyStudyEvent(job.terminal)
      } catch {
        // A transient status failure does not cancel or unlock a running job.
      } finally {
        checking = false
      }
    }
    const timer = setInterval(() => void reconcile(), 1500)
    const focus = () => void reconcile()
    window.addEventListener("focus", focus)
    return () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener("focus", focus)
    }
  }, [busyRequestId, source.documentId, applyStudyEvent])
  const stopGeneration = useCallback(async () => {
    const requestId = active.current
    if (!requestId) return
    setStopping(requestId)
    try {
      const { stopped } = await rpc.request["ai.stop"]({ requestId })
      // The stop acknowledgement also restores controls if the event was lost.
      if (stopped) applyStudyEvent({ documentHash: source.documentHash, requestId, phase: "stopped" })
      else {
        const job = await rpc.request["study.job.status"]({ documentId: source.documentId, requestId })
        if (!job.active && job.terminal) applyStudyEvent(job.terminal)
        else if (mounted.current && active.current === requestId) setStopping(null)
      }
    } catch (cause) {
      if (mounted.current && active.current === requestId) {
        setStopping(null)
        report(cause)
      }
    }
  }, [applyStudyEvent, source.documentHash, source.documentId, report])
  useEffect(() => {
    if (selection) {
      setDismissed(false)
      setQuoted(null)
    }
  }, [selection])
  const generate = useCallback(
    async (
      task: StudyTask,
      value: string,
      selectedScope: StudyScope = scope,
      goalId?: string,
      selected: PdfSelection | null = effectiveSelection,
      captureId: string | null = capture?.id ?? null,
      origin: StudyOrigin = "action",
    ) => {
      if (active.current || !value.trim()) return
      const requestId = crypto.randomUUID()
      active.current = requestId
      activeOrigin.current = origin
      setStopping(null)
      setBusy({ documentHash: source.documentHash, requestId, phase: "retrieving" })
      setError(null)
      if (task === "goals") setTab("goals")
      else if (task === "lesson") setTab("learning")
      else if (task === "summary" && selectedScope.type === "section" && origin === "action")
        setTab("sections")
      else if (origin === "action") {
        setActionView({
          requestId,
          returnTab: tab === "result" ? (actionView?.returnTab ?? "chat") : tab,
          title: task === "summary" ? "요약" : "원문 설명",
        })
        setTab("result")
      } else setTab("chat")
      if (origin === "composer") setQuestion(value)
      try {
        await rpc.request["study.generate"]({
          documentId: source.documentId,
          requestId,
          task,
          origin,
          question: value,
          scope: selectedScope,
          selection: selected,
          ...(captureId ? { captureId } : {}),
          ...(goalId ? { goalId } : {}),
        })
        await refresh()
      } catch (cause) {
        if (!mounted.current || active.current !== requestId) return
        active.current = null
        activeOrigin.current = null
        setBusy(null)
        setStopping(null)
        report(cause)
      }
    },
    [scope, effectiveSelection, source, capture, refresh, report, tab, actionView?.returnTab],
  )
  const sendQuestion = () =>
    void generate("chat", question, scope, undefined, effectiveSelection, capture?.id ?? null, "composer")
  useEffect(() => {
    if (!request || handled.current === request.id) return
    handled.current = request.id
    setQuoted(request.selection)
    setScope({ type: "selection" })
    setDismissed(false)
    setTab("chat")
    if (request.prompt && status?.selectedModel && !active.current)
      void generate("chat", request.prompt, { type: "selection" }, undefined, request.selection)
    composer.current?.focus()
  }, [request, status, generate])
  useEffect(() => {
    if (capture) setTab("chat")
  }, [capture])
  useEffect(() => {
    if (visible && tab === "chat") composer.current?.focus()
  }, [visible, tab])
  useEffect(() => {
    if (tab === "chat" && conversation.length) messagesEnd.current?.scrollIntoView({ block: "end" })
  }, [conversation.length, tab])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault()
        void stopGeneration()
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [stopGeneration])
  const providerReady =
    !!status?.selectedModel &&
    models.some((m) => m.id === status.selectedModel) &&
    !busy &&
    (status.provider !== "codex" || !!providerState?.generationAvailable)
  const ready = providerReady && (!!snapshot?.index.blockCount || !!capture)
  const unavailableReason = busy
    ? "진행 중인 자료 생성을 완료하거나 중지하세요."
    : loadingModels
      ? "사용할 수 있는 모델을 확인하고 있습니다."
      : status?.provider === "codex" && !providerState?.connected
        ? "AI 설정에서 ChatGPT에 로그인하세요."
        : status?.provider === "codex" && !providerState?.generationAvailable
          ? (providerState?.generationNotice ?? "Codex 연결과 사용 한도를 확인하고 있습니다.")
          : !status?.selectedModel || !models.some((model) => model.id === status.selectedModel)
            ? "AI 설정에서 사용할 모델을 선택하세요."
            : "문서에서 읽을 수 있는 원문을 준비하고 있습니다."
  const openSettings = () =>
    void rpc.request["app.settings.open"]({ documentId: source.documentId }).catch(report)
  const saveGoal = async (goal: StudyGoal) => {
    try {
      await rpc.request["study.goal.save"]({ documentId: source.documentId, goal })
      await refresh()
      return true
    } catch (cause) {
      report(cause)
      return false
    }
  }
  const exportStudy = async () => {
    try {
      const result = await rpc.request["study.export"]({ documentId: source.documentId })
      if (result.saved) setError("학습 기록을 Markdown으로 저장했습니다.")
    } catch (cause) {
      report(cause)
    }
  }
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX,
      width = status?.sidebarWidth ?? 440
    let nextWidth = width
    const move = (e: PointerEvent) => {
      nextWidth = Math.min(560, Math.max(340, width + startX - e.clientX))
      setStatus((s) => (s ? { ...s, sidebarWidth: nextWidth } : s))
    }
    const end = () => {
      window.removeEventListener("pointermove", move)
      void rpc.request["ai.settings.update"]({ sidebarWidth: nextWidth }).catch(report)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end, { once: true })
  }
  const goalsEvidence =
    snapshot?.messages
      .filter((m) => m.task === "goals" && m.state === "completed")
      .flatMap((m) => m.evidence) ?? []
  const goalScope = (goal: StudyGoal): StudyScope => {
    if (goal.sectionId && snapshot?.sections.some((section) => section.id === goal.sectionId))
      return { type: "section", sectionId: goal.sectionId }
    // The service resolves all linked passages, including citations from an old
    // index. A first-match section title would discard the goal's other sources.
    return { type: "document" }
  }
  const currentScope = (value: StudyScope): StudyScope =>
    value.type === "section" && !snapshot?.sections.some((section) => section.id === value.sectionId)
      ? { type: "document" }
      : value
  return (
    <aside
      className="ai-sidebar study-sidebar"
      aria-label="PDF 학습 공간"
      style={
        {
          width: status?.sidebarWidth ?? 440,
          "--ai-sidebar-font-size": `${status?.sidebarFontSize ?? 14}px`,
        } as React.CSSProperties
      }
    >
      <div className="sidebar-resize-handle" onPointerDown={resize} aria-hidden="true" />
      <header className="ai-header">
        <div className="ai-heading-row">
          <div className="ai-title">
            <span>
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Study workspace</strong>
              <button
                type="button"
                className="study-model-status"
                onClick={openSettings}
                aria-label="모델 설정 열기"
              >
                {loadingModels
                  ? "모델 불러오는 중…"
                  : (models.find((model) => model.id === status?.selectedModel)?.label ??
                    status?.selectedModel ??
                    "AI 연결 설정")}
                {status?.provider === "codex" && providerState?.connected && <span> · 연결됨</span>}
              </button>
            </div>
          </div>
          <div className="ai-header-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => window.dispatchEvent(new CustomEvent("pdfie:library-requested"))}
              aria-label="학습 서재 열기"
            >
              <BookOpen size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => void exportStudy()}
              aria-label="학습 기록 내보내기"
            >
              <Download size={15} />
            </button>
            <button type="button" className="icon-button" onClick={openSettings} aria-label="AI 설정">
              <Settings2 size={16} />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="학습 공간 닫기">
              <PanelRightClose size={17} />
            </button>
          </div>
        </div>
        <div className="ai-context-line">
          <span>PDF</span>
          <strong title={source.fileName}>{source.fileName}</strong>
          <em>p. {activePage}</em>
        </div>
      </header>
      <div
        className="study-index-status"
        role="status"
        title={snapshot?.index.failedPageReasons
          ?.map((failure) => `${failure.page}페이지: ${failure.message}`)
          .join("\n")}
      >
        문서 준비 {snapshot?.index.indexedPages ?? 0}/{snapshot?.index.pageCount || "—"}페이지
        {snapshot?.index.ocrPages.length ? ` · OCR 필요 ${snapshot.index.ocrPages.join(", ")}` : ""}
        {snapshot?.index.failedPages.length ? ` · 분석 실패 ${snapshot.index.failedPages.join(", ")}` : ""}
      </div>
      {!providerReady && !busy && !loadingModels && (
        <button type="button" className="study-connection-hint" onClick={openSettings}>
          {status?.provider === "codex" && providerState?.connected
            ? (providerState.generationNotice ?? "학습에 사용할 모델을 선택하세요")
            : "AI 연결 설정"}
          <Settings2 size={13} />
        </button>
      )}
      <nav className="study-tabs" aria-label="학습 공간">
        {(
          [
            ["goals", "학습 목표"],
            ["sections", "섹션"],
            ["chat", "대화"],
            ["learning", "학습"],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-current={
              tab === id || (tab === "result" && actionView?.returnTab === id) ? "page" : undefined
            }
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="study-content">
        <GoalList
          hidden={tab !== "goals"}
          snapshot={snapshot}
          evidence={goalsEvidence}
          ready={ready}
          unavailableReason={unavailableReason}
          busy={!!busy}
          hasExplanation={(goalId) => {
            const goal = snapshot?.goals.find((item) => item.id === goalId)
            return !!goal && !!goalAnswer(goal)
          }}
          onRegenerate={() =>
            void generate(
              "goals",
              "이 문서의 연구 질문, 개념, 방법, 결과와 한계를 이해할 학습 목표를 제안해 주세요.",
              { type: "document" },
              undefined,
              null,
            )
          }
          onExplain={(goal) => {
            if (!goal.explored) void saveGoal({ ...goal, explored: true })
            const saved = goalAnswer(goal)
            if (saved) {
              setActionView({ requestId: saved.id, returnTab: "goals", title: "목표 설명" })
              setTab("result")
              return
            }
            void generate("chat", goal.question, goalScope(goal), goal.id, null)
          }}
          onStudy={(goal) => {
            void saveGoal({ ...goal, explored: true })
            void generate(
              "lesson",
              `${goal.question}\n이해 점검: ${goal.checkQuestion}`,
              goalScope(goal),
              goal.id,
              null,
            )
          }}
          onSave={saveGoal}
          onReorder={(goalIds) =>
            void rpc.request["study.goal.reorder"]({ documentId: source.documentId, goalIds })
              .then(refresh)
              .catch(report)
          }
          onDelete={(goalId) =>
            void rpc.request["study.goal.delete"]({ documentId: source.documentId, goalId })
              .then(refresh)
              .catch(report)
          }
          onReveal={onReveal}
        />
        {tab === "sections" && (
          <SectionList
            snapshot={snapshot}
            documentId={source.documentId}
            ready={ready}
            unavailableReason={unavailableReason}
            busy={busy}
            onSummary={(section) =>
              generate(
                "summary",
                sectionSummaryQuestion(section.title),
                { type: "section", sectionId: section.id },
                undefined,
                null,
                null,
              )
            }
            onStudy={(section) =>
              void generate(
                "lesson",
                `“${section.title}” 섹션을 원문과 함께 공부하고 이해를 점검하고 싶습니다.`,
                { type: "section", sectionId: section.id },
                undefined,
                null,
                null,
              )
            }
            onReveal={onReveal}
            onRefresh={refresh}
            onError={report}
            onMerge={() => setScope({ type: "document" })}
          />
        )}
        {(tab === "chat" || tab === "result") && (
          <div className="study-chat-messages">
            {tab === "result" && actionView && (
              <div className="study-action-heading">
                <div className="study-actions">
                  <button type="button" onClick={() => setTab(actionView.returnTab)}>
                    ←{" "}
                    {actionView.returnTab === "goals"
                      ? "학습 목표로"
                      : actionView.returnTab === "sections"
                        ? "섹션으로"
                        : actionView.returnTab === "learning"
                          ? "학습으로"
                          : "대화로"}{" "}
                    돌아가기
                  </button>
                </div>
                <h2>{actionView.title}</h2>
                {displayedMessages[0]?.goalId && (
                  <div className="study-actions">
                    {displayedMessages[0].evidence[0]?.revision !== snapshot?.index.revision && (
                      <p className="study-muted">
                        이전 원문 분할로 만든 설명입니다. 새 원문으로 다시 작성할 수 있습니다.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => {
                        const goal = snapshot?.goals.find((goal) => goal.id === displayedMessages[0]?.goalId)
                        if (goal) void generate("chat", goal.question, goalScope(goal), goal.id, null)
                      }}
                    >
                      설명 다시 만들기
                    </button>
                  </div>
                )}
                {!displayedMessages.length && <p role="status">원문을 확인하며 자료를 준비하고 있습니다…</p>}
              </div>
            )}
            {tab === "chat" && !conversation.length && (
              <div className="ai-empty">
                <Sparkles size={22} />
                <strong>원문과 함께 생각하기</strong>
                <p>구절을 선택하거나 문서 전체·섹션을 범위로 질문하세요.</p>
              </div>
            )}
            {displayedMessages.map((message) => (
              <article className={`chat-message is-${message.role}`} key={message.id}>
                {message.role === "assistant" && (
                  <div className="assistant-label">
                    <Sparkles size={11} /> {message.task === "summary" ? "섹션 요약" : "설명"} ·{" "}
                    {message.state === "completed" ? message.model : message.state}
                  </div>
                )}
                {message.blocks.length ? (
                  message.blocks.map((block) => (
                    <div className="answer-block" key={`${block.kind}-${block.text}`}>
                      <span className={`claim-kind is-${block.kind}`}>{labels[block.kind]}</span>
                      <p>{block.text}</p>
                      <div className="answer-citations">
                        {block.evidenceIds.map((id) => {
                          const ref = message.evidence.find((e) => e.id === id)
                          return ref ? <CitationChip key={id} evidence={ref} onReveal={onReveal} /> : null
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="message-text">
                    {message.text ||
                      message.error ||
                      (message.state === "running" ? "근거를 확인하며 작성하고 있습니다…" : "중단된 응답")}
                  </p>
                )}
                {message.role === "assistant" && (
                  <small className="answer-coverage">{message.coverage}</small>
                )}
                {message.draftText && message.state !== "completed" && (
                  <details className="response-draft">
                    <summary>미완성 응답 보관 · 근거 검증 전</summary>
                    <p className="study-muted">
                      생성 중 받은 초안입니다. 인용·학습 자료로 확정되지 않았습니다.
                    </p>
                    <pre>{message.draftText}</pre>
                  </details>
                )}
                {message.text && (
                  <button
                    type="button"
                    className="copy-message"
                    onClick={() => void navigator.clipboard.writeText(message.text).catch(report)}
                  >
                    <Copy size={11} /> 복사
                  </button>
                )}
                {message.role === "assistant" &&
                  message.state === "completed" &&
                  message.blocks.length > 0 && (
                    <button
                      type="button"
                      className="explore-answer"
                      disabled={!providerReady || !(snapshot?.index.blockCount || message.captureId)}
                      onClick={() =>
                        void generate(
                          "lesson",
                          `이 설명의 개념을 예측과 이해 점검으로 직접 탐구하고 싶습니다: ${message.text.slice(0, 3000)}`,
                          currentScope(message.scope),
                          message.goalId,
                          message.scope.type === "selection"
                            ? {
                                text: message.evidence.map((ref) => ref.quote).join("\n"),
                                normalizedText: message.evidence.map((ref) => ref.quote).join(" "),
                                pages: message.evidence.map((ref) => ({
                                  pageNumber: ref.pageIndex + 1,
                                  rects: ref.rects,
                                })),
                                source: "viewer",
                              }
                            : null,
                          message.captureId ?? null,
                        )
                      }
                    >
                      직접 탐구하기
                    </button>
                  )}
              </article>
            ))}
            <div ref={messagesEnd} />
          </div>
        )}
        {tab === "learning" && (
          <section className="learning-panel">
            <span className="study-eyebrow">예측하고, 확인하고, 설명하기</span>
            <h2>Interactive Learning</h2>
            {!snapshot?.lessons.length && (
              <p className="study-empty-note">
                학습 목표나 섹션의 “함께 공부하기”로 시작하세요. 논문에 맞는 비교, 개념 관계도,
                근거 지도와 맞춤 실험을 원문 근거와 함께 탐구하고 이해를 점검합니다.
              </p>
            )}
            {snapshot?.lessons
              .slice()
              .reverse()
              .map((lesson) => (
                <LessonPlayer
                  key={lesson.id}
                  lesson={lesson}
                  snapshot={snapshot}
                  documentId={source.documentId}
                  onChange={() => void refresh()}
                  onReveal={onReveal}
                  onError={setError}
                />
              ))}
          </section>
        )}
      </div>
      {(error || connectionError) && (
        <div className="study-error" role="alert">
          <p>{error || connectionError}</p>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setConnectionError(null)
            }}
            aria-label="알림 닫기"
          >
            ×
          </button>
        </div>
      )}
      {busy && (
        <div className="study-job" role="status">
          <span>
            <i className="is-spinning" />
            {stopping === busy.requestId ? "생성을 중지하는 중" : phaseLabels[busy.phase]}
          </span>
          <button type="button" disabled={stopping === busy.requestId} onClick={() => void stopGeneration()}>
            <Square size={11} /> 중지
          </button>
        </div>
      )}
      {tab === "chat" && (
        <form
          className="chat-composer study-composer"
          onSubmit={(e) => {
            e.preventDefault()
            sendQuestion()
          }}
        >
          <label className="scope-picker">
            질문 범위
            <select
              aria-label="질문 범위"
              value={scope.type === "section" ? scope.sectionId : scope.type}
              onChange={(e) =>
                setScope(
                  e.target.value === "document"
                    ? { type: "document" }
                    : e.target.value === "selection"
                      ? { type: "selection" }
                      : { type: "section", sectionId: e.target.value },
                )
              }
            >
              <option value="document">문서 전체</option>
              <option value="selection" disabled={!effectiveSelection}>
                선택한 구절
              </option>
              {snapshot?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          {effectiveSelection && (
            <div className="composer-selection">
              <strong>
                선택 구절 · PDF p. {effectiveSelection.pages.map((p) => p.pageNumber).join(", ")}
              </strong>
              <p>{effectiveSelection.text.slice(0, 400)}</p>
              <button
                type="button"
                onClick={() => {
                  setDismissed(true)
                  setQuoted(null)
                  if (scope.type === "selection") setScope({ type: "document" })
                }}
              >
                인용 해제
              </button>
            </div>
          )}
          {capture && (
            <div className="composer-capture">
              <img src={capture.dataUrl} alt={`PDF ${capture.pageIndex + 1}페이지 캡처`} />
              <span>그림·표 · p. {capture.pageIndex + 1}</span>
              <button type="button" onClick={onDismissCapture}>
                제거
              </button>
              {!models.find((m) => m.id === status?.selectedModel)?.vision && (
                <small>현재 모델의 이미지 지원을 확인할 수 없습니다.</small>
              )}
            </div>
          )}
          <textarea
            ref={composer}
            aria-label="원문 질문"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="이 논문의 주장과 근거를 함께 살펴보세요…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (ready) sendQuestion()
              }
            }}
          />
          <div className="composer-footer">
            <button type="button" onClick={onStartCapture}>
              그림·표 캡처
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => void generate("chat", "선택한 원문의 핵심 개념과 논리를 설명해 주세요.")}
            >
              핵심 개념
            </button>
            <button
              type="submit"
              className="send-button"
              disabled={
                !ready ||
                !question.trim() ||
                (!!capture && !models.find((m) => m.id === status?.selectedModel)?.vision)
              }
              aria-label="질문 보내기"
            >
              <Send size={15} />
            </button>
          </div>
        </form>
      )}
    </aside>
  )
}
