export type SourceKind = "pdf"
export type DocumentType = "article" | "book" | "unknown"
export type DocumentTypeSource = "auto" | "user"
export type ExtractionMode = "native" | "docling" | "ocr"
export type StructureMode =
  | "article-single-document"
  | "bookmark-chapters"
  | "docling-chapters"
  | "unknown-document"

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfSelectionPage {
  pageNumber: number
  rects: PdfRect[]
}

export interface PdfSelection {
  text: string
  normalizedText: string
  pages: PdfSelectionPage[]
  source: "viewer"
}

export type PdfHighlightStyle = "yellow" | "green" | "blue" | "pink" | "red-underline"

export interface PdfTextHighlight {
  id: string
  text: string
  style: PdfHighlightStyle
  pages: PdfSelectionPage[]
  createdAt: string
  note?: string
}

export interface PdfViewerSource {
  documentId: string
  transport: "loopback-range"
  url: string
  fileName: string
  documentHash: string
  sizeBytes: number
}

export interface PdfOpenResult {
  source: PdfViewerSource
  restored: {
    currentPage: number
    zoom: number
    rotation: number
    highlights: PdfTextHighlight[]
  }
  persistedType: { documentType: DocumentType; source: DocumentTypeSource }
}

export interface PdfOutlineNode {
  id: string
  title: string
  pageNumber: number | null
  children: PdfOutlineNode[]
}

export interface SelectionAiRequest {
  id: string
  selection: PdfSelection
  prompt: string | null
}
