import React from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { SettingsWindow } from "./components/SettingsWindow"
import "./rpc"

const root = document.getElementById("root")
if (!root) throw new Error("PDFie root element was not found")

createRoot(root).render(
  <React.StrictMode>
    {document.body.hasAttribute("data-pdfie-settings") ? <SettingsWindow /> : <App />}
  </React.StrictMode>,
)
