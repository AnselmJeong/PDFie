import { useCallback, useEffect, useRef, useState } from "react"
import type { AiSettingsStatus } from "../../../../bun/ai/ai-settings-repository"
import type { ModelInfo, ProviderStatus } from "../../../../shared/study/contracts"
import { rpc } from "../../rpc"

export const loginDisabled = (state: ProviderStatus | null, pending: boolean) =>
  pending || !state?.installed || state.connected || state.signingIn

export function useAiConnection() {
  const [status, setStatus] = useState<AiSettingsStatus | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [providerState, setProviderState] = useState<ProviderStatus | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = useRef<AiSettingsStatus | null>(null)
  const provider = useRef<ProviderStatus | null>(null)
  const mounted = useRef(false),
    generation = useRef(0)
  const report = useCallback((cause: unknown) => {
    if (mounted.current) setError(cause instanceof Error ? cause.message : "연결 상태를 확인하지 못했습니다.")
  }, [])
  const loadModels = useCallback(
    async (settings: AiSettingsStatus) => {
      const token = ++generation.current
      setLoadingModels(true)
      try {
        const result = await rpc.request["ai.models"]({})
        if (!mounted.current || generation.current !== token || saved.current?.provider !== result.provider)
          return
        setModels(result.models)
        setError(null)
        if (!settings.selectedModel && result.models.length) {
          const selected = result.models.find((m) => m.isDefault) ?? result.models[0]!
          await rpc.request["ai.settings.update"]({ selectedModel: selected.id })
        }
      } catch (cause) {
        if (generation.current === token) {
          setModels([])
          report(cause)
        }
      } finally {
        if (mounted.current && generation.current === token) setLoadingModels(false)
      }
    },
    [report],
  )
  const applyProvider = useCallback(
    (next: ProviderStatus) => {
      if (!mounted.current) return
      const wasConnected = provider.current?.connected
      provider.current = next
      setProviderState(next)
      if (next.connected) {
        setError(null)
        if (!wasConnected && saved.current?.provider === "codex") void loadModels(saved.current)
      } else if (saved.current?.provider === "codex") {
        generation.current++
        setModels([])
        setLoadingModels(false)
      }
    },
    [loadModels],
  )
  const refreshProvider = useCallback(async () => {
    try {
      applyProvider(await rpc.request["ai.provider.status"]({}))
    } catch (cause) {
      report(cause)
    }
  }, [applyProvider, report])
  const applySettings = useCallback(
    (next: AiSettingsStatus) => {
      if (!mounted.current) return
      const previous = saved.current
      saved.current = next
      setStatus(next)
      if (previous?.provider !== next.provider || previous?.hasApiKey !== next.hasApiKey) {
        generation.current++
        setModels([])
        setError(null)
        if (next.provider === "codex") {
          if (provider.current?.connected) void loadModels(next)
          void refreshProvider()
        } else if (next.hasApiKey) void loadModels(next)
      }
    },
    [loadModels, refreshProvider],
  )
  useEffect(() => {
    mounted.current = true
    const settingsChanged = (event: Event) => applySettings((event as CustomEvent<AiSettingsStatus>).detail)
    const providerChanged = (event: Event) => applyProvider((event as CustomEvent<ProviderStatus>).detail)
    const refresh = () => {
      void rpc.request["ai.settings.get"]({}).then(applySettings).catch(report)
      if (saved.current?.provider === "codex") void refreshProvider()
    }
    window.addEventListener("pdfie:settings-changed", settingsChanged)
    window.addEventListener("pdfie:provider-changed", providerChanged)
    window.addEventListener("focus", refresh)
    refresh()
    return () => {
      mounted.current = false
      generation.current++
      window.removeEventListener("pdfie:settings-changed", settingsChanged)
      window.removeEventListener("pdfie:provider-changed", providerChanged)
      window.removeEventListener("focus", refresh)
    }
  }, [applySettings, applyProvider, refreshProvider, report])
  useEffect(() => {
    if (status?.provider !== "codex" || !providerState?.signingIn) return
    const timer = setInterval(() => void refreshProvider(), 1500)
    return () => clearInterval(timer)
  }, [status?.provider, providerState?.signingIn, refreshProvider])
  const updateSettings = useCallback(
    async (patch: {
      provider?: AiSettingsStatus["provider"]
      selectedModel?: string
      sidebarWidth?: number
      sidebarFontSize?: number
      apiKey?: string
      clearApiKey?: boolean
    }) => {
      const next = await rpc.request["ai.settings.update"](patch)
      applySettings(next)
      return next
    },
    [applySettings],
  )
  return {
    status,
    setStatus,
    models,
    providerState,
    loadingModels,
    error,
    setError,
    report,
    loadModels,
    refreshProvider,
    updateSettings,
  }
}
