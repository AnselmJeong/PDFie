import type { ElectrobunConfig } from "electrobun"
import pkg from "./package.json"

export default {
  app: {
    name: "PDFie",
    identifier: "dev.aquatope.pdfie",
    version: pkg.version,
    fileAssociations: [{ ext: ["pdf"], name: "PDF document", role: "Viewer" }],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      main: {
        entrypoint: "src/views/main/index.tsx",
      },
    },
    copy: {
      "src/views/main/index.html": "views/main/index.html",
      "src/views/main/bootstrap.js": "views/main/bootstrap.js",
      "src/views/main/styles/app.css": "views/main/app.css",
      "node_modules/@embedpdf/pdfium/dist/pdfium.wasm": "views/main/assets/pdfium.wasm",
      "tests/golden-selection/cases.json": "views/main/qa/golden-selection-cases.json",
    },
    mac: {
      bundleCEF: false,
      defaultRenderer: "native",
      codesign: false,
      notarize: false,
      icons: "assets/icon.iconset",
    },
  },
  scripts: {
    postBuild: "scripts/set-macos-minimum-version.ts",
    postWrap: "scripts/set-macos-minimum-version.ts",
  },
} satisfies ElectrobunConfig
