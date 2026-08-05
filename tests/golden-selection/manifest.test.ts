import { readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

interface GoldenCase {
  fixture: string
  caseId: string
  expectedText: string
  expectedPages: number[]
  notes: string
}

const casesDirectory = dirname(fileURLToPath(import.meta.url))
const fixturesDirectory = join(casesDirectory, "..", "fixtures", "pdf", "generated")
const cases = JSON.parse(await readFile(join(casesDirectory, "cases.json"), "utf8")) as GoldenCase[]

describe("selection golden corpus", () => {
  it("contains at least 20 uniquely identified cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20)
    expect(new Set(cases.map((testCase) => testCase.caseId)).size).toBe(cases.length)
  })

  it.each(cases)("has a committed PDF fixture for $caseId", async (testCase) => {
    expect(basename(testCase.fixture)).toBe(testCase.fixture)
    expect(testCase.expectedPages.every((page) => Number.isInteger(page) && page > 0)).toBe(true)
    expect(testCase.notes.trim().length).toBeGreaterThan(0)

    const bytes = await readFile(join(fixturesDirectory, testCase.fixture))
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
  })
})
