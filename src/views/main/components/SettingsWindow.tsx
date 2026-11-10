import { Badge } from "@astryxdesign/core/Badge"
import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { SelectableCard } from "@astryxdesign/core/SelectableCard"
import { Selector } from "@astryxdesign/core/Selector"
import { Slider } from "@astryxdesign/core/Slider"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Cloud, KeyRound, Monitor, Moon, Palette, RefreshCw, Sparkles, Sun } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import type { AppearanceMode } from "../../../bun/ai/ai-settings-repository"
import type { ProviderId } from "../../../shared/study/contracts"
import { loginDisabled, useAiConnection } from "../features/study/useAiConnection"
import { rpc } from "../rpc"

type Page = "connection" | "appearance"

const PAGES: Array<{ id: Page; label: string; description: string; icon: ReactNode }> = [
  {
    id: "connection",
    label: "AI 연결",
    description: "학습 자료를 만들 AI 서비스와 모델을 고릅니다.",
    icon: <Sparkles size={15} />,
  },
  {
    id: "appearance",
    label: "화면",
    description: "모양과 학습 공간의 읽기 환경을 조절합니다.",
    icon: <Palette size={15} />,
  },
]

const APPEARANCES: Array<{ id: AppearanceMode; label: string; icon: ReactNode }> = [
  { id: "system", label: "시스템 설정", icon: <Monitor size={15} /> },
  { id: "light", label: "라이트", icon: <Sun size={15} /> },
  { id: "dark", label: "다크", icon: <Moon size={15} /> },
]

/** A labelled settings row: text on the left, its control on the right. */
function Row({
  title,
  description,
  children,
  stacked,
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  stacked?: boolean
}) {
  return (
    <div className="settings-row" data-stacked={stacked || undefined}>
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group" aria-label={title}>
      <h2>{title}</h2>
      <div className="settings-group-body">{children}</div>
    </section>
  )
}

const resetTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

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
  const [page, setPage] = useState<Page>("connection")
  const [apiKey, setApiKey] = useState("")
  const [pending, setPending] = useState(false)
  const [fontSize, setFontSize] = useState<number | null>(null)
  const [panelWidth, setPanelWidth] = useState<number | null>(null)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) void rpc.request["app.settings.close"]({})
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
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
  const current = PAGES.find((item) => item.id === page) ?? PAGES[0]!
  const provider = status?.provider ?? "ollama-cloud"
  const connection = !providerState
    ? { label: "연결 상태 확인 중…", variant: "neutral" as const }
    : providerState.connected
      ? { label: "ChatGPT 연결됨", variant: "success" as const }
      : providerState.signingIn
        ? { label: "브라우저에서 로그인하는 중…", variant: "accent" as const }
        : providerState.installed
          ? { label: "ChatGPT 로그인 필요", variant: "warning" as const }
          : { label: "Codex CLI 설치 필요", variant: "error" as const }
  const selectedModel = models.find((model) => model.id === status?.selectedModel)
  const modelOptions = [
    ...(status?.selectedModel && !selectedModel
      ? [{ value: status.selectedModel, label: status.selectedModel }]
      : []),
    ...models.map((model) => ({
      value: model.id,
      label: model.label,
      description: model.vision ? "이미지 지원 · 그림·표 캡처를 읽을 수 있습니다" : undefined,
    })),
  ]

  return (
    <div className="settings-window">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-title">설정</div>
        <nav aria-label="설정 항목">
          {PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => {
                setPage(item.id)
                setError(null)
              }}
            >
              <span className="settings-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-footer">
          <p>변경사항은 바로 저장됩니다.</p>
          <Button
            size="sm"
            variant="secondary"
            label="닫기"
            tooltip="Esc"
            onClick={() => void rpc.request["app.settings.close"]({})}
          />
        </div>
      </aside>

      <main className="settings-main">
        <header className="settings-main-header">
          <h1>{current.label}</h1>
          <p>{current.description}</p>
        </header>

        {error && (
          <Banner
            className="settings-banner"
            status="error"
            title="설정을 저장하지 못했습니다"
            description={error}
            isDismissable
            dismissLabel="오류 닫기"
            onDismiss={() => setError(null)}
          />
        )}

        {page === "connection" && (
          <>
            <Group title="AI 서비스">
              <div className="settings-provider-cards">
                {(
                  [
                    {
                      id: "codex",
                      title: "ChatGPT 구독",
                      description: "Codex 연결로 구독에 포함된 사용량을 씁니다.",
                      icon: <Sparkles size={16} />,
                    },
                    {
                      id: "ollama-cloud",
                      title: "Ollama Cloud",
                      description: "API 키로 클라우드 모델을 씁니다.",
                      icon: <Cloud size={16} />,
                    },
                  ] satisfies Array<{ id: ProviderId; title: string; description: string; icon: ReactNode }>
                ).map((item) => (
                  <SelectableCard
                    key={item.id}
                    label={item.title}
                    padding={3}
                    isSelected={provider === item.id}
                    isDisabled={!status || pending}
                    onChange={(selected) => {
                      if (selected && provider !== item.id)
                        void run(() => updateSettings({ provider: item.id }))
                    }}
                  >
                    <span className="settings-provider-card">
                      <span className="settings-provider-icon">{item.icon}</span>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>
                  </SelectableCard>
                ))}
              </div>
            </Group>

            {provider === "codex" ? (
              <Group title="ChatGPT 계정">
                <Row
                  title={
                    <span className="settings-status">
                      <StatusDot
                        variant={connection.variant}
                        label={connection.label}
                        isPulsing={!!providerState?.signingIn}
                      />
                      {connection.label}
                    </span>
                  }
                  description="PDFie 전용 로그인입니다. Codex 사용 한도는 다른 앱과 공유됩니다."
                >
                  {providerState?.signingIn ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      label="취소"
                      isDisabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await rpc.request["ai.provider.cancelLogin"]({})
                          await refreshProvider()
                        })
                      }
                    />
                  ) : providerState?.connected ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      label="로그아웃"
                      isDisabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await rpc.request["ai.provider.logout"]({})
                          await refreshProvider()
                        })
                      }
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      label="ChatGPT 로그인"
                      isDisabled={loginDisabled(providerState, pending)}
                      onClick={() =>
                        void run(async () => {
                          await rpc.request["ai.provider.login"]({})
                          await refreshProvider()
                        })
                      }
                    />
                  )}
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label="연결 상태 확인"
                    tooltip="연결 상태 확인"
                    icon={<RefreshCw size={14} />}
                    isDisabled={pending}
                    onClick={() => void run(refreshProvider)}
                  />
                </Row>
                {providerState?.connected && (
                  <>
                    <Row title="포함 사용량" description="구독에 포함된 사용 한도입니다.">
                      <Badge
                        variant={
                          providerState.allowance === "available"
                            ? "success"
                            : providerState.allowance === "exhausted"
                              ? "error"
                              : "neutral"
                        }
                        label={
                          providerState.allowance === "available"
                            ? "사용 가능"
                            : providerState.allowance === "exhausted"
                              ? "한도 소진"
                              : "확인 중"
                        }
                      />
                    </Row>
                    {providerState.windows.map((window) => (
                      <Row
                        key={`${window.name}-${window.resetsAt}`}
                        title={`${window.name} 한도`}
                        description={
                          window.resetsAt ? `${resetTime(window.resetsAt)}에 재설정` : "재설정 시각 정보 없음"
                        }
                      >
                        <div className="settings-usage">
                          <ProgressBar
                            label={`${window.name} 사용량`}
                            isLabelHidden
                            value={window.usedPercent}
                            variant={
                              window.usedPercent >= 90
                                ? "error"
                                : window.usedPercent >= 70
                                  ? "warning"
                                  : "accent"
                            }
                          />
                          <span>{window.usedPercent}%</span>
                        </div>
                      </Row>
                    ))}
                  </>
                )}
                {providerState?.error && (
                  <p className="settings-inline-error" role="alert">
                    {providerState.error}
                  </p>
                )}
                {providerState?.connected && providerState.generationNotice && (
                  <p className="settings-inline-notice">{providerState.generationNotice}</p>
                )}
              </Group>
            ) : (
              <Group title="Ollama Cloud">
                <Row
                  stacked
                  title={
                    <span className="settings-status">
                      <KeyRound size={14} aria-hidden="true" /> API 키
                      {status?.hasApiKey && <Badge variant="success" label="저장됨" />}
                    </span>
                  }
                  description="질문에 필요한 원문 발췌와 대화를 Ollama Cloud에 전송합니다. 키는 이 Mac에 암호화해 보관합니다."
                >
                  <div className="settings-key-row">
                    <TextInput
                      type="password"
                      label="Ollama Cloud API 키"
                      isLabelHidden
                      size="sm"
                      value={apiKey}
                      onChange={setApiKey}
                      placeholder={status?.hasApiKey ? "저장된 키 유지" : "API 키 입력"}
                      autoComplete="off"
                      onEnter={() => {
                        if (!apiKey.trim()) return
                        void run(async () => {
                          const saved = await updateSettings({ apiKey })
                          setApiKey("")
                          await loadModels(saved)
                        })
                      }}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      label="저장"
                      isDisabled={!apiKey.trim() || pending}
                      onClick={() =>
                        void run(async () => {
                          const saved = await updateSettings({ apiKey })
                          setApiKey("")
                          await loadModels(saved)
                        })
                      }
                    />
                  </div>
                </Row>
              </Group>
            )}

            <Group title="모델">
              <Row
                stacked
                title="학습 모델"
                description="목표, 설명, 요약과 수업을 만들 모델입니다. 이미지를 지원하는 모델만 그림·표 캡처를 읽습니다."
              >
                <div className="settings-model-row">
                  <Selector
                    label="학습 모델"
                    isLabelHidden
                    size="sm"
                    placeholder={loadingModels ? "모델 불러오는 중…" : "모델 선택"}
                    value={status?.selectedModel || undefined}
                    isDisabled={pending || loadingModels || !models.length}
                    hasSearch={modelOptions.length > 8}
                    searchPlaceholder="모델 검색"
                    options={modelOptions}
                    onChange={(value) => void run(() => updateSettings({ selectedModel: value }))}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label="모델 목록 새로고침"
                    tooltip="모델 목록 새로고침"
                    icon={<RefreshCw size={14} />}
                    isLoading={loadingModels}
                    isDisabled={
                      pending ||
                      !status ||
                      (status.provider === "codex" ? !providerState?.connected : !status.hasApiKey)
                    }
                    onClick={() => status && void loadModels(status)}
                  />
                </div>
              </Row>
            </Group>
          </>
        )}

        {page === "appearance" && (
          <>
            <Group title="모양">
              <div className="settings-appearance">
                {APPEARANCES.map((item) => (
                  <SelectableCard
                    key={item.id}
                    label={item.label}
                    padding={2}
                    isSelected={(status?.appearance ?? "system") === item.id}
                    isDisabled={!status}
                    onChange={(selected) => {
                      if (selected) void run(() => updateSettings({ appearance: item.id }))
                    }}
                  >
                    <span className="settings-appearance-card">
                      <span className="appearance-preview" data-mode={item.id} aria-hidden="true">
                        {(item.id === "system" ? ["light", "dark"] : [item.id]).map((mode) => (
                          <span className="appearance-window" data-mode={mode} key={mode}>
                            <i />
                            <i />
                            <i />
                          </span>
                        ))}
                      </span>
                      <span className="settings-appearance-label">
                        {item.icon}
                        {item.label}
                      </span>
                    </span>
                  </SelectableCard>
                ))}
              </div>
            </Group>
            <Group title="학습 공간">
              <Row stacked title="글자 크기" description="AI 사이드바의 답변과 질문에 적용됩니다.">
                <Slider
                  label="학습 공간 글자 크기"
                  isLabelHidden
                  min={12}
                  max={19}
                  step={1}
                  value={fontSize ?? status?.sidebarFontSize ?? 14}
                  isDisabled={!status}
                  valueDisplay="text"
                  formatValue={(value) => `${value}px`}
                  onChange={(value: number) => setFontSize(value)}
                  onChangeEnd={(value: number) =>
                    void run(() => updateSettings({ sidebarFontSize: value })).then(() => setFontSize(null))
                  }
                />
              </Row>
              <Row
                stacked
                title="패널 너비"
                description="사이드바 왼쪽 가장자리를 끌어서 조절할 수도 있습니다."
              >
                <Slider
                  label="학습 공간 너비"
                  isLabelHidden
                  min={340}
                  max={560}
                  step={10}
                  value={panelWidth ?? status?.sidebarWidth ?? 390}
                  isDisabled={!status}
                  valueDisplay="text"
                  formatValue={(value) => `${value}px`}
                  onChange={(value: number) => setPanelWidth(value)}
                  onChangeEnd={(value: number) =>
                    void run(() => updateSettings({ sidebarWidth: value })).then(() => setPanelWidth(null))
                  }
                />
              </Row>
            </Group>
          </>
        )}
      </main>
    </div>
  )
}
