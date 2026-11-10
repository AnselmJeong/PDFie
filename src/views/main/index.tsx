import { LayerProvider } from "@astryxdesign/core/Layer"
import { Theme } from "@astryxdesign/core/theme"
import React, { type ReactNode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import type { AppearanceMode } from "../../bun/ai/ai-settings-repository"
import { App } from "./App"
import { SettingsWindow } from "./components/SettingsWindow"
import { rpc } from "./rpc"
import { pdfieTheme } from "./theme/pdfie"
import { installTitleBarZoom } from "./window-chrome"

installTitleBarZoom(() => rpc.request["app.window.zoom"]({}))

/** The saved appearance (system, light or dark) applies to every window. */
function AppTheme({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppearanceMode>("system")
  useEffect(() => {
    const apply = (value: { appearance?: AppearanceMode } | undefined) => {
      if (value?.appearance) setMode(value.appearance)
    }
    const changed = (event: Event) => apply((event as CustomEvent<{ appearance?: AppearanceMode }>).detail)
    void rpc.request["ai.settings.get"]({})
      .then(apply)
      .catch(() => undefined)
    window.addEventListener("pdfie:settings-changed", changed)
    return () => window.removeEventListener("pdfie:settings-changed", changed)
  }, [])
  return (
    <Theme theme={pdfieTheme} mode={mode}>
      <LayerProvider toast={{ position: "bottomEnd", maxVisible: 3 }}>{children}</LayerProvider>
    </Theme>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("PDFie root element was not found")

createRoot(root).render(
  <React.StrictMode>
    <AppTheme>{document.body.hasAttribute("data-pdfie-settings") ? <SettingsWindow /> : <App />}</AppTheme>
  </React.StrictMode>,
)
