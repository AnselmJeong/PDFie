function showBootstrapError(label, detail) {
  const root = document.getElementById("root")
  if (!root) return
  root.innerHTML = ""
  const container = document.createElement("main")
  container.style.cssText =
    "display:grid;width:100%;height:100%;place-content:center;padding:40px;background:#fafafa;color:#b91c1c;font:13px -apple-system,sans-serif;text-align:center"
  const title = document.createElement("strong")
  title.textContent = label
  const message = document.createElement("pre")
  message.style.cssText = "max-width:760px;white-space:pre-wrap;line-height:1.6"
  message.textContent = detail
  container.append(title, message)
  root.append(container)
}

window.addEventListener("error", (event) => {
  showBootstrapError("PDFie view error", `${event.message}\n${event.filename}:${event.lineno}:${event.colno}`)
})

window.addEventListener("unhandledrejection", (event) => {
  const detail =
    event.reason instanceof Error
      ? `${event.reason.message}\n${event.reason.stack ?? ""}`
      : String(event.reason)
  showBootstrapError("PDFie promise error", detail)
})
