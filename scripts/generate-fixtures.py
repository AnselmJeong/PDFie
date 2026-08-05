from __future__ import annotations

from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tests" / "fixtures" / "pdf" / "generated"
PAGE = (595, 842)


def write_lines(page: fitz.Page, lines: list[str], *, x: float = 64, y: float = 92, width: float = 467, size: float = 11) -> None:
    for line in lines:
        page.insert_textbox(
            fitz.Rect(x, y, x + width, y + 42),
            line,
            fontname="helv",
            fontsize=size,
            lineheight=1.25,
        )
        y += 38


def save(doc: fitz.Document, name: str) -> None:
    doc.set_metadata({"title": name.replace("-", " ").title(), "creator": "PDFie fixture generator"})
    doc.save(OUTPUT / f"{name}.pdf", garbage=4, deflate=True)
    doc.close()


def single_column() -> None:
    doc = fitz.open()
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    page.insert_text((64, 58), "Selection Fidelity in Academic PDF Readers", fontsize=19, fontname="hebo")
    write_lines(page, [
        "Abstract",
        "Accurate selection preserves punctuation, reading order, and the author's intended meaning.",
        "A reader must keep a sentence intact when it crosses a visual line boundary.",
        "Methods",
        "We compare text, page numbers, and PDF-coordinate rectangles under several zoom levels.",
        "Results",
        "The reference output remains stable after reopening the document.",
    ])
    save(doc, "single-column-en")


def two_column() -> None:
    doc = fitz.open()
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    page.insert_text((54, 55), "Two-column reading-order fixture", fontsize=18, fontname="hebo")
    left = [
        "LEFT COLUMN",
        "The left argument begins here.",
        "It continues without borrowing text",
        "from the neighboring column.",
        "A footnote marker appears here 1.",
    ]
    right = [
        "RIGHT COLUMN",
        "The right argument is independent.",
        "Selection must not jump sideways",
        "before the left column is complete.",
        "1 Footnote evidence stays local.",
    ]
    write_lines(page, left, x=54, y=105, width=220, size=10)
    write_lines(page, right, x=320, y=105, width=220, size=10)
    save(doc, "two-column-paper")


def korean() -> None:
    doc = fitz.open()
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    font_path = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
    page.insert_font(fontname="korean", fontfile=font_path)
    page.insert_text((64, 60), "학술 PDF 선택 정확도", fontsize=19, fontname="korean")
    for index, line in enumerate([
        "초록: 정확한 선택은 조사와 문장부호를 그대로 보존해야 한다.",
        "여러 줄을 선택해도 읽는 순서가 바뀌지 않아야 한다.",
        "페이지 위치와 사각형 좌표는 확대·축소 후에도 일치해야 한다.",
        "결론: 원문을 바꾸지 않는 것이 가장 중요한 기준이다.",
    ]):
        page.insert_text((64, 110 + index * 42), line, fontsize=11, fontname="korean")
    save(doc, "korean-paper")


def ligature_hyphen() -> None:
    doc = fitz.open()
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    write_lines(page, [
        "Ligature and line-break fixture",
        "The office workflow evaluates efficient affine transforms and scientific figures.",
        "A deliberately hyphen-",
        "ated word crosses the visual line boundary.",
        "Superscript-like evidence uses x2 and a footnote marker 2.",
    ])
    save(doc, "ligature-hyphen")


def rotated() -> None:
    doc = fitz.open()
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    write_lines(page, ["Rotated page fixture", "Selection rectangles should remain aligned after a ninety degree rotation."])
    page.set_rotation(90)
    save(doc, "rotated-page")


def multi_page() -> None:
    doc = fitz.open()
    for number in range(1, 4):
        page = doc.new_page(width=PAGE[0], height=PAGE[1])
        write_lines(page, [
            f"Multi-page selection · page {number}",
            f"The passage on page {number} belongs to one continuous argument.",
            "Cross-page selection must preserve a separate rectangle list for every page.",
        ])
    save(doc, "multi-page")


def scanned() -> None:
    source = fitz.open()
    page = source.new_page(width=PAGE[0], height=PAGE[1])
    write_lines(page, ["Image-only scan", "This visible sentence must not be exposed as a native text layer."])
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
    target = fitz.open()
    image_page = target.new_page(width=PAGE[0], height=PAGE[1])
    image_page.insert_image(image_page.rect, stream=pixmap.tobytes("png"))
    source.close()
    save(target, "scanned-image")


def long_book() -> None:
    doc = fitz.open()
    toc: list[list[object]] = []
    for number in range(1, 321):
        page = doc.new_page(width=PAGE[0], height=PAGE[1])
        page.insert_text((64, 58), f"Long book · page {number}", fontsize=15, fontname="hebo")
        write_lines(page, [
            "Only visible pages should retain rendered tiles in memory.",
            "This generated fixture is intentionally lightweight but structurally long.",
        ], y=110)
        if number in (1, 81, 161, 241):
            part = (number - 1) // 80 + 1
            toc.append([1, f"Part {part}", number])
            toc.append([2, f"Chapter {part * 2 - 1}", number])
        if number in (41, 121, 201, 281):
            chapter = (number - 1) // 40 + 1
            toc.append([2, f"Chapter {chapter}", number])
    doc.set_toc(toc)
    save(doc, "long-book")


def nested_bookmarks() -> None:
    doc = fitz.open()
    for number in range(1, 31):
        page = doc.new_page(width=PAGE[0], height=PAGE[1])
        write_lines(page, [f"Nested outline fixture · page {number}", "Part headings group chapters but do not own chat sessions."])
    doc.set_toc([
        [1, "Frontmatter", 1],
        [1, "Part I: Foundations", 3],
        [2, "Chapter 1: Reading", 4],
        [3, "1.1 Selection", 6],
        [2, "Chapter 2: Context", 10],
        [1, "Part II: Practice", 16],
        [2, "Chapter 3: Evidence", 17],
        [2, "Chapter 4: Review", 23],
        [1, "Notes", 28],
        [1, "Index", 30],
    ])
    save(doc, "nested-bookmarks")


def bad_bookmarks() -> None:
    doc = fitz.open()
    for number in range(1, 9):
        page = doc.new_page(width=PAGE[0], height=PAGE[1])
        write_lines(page, [f"Bad outline fixture · page {number}", "Duplicate destinations should not be accepted as semantic chapters."])
    doc.set_toc([[1, "Part I", 1], [2, "", 2], [2, "Duplicate A", 3], [2, "Duplicate B", 3]])
    save(doc, "bad-bookmarks")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for path in OUTPUT.glob("*.pdf"):
        path.unlink()
    single_column()
    two_column()
    korean()
    ligature_hyphen()
    rotated()
    multi_page()
    scanned()
    long_book()
    nested_bookmarks()
    bad_bookmarks()
    print(f"Generated {len(list(OUTPUT.glob('*.pdf')))} fixtures in {OUTPUT}")


if __name__ == "__main__":
    main()
