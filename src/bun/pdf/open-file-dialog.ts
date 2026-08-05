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
