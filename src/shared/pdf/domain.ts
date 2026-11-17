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

/**
 * A pen stroke, shape, arrow or text note drawn with the mark tools. These are
 * real PDF annotations in the open document; PDFie keeps their JSON form so it
 * can recreate them on reopen without writing to the user's file.
 */
export interface PdfMark {
  id: string
  pageIndex: number
  /** An EmbedPDF `PdfAnnotationObject`, JSON-safe (dates as ISO strings). */
  annotation: Record<string, unknown>
}

export type PdfReaderLayout = "paged" | "continuous"

/** Margin cropping: on/off and the reader's adjustment to the detected crop (fraction of the page). */
export interface PdfCropSetting {
  enabled: boolean
  adjust: number
}

export interface PdfViewerSource {
  documentId: string
  transport: "loopback-range"
  url: string
  fileName: string
  /**
   * The content hash that links annotations, study records and the library.
   * Null while a newly seen file is still being hashed in the background:
   * nothing hash-bound may be shown or saved until `pdf.identify` returns.
   */
  documentHash: string | null
  sizeBytes: number
}

/** A source whose content hash is known, so hash-bound records may be shown. */
export type IdentifiedPdfSource = PdfViewerSource & { documentHash: string }

export function isIdentified(source: PdfViewerSource): source is IdentifiedPdfSource {
  return typeof source.documentHash === "string" && source.documentHash.length > 0
}

export interface PdfOpenResult {
  source: PdfViewerSource
  restored: {
    currentPage: number
    zoom: number
    rotation: number
    highlights: PdfTextHighlight[]
    marks: PdfMark[]
    layout: PdfReaderLayout
    crop: PdfCropSetting
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
