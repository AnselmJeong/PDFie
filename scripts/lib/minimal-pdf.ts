/**
 * Writes small text PDFs for integration tests: Helvetica text lines and
 * optional link annotations, with a correct cross-reference table.
 */
export interface MinimalPage {
  lines: Array<{ x: number; y: number; size?: number; text: string }>
  links?: Array<{
    rect: [number, number, number, number]
    dest?: { page: number; top: number }
    uri?: string
  }>
}

const escapePdfText = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`)

export function minimalPdf(pages: MinimalPage[], size: [number, number] = [612, 792]): Uint8Array {
  const objects: string[] = []
  const add = (body: string) => {
    objects.push(body)
    return objects.length
  }
  const catalog = add("")
  const pagesRoot = add("")
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
  const pageIds = pages.map(() => add(""))
  pages.forEach((page, index) => {
    const content = page.lines
      .map(
        (line) => `BT /F1 ${line.size ?? 11} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`,
      )
      .join("\n")
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const annots = (page.links ?? []).map((link) => {
      const action = link.uri
        ? `/A << /S /URI /URI (${escapePdfText(link.uri)}) >>`
        : `/Dest [${pageIds[link.dest?.page ?? 0]} 0 R /XYZ 0 ${link.dest?.top ?? size[1]} 0]`
      return add(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.join(" ")}] /Border [0 0 0] ${action} >>`)
    })
    objects[(pageIds[index] ?? 0) - 1] =
      `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${size[0]} ${size[1]}] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R` +
      (annots.length ? ` /Annots [${annots.map((id) => `${id} 0 R`).join(" ")}]` : "") +
      " >>"
  })
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`
  objects[pagesRoot - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`

  let output = "%PDF-1.7\n"
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(output.length)
    output += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) output += `${String(offset).padStart(10, "0")} 00000 n \n`
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(output)
}
