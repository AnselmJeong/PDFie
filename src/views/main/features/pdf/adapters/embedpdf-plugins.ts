import { createPluginRegistration } from "@embedpdf/core"
import { BookmarkPluginPackage } from "@embedpdf/plugin-bookmark/react"
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react"
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react"
import { PanPluginPackage } from "@embedpdf/plugin-pan/react"
import { RenderPluginPackage } from "@embedpdf/plugin-render/react"
import { RotatePluginPackage } from "@embedpdf/plugin-rotate/react"
import { ScrollPluginPackage, ScrollStrategy } from "@embedpdf/plugin-scroll/react"
import { SearchPluginPackage } from "@embedpdf/plugin-search/react"
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react"
import { SpreadMode, SpreadPluginPackage } from "@embedpdf/plugin-spread/react"
import { TilingPluginPackage } from "@embedpdf/plugin-tiling/react"
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react"
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react"
import type { PdfViewerSource } from "../../../../../shared/pdf/domain"

export function createPdfPlugins(
  source: PdfViewerSource,
  initialView: { currentPage: number; zoom: number; rotation: number },
) {
  return [
    createPluginRegistration(DocumentManagerPluginPackage, {
      maxDocuments: 1,
      initialDocuments: [
        {
          documentId: source.documentId,
          url: source.url,
          name: source.fileName,
          mode: "range-request",
          autoActivate: true,
        },
      ],
    }),
    createPluginRegistration(ViewportPluginPackage, { viewportGap: 16 }),
    createPluginRegistration(SpreadPluginPackage, {
      defaultSpreadMode: SpreadMode.None,
    }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
      defaultPageGap: 18,
      defaultBufferSize: 3,
    }),
    createPluginRegistration(RenderPluginPackage, {
      defaultImageType: "image/webp",
      defaultImageQuality: 0.92,
    }),
    createPluginRegistration(TilingPluginPackage, {
      tileSize: 768,
      overlapPx: 2,
      extraRings: 1,
    }),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: initialView.zoom > 0 ? initialView.zoom : 1,
      minZoom: 0.25,
      maxZoom: 5,
      zoomStep: 0.1,
    }),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(PanPluginPackage, { defaultMode: "never" }),
    createPluginRegistration(RotatePluginPackage, { defaultRotation: 0 }),
    createPluginRegistration(SearchPluginPackage, { showAllResults: true }),
    createPluginRegistration(BookmarkPluginPackage),
    createPluginRegistration(SelectionPluginPackage, {
      minSelectionDragDistance: 2,
      maxCachedGeometries: 60,
      // Allow a small gap around glyph ink, including spaces/letter counters.
      // The SDK default (1.5) can reach adjacent lines; zero makes ordinary
      // drags appear broken unless both endpoints land precisely on glyphs.
      toleranceFactor: 0.25,
      marquee: { enabled: false },
    }),
  ]
}
