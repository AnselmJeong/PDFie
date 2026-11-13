import { describe, expect, it, vi } from "vitest"
import { OpenRequests, pdfPathFromOpenUrl } from "../../src/bun/pdf/open-requests"

describe("macOS open requests", () => {
  it("reads the real path of a PDF from a file URL", () => {
    expect(pdfPathFromOpenUrl("file:///Users/me/Papers/breakspear2017.pdf")).toBe(
      "/Users/me/Papers/breakspear2017.pdf",
    )
    expect(pdfPathFromOpenUrl("file:///Users/me/%EB%85%BC%EB%AC%B8%20%EB%AA%A8%EC%9D%8C/Paper.PDF")).toBe(
      "/Users/me/논문 모음/Paper.PDF",
    )
    expect(pdfPathFromOpenUrl("file://localhost/Volumes/Drive/a.pdf")).toBe("/Volumes/Drive/a.pdf")
  })

  it("ignores anything that is not a local PDF", () => {
    expect(pdfPathFromOpenUrl("file:///Users/me/notes.txt")).toBeNull()
    expect(pdfPathFromOpenUrl("https://example.com/a.pdf")).toBeNull()
    expect(pdfPathFromOpenUrl("file://server/share/a.pdf")).toBeNull()
    expect(pdfPathFromOpenUrl("pdfie://open?file=a.pdf")).toBeNull()
    expect(pdfPathFromOpenUrl("not a url")).toBeNull()
    expect(pdfPathFromOpenUrl("file:///Users/me/%E0%A4%A.pdf")).toBeNull()
  })

  it("holds requests that arrive before the window and hands each over once", () => {
    const requests = new OpenRequests()
    expect(requests.add("file:///a.pdf")).toBe(true)
    expect(requests.add("file:///notes.txt")).toBe(false)
    requests.add("file:///b.pdf")
    requests.add("file:///a.pdf")

    const listener = vi.fn()
    requests.onAdded(listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(requests.take()).toEqual(["/b.pdf", "/a.pdf"])
    expect(requests.take()).toEqual([])

    requests.add("file:///c.pdf")
    expect(listener).toHaveBeenCalledTimes(2)
    expect(requests.take()).toEqual(["/c.pdf"])
  })
})
