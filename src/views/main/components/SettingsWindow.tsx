import { Check, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import type { ProviderId } from "../../../shared/study/contracts"
import { loginDisabled, useAiConnection } from "../features/study/useAiConnection"
import { rpc } from "../rpc"

export function SettingsWindow() {
  const {
    status,
    models,
    providerState,
    loadingModels,
    error,
    setError,
    report,
    loadModels,
    refreshProvider,
    updateSettings,
  } = useAiConnection()
  const [tab, setTab] = useState<"connection" | "appearance">("connection")
  const [apiKey, setApiKey] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") void rpc.request["app.settings.close"]({})
    }
    window.addEventListener("keydown", key)
    return () => {
      window.removeEventListener("keydown", key)
    }
  }, [])
  const run = async (action: () => Promise<unknown>) => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      report(cause)
    } finally {
      setPending(false)
    }
  }
  const connection = !providerState
    ? "연결 상태 확인 중…"
    : providerState.connected
      ? "ChatGPT 연결됨"
      : providerState?.signingIn
        ? "브라우저에서 로그인하는 중…"
        : providerState?.installed
          ? "ChatGPT 로그인 필요"
          : "Codex CLI 설치 필요"
  return (
    <div className="settings-window">
      <header className="settings-window-header">
        <h1>설정</h1>
        <nav aria-label="설정 항목">
          {(
            [
              ["connection", "AI 연결"],
              ["appearance", "화면"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id)
                setError(null)
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="settings-window-content">
        {tab === "connection" && (
          <>
            <section className="settings-section">
              <label className="settings-field">
                AI 서비스
                <select
                  aria-label="AI 서비스"
                  value={status?.provider ?? "ollama-cloud"}
                  disabled={!status || pending}
                  onChange={(event) =>
                    void run(() => updateSettings({ provider: event.target.value as ProviderId }))
                  }
                >
                  <option value="ollama-cloud">Ollama Cloud</option>
                  <option value="codex">Codex · ChatGPT 구독</option>
                </select>
              </label>
            </section>
            {status?.provider === "codex" ? (
              <section className="settings-section">
                <div
                  className="settings-connection-status"
                  role="status"
                  data-connected={providerState?.connected || undefined}
                >
                  {providerState?.connected && <Check size={17} />}
                  <strong>{connection}</strong>
                </div>
                <p className="settings-description">
                  PDFie 전용 로그인입니다. Codex 사용 한도는 다른 앱과 공유됩니다.
                </p>
                <div className="settings-actions">
                  <button
                    type="button"
                    disabled={loginDisabled(providerState, pending)}
                    onClick={() =>
                      void run(async () => {
                        await rpc.request["ai.provider.login"]({})
                        await refreshProvider()
                      })
                    }
                  >
                    {providerState?.connected
                      ? "로그인 완료"
                      : providerState?.signingIn
                        ? "로그인 대기 중"
                        : "ChatGPT 로그인"}
                  </button>
                  {providerState?.signingIn && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await rpc.request["ai.provider.cancelLogin"]({})
                          await refreshProvider()
                        })
                      }
                    >
                      취소
                    </button>
                  )}
                  {providerState?.connected && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await rpc.request["ai.provider.logout"]({})
                          await refreshProvider()
                        })
                      }
                    >
                      로그아웃
                    </button>
                  )}
                  <button
                    type="button"
                    className="settings-quiet-button"
                    disabled={pending}
                    onClick={() => void run(refreshProvider)}
                  >
                    <RefreshCw size={13} /> 상태 확인
                  </button>
                </div>
                {providerState?.connected && (
                  <div className="settings-quota">
                    <div>
                      <span>포함 사용</span>
                      <strong>
                        {providerState.allowance === "available"
                          ? "사용 가능"
                          : providerState.allowance === "exhausted"
                            ? "한도 소진"
                            : "확인 중"}
                      </strong>
                    </div>
                    {providerState.windows.map((window) => (
                      <div key={`${window.name}-${window.resetsAt}`}>
                        <span>{window.name}</span>
                        <span>
                          {window.usedPercent}% 사용
                          {window.resetsAt
                            ? ` · ${new Date(window.resetsAt * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 재설정`
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {providerState?.error && (
                  <p className="settings-error" role="alert">
                    {providerState.error}
                  </p>
                )}
                {providerState?.connected && providerState.generationNotice && (
                  <p className="settings-notice">{providerState.generationNotice}</p>
                )}
              </section>
            ) : (
              <section className="settings-section">
                <label className="settings-field">
                  API 키
                  <div className="settings-key-row">
                    <input
                      aria-label="Ollama Cloud API 키"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={status?.hasApiKey ? "저장된 키 유지" : "Ollama Cloud API 키 입력"}
                    />
                    <button
                      type="button"
                      disabled={!apiKey.trim() || pending}
                      onClick={() =>
                        void run(async () => {
                          const saved = await updateSettings({ apiKey })
                          setApiKey("")
                          await loadModels(saved)
                        })
                      }
                    >
                      저장
                    </button>
                  </div>
                </label>
                <p className="settings-description">
                  질문에 필요한 원문 발췌와 대화를 Ollama Cloud에 전송합니다.
                </p>
                {status?.hasApiKey && (
                  <p className="settings-saved">
                    <Check size={13} /> API 키 저장됨
                  </p>
                )}
              </section>
            )}
            <section className="settings-section">
              <label className="settings-field">
                모델
                <select
                  aria-label="학습 모델"
                  value={status?.selectedModel ?? ""}
                  disabled={pending || loadingModels || !models.length}
                  onChange={(event) => void run(() => updateSettings({ selectedModel: event.target.value }))}
                >
                  <option value="">{loadingModels ? "모델 불러오는 중…" : "모델 선택"}</option>
                  {status?.selectedModel && !models.some((model) => model.id === status.selectedModel) && (
                    <option value={status.selectedModel}>{status.selectedModel}</option>
                  )}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.vision ? " · 이미지 지원" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="settings-quiet-button"
                disabled={
                  pending ||
                  loadingModels ||
                  !status ||
                  (status.provider === "codex" ? !providerState?.connected : !status.hasApiKey)
                }
                onClick={() => status && void loadModels(status)}
              >
                <RefreshCw size={13} /> 모델 목록 새로고침
              </button>
            </section>
          </>
        )}
        {tab === "appearance" && (
          <section className="settings-section">
            <h2>학습 공간</h2>
            <label className="settings-field settings-inline-field">
              글자 크기
              <select
                aria-label="학습 공간 글자 크기"
                value={status?.sidebarFontSize ?? 14}
                disabled={!status}
                onChange={(event) =>
                  void updateSettings({ sidebarFontSize: Number(event.target.value) }).catch(report)
                }
              >
                {Array.from({ length: 8 }, (_, i) => i + 12).map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field settings-inline-field">
              패널 너비
              <input
                aria-label="학습 공간 너비"
                type="number"
                min={340}
                max={560}
                step={10}
                value={status?.sidebarWidth ?? 390}
                disabled={!status}
                onChange={(event) =>
                  void updateSettings({ sidebarWidth: Number(event.target.value) }).catch(report)
                }
              />
            </label>
            <p className="settings-description">패널의 왼쪽 가장자리를 끌어서 너비를 조절할 수도 있습니다.</p>
          </section>
        )}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </main>
      <footer className="settings-window-footer">
        <span>변경사항은 바로 저장됩니다.</span>
        <button type="button" onClick={() => void rpc.request["app.settings.close"]({})}>
          완료
        </button>
      </footer>
    </div>
  )
}
