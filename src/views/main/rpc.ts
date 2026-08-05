import { Electroview } from "electrobun/view"
import type { AppRPC } from "../../shared/rpc/app-rpc"

export const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      "pdf.openRequested": () => {
        window.dispatchEvent(new CustomEvent("pdfie:open-requested"))
      },
      "ai.token": (detail) => {
        window.dispatchEvent(new CustomEvent("pdfie:ai-token", { detail }))
      },
    },
  },
})

export const electroview = new Electroview({ rpc })
