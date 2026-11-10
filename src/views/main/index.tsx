import { Theme } from "@astryxdesign/core/theme"
import { neutralTheme } from "@astryxdesign/theme-neutral/built"
import React from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { SettingsWindow } from "./components/SettingsWindow"
import "./rpc"

const root = document.getElementById("root")
if (!root) throw new Error("PDFie root element was not found")

createRoot(root).render(
  <React.StrictMode>
    <Theme theme={neutralTheme} mode="system">
      {document.body.hasAttribute("data-pdfie-settings") ? <SettingsWindow /> : <App />}
    </Theme>
  </React.StrictMode>,
)
