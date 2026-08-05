import { ApplicationMenu, Utils } from "electrobun/bun"

const OPEN_PDF = "open-pdf"
const QUIT_APP = "quit-app"

export function installApplicationMenu(onOpenPdf: () => void) {
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const action = (event as { data?: { action?: string } }).data?.action
    if (action === OPEN_PDF) onOpenPdf()
    if (action === QUIT_APP) Utils.quit()
  })

  ApplicationMenu.setApplicationMenu([
    {
      submenu: [
        { label: "About PDFie", role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { label: "Quit PDFie", action: QUIT_APP, accelerator: "q" },
      ],
    },
    {
      label: "File",
      submenu: [{ label: "Open PDF…", action: OPEN_PDF, accelerator: "o" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "enterFullScreen" }, { role: "exitFullScreen" }],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "bringAllToFront" }],
    },
  ])
}
