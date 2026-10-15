/**
 * Electrobun 1.18.x transports selected paths as one comma-delimited native
 * string and then splits it into an array. In single-selection mode every
 * array item therefore belongs to the same path, including commas that were
 * part of the original filename.
 */
export function restoreSingleSelectedPath(pathParts: readonly string[]): string | null {
  const path = pathParts.join(",")
  return path.length > 0 ? path : null
}

/** Recover the legacy comma-delimited multi-selection without guessing ambiguous paths. */
export async function restoreMultipleSelectedPaths(
  parts: readonly string[],
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  if (!parts.length || (parts.length === 1 && !parts[0])) return []
  if (parts.length > 10000) throw new Error("선택한 경로가 너무 많습니다. 폴더 단위로 나누어 추가하세요.")
  const solutions = new Map<number, string[][]>([[parts.length, [[]]]])
  for (let start = parts.length - 1; start >= 0; start--) {
    if (!parts[start]?.startsWith("/")) continue
    const options: string[][] = []
    let path = ""
    for (let end = start; end < parts.length; end++) {
      path += (end === start ? "" : ",") + parts[end]
      if (path.length > 4096) break
      if (end + 1 < parts.length && !parts[end + 1]?.startsWith("/")) continue
      const tails = solutions.get(end + 1)
      if (!tails?.length || !(await exists(path))) continue
      for (const tail of tails) options.push([path, ...tail])
      if (options.length > 1) break
    }
    if (options.length) solutions.set(start, options)
  }
  const paths = solutions.get(0)
  if (paths?.length !== 1)
    throw new Error("선택한 파일 경로를 구분하지 못했습니다. 파일을 하나씩 선택하거나 폴더로 추가하세요.")
  return [...new Set(paths[0])]
}
