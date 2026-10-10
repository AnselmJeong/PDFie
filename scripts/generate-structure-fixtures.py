"""Generate paper-like PDFs for section-structure regression tests.

The layouts imitate common publisher styles with reportlab's standard fonts,
whose PDFium font weight is 0, so bold must be recognized from font names:

- nature-style: unnumbered bold headings, an unlabeled bold abstract, figure
  labels, Methods after References and back-matter declarations.
- numbered-two-column: LaTeX-like numbered sections and subsections at body
  size, a table with bold header cells and numbered rows, an appendix.
- clinical-caps: ALL-CAPS headings at a larger size, italic subheadings,
  running headers and footers on every page.

Usage: python3 scripts/generate-structure-fixtures.py
"""

from pathlib import Path

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "pdf" / "structure"
SENTENCES = [
    "Brain entropy describes the diversity of neural states visited over time.",
    "We measured signal complexity with established estimators across sessions.",
    "Each participant completed two scanning visits separated by one week.",
    "The analysis controlled for head motion and physiological noise.",
    "Higher entropy was associated with broader subjective experience.",
    "These observations agree with prior reports from independent groups.",
    "Alternative explanations based on arousal alone were considered.",
    "The effect remained after correction for multiple comparisons.",
]


def text(count: int, offset: int = 0) -> str:
    return " ".join(SENTENCES[(offset + i) % len(SENTENCES)] for i in range(count))


def figure(labels: list[str]) -> Drawing:
    drawing = Drawing(240, 120)
    drawing.add(Rect(30, 20, 200, 90, fillColor=None, strokeWidth=0.5))
    for index, label in enumerate(labels):
        drawing.add(String(40 + index * 95, 95, label, fontName="Helvetica-Bold", fontSize=10))
    drawing.add(Line(40, 30, 220, 80, strokeWidth=1))
    drawing.add(String(100, 5, "Time after dosing (min)", fontName="Helvetica", fontSize=7))
    drawing.add(String(2, 60, "LZc", fontName="Helvetica", fontSize=7))
    return drawing


def nature_style() -> None:
    body = ParagraphStyle("body", fontName="Times-Roman", fontSize=9.5, leading=12, spaceAfter=6)
    heading = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=11.5, leading=14, spaceBefore=8, spaceAfter=4)
    sub = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=9.5, leading=12, spaceBefore=4, spaceAfter=2)
    caption = ParagraphStyle("caption", fontName="Helvetica", fontSize=7.5, leading=9, spaceAfter=8)
    reference = ParagraphStyle("ref", fontName="Times-Roman", fontSize=7.5, leading=9, spaceAfter=2)
    title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=20, leading=24, spaceAfter=8)
    byline = ParagraphStyle("byline", fontName="Helvetica", fontSize=9, leading=11, spaceAfter=10)
    standfirst = ParagraphStyle("abstract", fontName="Times-Bold", fontSize=9.5, leading=12, spaceAfter=10)

    def furniture(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.drawString(54, 760, "Nature Neuroscience | Volume 29 | 2026")
        canvas.drawRightString(558, 30, f"{document.page}")
        canvas.restoreState()

    document = BaseDocTemplate(str(OUTPUT / "nature-style.pdf"), pagesize=letter, title="Nature style")
    document.addPageTemplates(
        [PageTemplate(id="page", frames=[Frame(54, 54, 504, 690)], onPage=furniture)]
    )
    story = [
        Paragraph("Article", byline),
        Paragraph("Psychedelics broaden the repertoire of brain states", title),
        Paragraph("Robin Researcher<super>1,2</super>, Kim Analyst<super>2</super> &amp; Lee Author<super>1</super>", byline),
        Paragraph(text(5), standfirst),
        Paragraph("Introduction", heading),
        Paragraph(text(9), body),
        Paragraph(text(7, 3), body),
        Paragraph("Results", heading),
        Paragraph("Entropy increases under psilocybin", sub),
        Paragraph(text(8, 1), body),
        figure(["Placebo", "Psilocybin"]),
        Paragraph("Fig. 1 | Signal complexity across conditions. Lempel–Ziv complexity rose after dosing.", caption),
        Paragraph("Subjective reports track entropy", sub),
        Paragraph(text(9, 2), body),
        Paragraph("Discussion", heading),
        Paragraph(text(10, 4), body),
        Paragraph(text(6, 5), body),
        Paragraph("References", heading),
    ]
    story += [
        Paragraph(f"{n}. Author, A. et al. A study of entropy in the brain. J. Neurosci. {2000 + n} (2019).", reference)
        for n in range(1, 13)
    ]
    story += [
        Paragraph("Methods", heading),
        Paragraph("Participants", sub),
        Paragraph(text(6, 6), body),
        Paragraph("Statistical analysis", sub),
        Paragraph(text(6, 7), body),
        Paragraph("Data availability", heading),
        Paragraph(text(2), body),
        Paragraph("Acknowledgements", heading),
        Paragraph(text(2, 1), body),
        Paragraph("Author contributions", heading),
        Paragraph(text(2, 2), body),
        Paragraph("Competing interests", heading),
        Paragraph("The authors declare no competing interests.", body),
    ]
    document.build(story)


def numbered_two_column() -> None:
    body = ParagraphStyle("body", fontName="Times-Roman", fontSize=10, leading=12, spaceAfter=5)
    section = ParagraphStyle("h1", fontName="Times-Bold", fontSize=12, leading=14, spaceBefore=8, spaceAfter=4)
    subsection = ParagraphStyle("h2", fontName="Times-Bold", fontSize=10, leading=12, spaceBefore=6, spaceAfter=3)
    title = ParagraphStyle("title", fontName="Times-Bold", fontSize=17, leading=20, alignment=1, spaceAfter=6)
    byline = ParagraphStyle("byline", fontName="Times-Roman", fontSize=10, leading=12, alignment=1, spaceAfter=4)
    label = ParagraphStyle("label", fontName="Times-Bold", fontSize=10, leading=12, alignment=1, spaceAfter=2)
    reference = ParagraphStyle("ref", fontName="Times-Roman", fontSize=8.5, leading=10, spaceAfter=2)
    caption = ParagraphStyle("caption", fontName="Times-Roman", fontSize=9, leading=11, spaceAfter=6)

    document = BaseDocTemplate(str(OUTPUT / "numbered-two-column.pdf"), pagesize=letter, title="Numbered")
    first = [Frame(54, 600, 504, 140), Frame(54, 54, 246, 540), Frame(312, 54, 246, 540)]
    columns = [Frame(54, 54, 246, 690), Frame(312, 54, 246, 690)]
    document.addPageTemplates(
        [
            PageTemplate(id="first", frames=first, autoNextPageTemplate="rest"),
            PageTemplate(id="rest", frames=columns),
        ]
    )
    table = Table(
        [["Model", "BLEU", "Params"], ["1 Baseline", "24.1", "60M"], ["2 Attention", "28.4", "65M"], ["3 Ours", "29.0", "64M"]],
        colWidths=[90, 60, 60],
    )
    table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, 0), "Times-Bold", 10),
                ("FONT", (0, 1), (-1, -1), "Times-Roman", 9),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, "black"),
            ]
        )
    )
    story = [
        Paragraph("Attention-Based Estimation of Neural Entropy", title),
        Paragraph("Robin Researcher and Kim Analyst", byline),
        Paragraph("Department of Computing, Example University", byline),
        FrameBreak(),
        Paragraph("Abstract", label),
        Paragraph(text(5), body),
        Paragraph("1 Introduction", section),
        Paragraph(text(8), body),
        Paragraph("2 Related Work", section),
        Paragraph("2.1 Entropy estimators", subsection),
        Paragraph(text(6, 1), body),
        Paragraph("2.2 Attention models", subsection),
        Paragraph(text(6, 2), body),
        Paragraph("3 Method", section),
        Paragraph(text(7, 3), body),
        Paragraph("3.1 Architecture", subsection),
        Paragraph(text(7, 4), body),
        Paragraph("4 Experiments", section),
        Paragraph(text(5, 5), body),
        table,
        Paragraph("Table 1: Comparison with prior models on the benchmark.", caption),
        Paragraph("4.1 Results", subsection),
        Paragraph(text(8, 6), body),
        Paragraph("5 Conclusion", section),
        Paragraph(text(5, 7), body),
        Paragraph("References", section),
    ]
    story += [
        Paragraph(f"[{n}] A. Author and B. Writer. Estimating entropy. In Proc. Conference, {2010 + n}.", reference)
        for n in range(1, 11)
    ]
    story += [Paragraph("A Proofs", section), Paragraph(text(6), body)]
    document.build(story)


