import { Electroview } from "electrobun/view"
import type { AppRPC } from "../../shared/rpc/app-rpc"

export const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      "ai.settings.changed": (detail) =>
        window.dispatchEvent(new CustomEvent("pdfie:settings-changed", { detail })),
      "ai.provider.changed": (detail) =>
        window.dispatchEvent(new CustomEvent("pdfie:provider-changed", { detail })),
      "app.settings.contextChanged": () =>
        window.dispatchEvent(new CustomEvent("pdfie:settings-context-changed")),
      "study.records.changed": (detail) =>
        window.dispatchEvent(new CustomEvent("pdfie:records-changed", { detail })),
      "study.event": (detail) => window.dispatchEvent(new CustomEvent("pdfie:study-event", { detail })),
      "pdf.openRequested": () => {
        window.dispatchEvent(new CustomEvent("pdfie:open-requested"))
      },
      "library.openRequested": () => window.dispatchEvent(new CustomEvent("pdfie:library-requested")),
      "ai.token": (detail) => {
        window.dispatchEvent(new CustomEvent("pdfie:ai-token", { detail }))
      },
    },
  },
})

export const electroview = new Electroview({ rpc })
