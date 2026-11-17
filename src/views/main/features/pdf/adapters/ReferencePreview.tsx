import type { PluginRegistry } from "@embedpdf/core"
import { ExternalLink } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import type { PdfRect } from "../../../../../shared/pdf/domain"
import {
  destinationRegion,
  previewRegion,
  type ReferenceMention,
  resolveMention,
} from "../../../../../shared/pdf/reference-links"
import type { ReferenceHover } from "./ReferenceLayer"
import type { PageReference, ReferenceIndex } from "./reference-index"
import { nativeDocument } from "./study-analysis"

const PREVIEW_WIDTH = 420
const MAX_ITEMS = 3

export interface PreviewItem {
  key: string
  pageIndex: number
  region: PdfRect
  label: string
  text?: string
}

function mentionTitle(mention: ReferenceMention): string {
  if (mention.kind === "citation") return `참고문헌 ${mention.text}`
  return `${mention.kind === "table" ? "Table" : "Figure"} ${mention.labels[0] ?? ""}`
}

/** What a reference previews and where a click on it leads. */
export function previewFor(
  reference: PageReference,
  index: ReferenceIndex,
  pageSize: (pageIndex: number) => { width: number; height: number } | null,
): { title: string; items: PreviewItem[]; url?: string; pending?: boolean } {
  if (reference.type === "external-link") return { title: "외부 링크", items: [], url: reference.url }
  const mention = reference.type === "mention" ? reference.mention : reference.mention
  const targets = mention ? resolveMention(mention, index.targets).slice(0, MAX_ITEMS) : []
  if (targets.length && mention) {
    return {
      title: mentionTitle(mention),
      items: targets.flatMap((target) => {
        const size = pageSize(target.pageIndex)
        if (!size) return []
        return [
          {
            key: `${target.kind}:${target.label}:${target.pageIndex}`,
            pageIndex: target.pageIndex,
            region: previewRegion(target, size),
            label:
              target.kind === "citation"
                ? `[${target.label}] · p. ${target.pageIndex + 1}`
                : `p. ${target.pageIndex + 1}`,
            text: target.kind === "citation" ? target.text : undefined,
          },
        ]
      }),
    }
  }
  if (reference.type === "internal-link") {
    const size = pageSize(reference.pageIndex)
    return {
      title: mention ? mentionTitle(mention) : `p. ${reference.pageIndex + 1}로 이동`,
      items: size
        ? [
            {
              key: `dest:${reference.pageIndex}:${Math.round(reference.y ?? 0)}`,
              pageIndex: reference.pageIndex,
              region: destinationRegion(reference.y, size),
              label: `p. ${reference.pageIndex + 1}`,
            },
          ]
        : [],
    }
  }
  return { title: mention ? mentionTitle(mention) : "", items: [], pending: true }
}

const imageCache = new Map<string, string>()

function PreviewImage({
  registry,
  sdkDocumentId,
  item,
}: {
  registry: PluginRegistry
  sdkDocumentId: string
  item: PreviewItem
}) {
  const cacheKey = `${sdkDocumentId}:${item.key}`
  const [src, setSrc] = useState(() => imageCache.get(cacheKey) ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (imageCache.has(cacheKey)) {
      setSrc(imageCache.get(cacheKey) ?? null)
      return
    }
    let cancelled = false
    const document = nativeDocument(registry, sdkDocumentId)
    const page = document.pages[item.pageIndex]
    if (!page) return
    const factor = Math.min(
      3,
      (PREVIEW_WIDTH * Math.max(1, window.devicePixelRatio || 1)) / item.region.width,
    )
    const task = registry.getEngine().renderPageRectRaw(
      document,
      page,
      {
        origin: { x: item.region.x, y: item.region.y },
        size: { width: item.region.width, height: item.region.height },
      },
      { scaleFactor: factor, dpr: 1, rotation: 0, withAnnotations: true },
    )
    task.wait(
      (image) => {
        if (cancelled) return
        const canvas = window.document.createElement("canvas")
        canvas.width = image.width
        canvas.height = image.height
        canvas
          .getContext("2d")
          ?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
        const url = canvas.toDataURL("image/png")
        if (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value as string)
        imageCache.set(cacheKey, url)
        setSrc(url)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
      task.abort({ code: 5, message: "Preview closed" })
    }
  }, [cacheKey, item, registry, sdkDocumentId])

  const ratio = item.region.height / item.region.width
  return (
    <div className="reference-preview-image" style={{ height: Math.round(PREVIEW_WIDTH * ratio) }}>
      {src ? <img src={src} alt="" /> : failed ? <span>미리 보기를 그리지 못했습니다.</span> : null}
    </div>
  )
}

/** Hover card for a reference; clicking the card follows the reference. */
export function ReferencePreview({
  hover,
  index,
  registry,
  sdkDocumentId,
  onEnter,
  onLeave,
  onActivate,
}: {
  hover: ReferenceHover
  index: ReferenceIndex
  registry: PluginRegistry
  sdkDocumentId: string
  onEnter: () => void
  onLeave: () => void
  onActivate: () => void
}) {
  const [targetsVersion, setTargetsVersion] = useState(0)
  useEffect(() => index.subscribe(() => setTargetsVersion((value) => value + 1)), [index])
  // biome-ignore lint/correctness/useExhaustiveDependencies: New targets from the growing index change the preview.
  const preview = useMemo(() => {
    const document = nativeDocument(registry, sdkDocumentId)
    return previewFor(hover.reference, index, (pageIndex) => document.pages[pageIndex]?.size ?? null)
  }, [hover.reference, index, registry, sdkDocumentId, targetsVersion])

  const below = hover.clientY < window.innerHeight * 0.55
  const left = Math.max(12, Math.min(hover.clientX - 40, window.innerWidth - PREVIEW_WIDTH - 36))
  const style = below
    ? { left, top: hover.clientY + 16 }
    : { left, bottom: window.innerHeight - hover.clientY + 16 }

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: Pointer tracking keeps the card open; the click target is the button.
    <div
      className="reference-preview"
      style={{ ...style, width: PREVIEW_WIDTH + 24 }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <button type="button" className="reference-preview-body" onClick={onActivate}>
        <header>
          <strong>{preview.title}</strong>
          <span>
            {preview.url ? "브라우저에서 열기" : preview.items.length ? "클릭하여 이동 · ⌘[ 돌아오기" : ""}
          </span>
        </header>
        {preview.url && (
          <p className="reference-preview-url">
            <ExternalLink size={13} aria-hidden="true" />
            {preview.url}
          </p>
        )}
        {preview.pending && (
          <p className="reference-preview-empty">
            아직 이 참조의 위치를 찾지 못했습니다. 문서 분석이 끝나면 다시 시도하세요.
          </p>
        )}
        {preview.items.map((item) => (
          <figure key={item.key}>
            <PreviewImage registry={registry} sdkDocumentId={sdkDocumentId} item={item} />
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </button>
    </div>,
    document.body,
  )
}