def clinical_caps() -> None:
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=11.5, spaceAfter=6)
    heading = ParagraphStyle("h1", fontName="Helvetica", fontSize=11, leading=14, spaceBefore=8, spaceAfter=4)
    sub = ParagraphStyle("h2", fontName="Helvetica-Oblique", fontSize=9, leading=11.5, spaceBefore=4, spaceAfter=2)
    title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=16, leading=20, spaceAfter=8)
    byline = ParagraphStyle("byline", fontName="Helvetica", fontSize=8.5, leading=11, spaceAfter=10)
    reference = ParagraphStyle("ref", fontName="Helvetica", fontSize=7.5, leading=9, spaceAfter=2)

    def furniture(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(54, 762, "JOURNAL OF CLINICAL STUDIES")
        canvas.setFont("Helvetica", 7)
        canvas.drawString(54, 28, f"Researcher et al. Clinical entropy trial. Page {document.page} of 3")
        canvas.restoreState()

    document = BaseDocTemplate(str(OUTPUT / "clinical-caps.pdf"), pagesize=letter, title="Clinical")
    document.addPageTemplates([PageTemplate(id="page", frames=[Frame(54, 54, 504, 690)], onPage=furniture)])
    story = [
        Paragraph("A randomized trial of entropy-guided therapy", title),
        Paragraph("Robin Researcher, MD; Kim Analyst, PhD; Lee Author, MSc", byline),
        Paragraph("ABSTRACT", heading),
        Paragraph(text(5), body),
        Paragraph("INTRODUCTION", heading),
        Paragraph(text(10, 1), body),
        Paragraph("MATERIALS AND METHODS", heading),
        Paragraph("Participants", sub),
        Paragraph(text(8, 2), body),
        Paragraph("Statistical analysis", sub),
        Paragraph(text(8, 3), body),
        Paragraph("RESULTS", heading),
        Paragraph(text(12, 4), body),
        Paragraph(text(9, 5), body),
        Paragraph("DISCUSSION", heading),
        Paragraph(text(12, 6), body),
        Paragraph("Limitations", sub),
        Paragraph(text(5, 7), body),
        Paragraph("CONCLUSIONS", heading),
        Paragraph(text(4), body),
        Paragraph("CONFLICTS OF INTEREST", heading),
        Paragraph("None declared.", body),
        Paragraph("REFERENCES", heading),
    ]
    story += [
        Paragraph(f"{n}. Author A, Writer B. Entropy in clinical populations. Lancet. {1990 + n};12:1-9.", reference)
        for n in range(1, 16)
    ]
    document.build(story)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    nature_style()
    numbered_two_column()
    clinical_caps()
    print(f"Generated {len(list(OUTPUT.glob('*.pdf')))} fixtures in {OUTPUT}")


if __name__ == "__main__":
    main()
