import argparse
import datetime as dt
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

LANG_PREFIX_RE = re.compile(
    r"^(Angielski|Niemiecki|Francuski|Hiszpański|Rosyjski|Ukraiński)\s*:\s*",
    re.IGNORECASE,
)

JOINED_BOUNDARY_KEYWORDS = [
    "Yes", "No", "I try to", "If ", "Are ", "Do ", "Have ", "What ", "When ", "How ",
    "More than", "Less than", "Vitamin", "Omega", "Iron", "Magnesium", "Biotin", "Collagen",
    "B vitamins", "I do not", "Vegan diet", "I include", "I avoid", "I consume",
    "Cancer", "Heart", "Cardiovascular", "Blood", "Lung", "Gastrointestinal", "Liver",
    "Urinary", "Metabolic", "Thyroid", "Hormonal", "Nervous", "Eye", "None",
]

LEGAL_START_MARKERS = (
    "## Klauzula informacyjna RODO",
    "KLAUZULA INFORMACYJNA",
    "ZGODA NA ZABIEG",
)


def register_fonts() -> tuple[str, str]:
    candidates = [
        (r"C:\\Windows\\Fonts\\arial.ttf", r"C:\\Windows\\Fonts\\arialbd.ttf", "ArialCustom", "ArialCustom-Bold"),
        (r"C:\\Windows\\Fonts\\calibri.ttf", r"C:\\Windows\\Fonts\\calibrib.ttf", "CalibriCustom", "CalibriCustom-Bold"),
    ]

    for regular, bold, reg_name, bold_name in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont(reg_name, regular))
            pdfmetrics.registerFont(TTFont(bold_name, bold))
            return reg_name, bold_name

    return "Helvetica", "Helvetica-Bold"


def build_styles(font_regular: str, font_bold: str):
    styles = getSampleStyleSheet()

    styles.add(
        ParagraphStyle(
            name="DocTitle",
            parent=styles["Title"],
            fontName=font_bold,
            fontSize=21,
            leading=26,
            textColor=colors.HexColor("#102A43"),
            alignment=TA_CENTER,
            spaceAfter=8,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=9,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#486581"),
            spaceAfter=8,
        )
    )

    styles.add(
        ParagraphStyle(
            name="SectionHeader",
            parent=styles["Heading2"],
            fontName=font_bold,
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#0B7285"),
            spaceBefore=10,
            spaceAfter=4,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Question",
            parent=styles["Normal"],
            fontName=font_bold,
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#243B53"),
            spaceBefore=5,
            spaceAfter=2,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Option",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=9.5,
            leading=13,
            leftIndent=10,
            textColor=colors.HexColor("#334E68"),
            spaceAfter=1,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName=font_regular,
            fontSize=9.5,
            leading=14,
            alignment=TA_JUSTIFY,
            textColor=colors.HexColor("#102A43"),
            spaceAfter=4,
        )
    )

    styles.add(
        ParagraphStyle(
            name="SmallNote",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#627D98"),
            spaceBefore=8,
        )
    )

    return styles


def looks_like_question(line: str) -> bool:
    question_starts = (
        "Czy ", "Are ", "Do ", "Have ", "What ", "When ", "If ", "Jak ", "Prosz", "Please ",
        "Gdzie ", "Komu ", "Jakie ", "Can ", "Would ", "Is ", "Was ", "Will ", "Czyli ",
    )
    return line.endswith("?") or line.startswith(question_starts)


def looks_like_option(line: str) -> bool:
    if len(line) > 90:
        return False
    if line.endswith("?"):
        return False
    if re.match(r"^\d+[\.)]\s", line):
        return False
    compact_words = len(line.split()) <= 9
    has_no_terminal_punct = not re.search(r"[\.!:]$", line)
    return compact_words and has_no_terminal_punct


def escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def prettify_filename_title(filename: str) -> str:
    title = filename.replace("__", " / ").replace("_", " ")
    title = re.sub(r"\s{2,}", " ", title).strip()
    return title


def derive_title(lines: list[str], filename: str) -> str:
    for raw in lines:
        line = raw.lstrip("\ufeff").strip()
        line = re.sub(r"^\s*[-*]\s+", "", line)
        if line.startswith("#"):
            line = re.sub(r"^#+\s*", "", line).strip()
            line = LANG_PREFIX_RE.sub("", line)
            line = re.sub(r"\bKarta Zabiegowa\b", "Karta Klienta", line, flags=re.IGNORECASE)
            return line
    return prettify_filename_title(filename)


def split_joined_chunks(line: str) -> list[str]:
    current = line
    current = current.replace("NoI try to", "No\nI try to")
    current = current.replace("NieStaram się", "Nie\nStaram się")
    current = current.replace("Eye creamSPF 50 sunscreen", "Eye cream\nSPF 50 sunscreen")
    current = current.replace("Vitamin EB vitamins", "Vitamin E\nB vitamins")
    current = current.replace("CollagenI do not take any supplements", "Collagen\nI do not take any supplements")
    current = current.replace(
        "In about three monthsI don’t have a specific timeframe",
        "In about three months\nI don’t have a specific timeframe",
    )
    current = current.replace("Witamina AWitaminy z grupy B", "Witamina A\nWitaminy z grupy B")
    current = current.replace("Witamina CWitamina D", "Witamina C\nWitamina D")
    current = current.replace("Witamina EMultiwitaminy", "Witamina E\nMultiwitaminy")
    current = current.replace("Witaminy z grupy BWitamina C", "Witaminy z grupy B\nWitamina C")
    current = current.replace("Witamina DWitamina E", "Witamina D\nWitamina E")
    current = current.replace("Multiwitaminy", "Multiwitaminy")
    current = current.replace("Omega 3Probiotyki", "Omega 3\nProbiotyki")
    current = current.replace("01234>4Nie dotyczy", "0\n1\n2\n3\n4\n>4\nNie dotyczy")
    current = current.replace(
        "Co drugi dzień3x w tygodniu2x w tygodniu1x w tygodniu1x na 10 dni1x na dwa tygodnie",
        "Co drugi dzień\n3x w tygodniu\n2x w tygodniu\n1x w tygodniu\n1x na 10 dni\n1x na dwa tygodnie",
    )
    current = current.replace(
        "Mniej niż 0,5 litra0,5–1 litr1–1,5 litra1,5–2 litry",
        "Mniej niż 0,5 litra\n0,5–1 litr\n1–1,5 litra\n1,5–2 litry",
    )

    # Split common Polish glued medical list chunks.
    current = re.sub(
        r"(?<=[a-ząćęłńóśźż])(?=(choroby|zaburzenia|brak|nie dotyczy|probiotyki|witaminy))",
        "\n",
        current,
        flags=re.IGNORECASE,
    )

    for kw in JOINED_BOUNDARY_KEYWORDS:
        pattern = rf"(?<=[^\s])(?={re.escape(kw)})"
        current = re.sub(pattern, "\n", current)

    current = re.sub(r"(?<=[A-Za-z])(?=\d)", "\n", current)
    current = re.sub(r"(?<=\d)(?=[A-Za-z])", "\n", current)
    current = re.sub(r"\n{2,}", "\n", current)
    return [part.strip() for part in current.split("\n") if part.strip()]


def normalize_lines(md_text: str) -> list[str]:
    md_text = md_text.lstrip("\ufeff")
    lines = [ln.strip() for ln in md_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    lines = [ln for ln in lines if ln]

    normalized: list[str] = []
    for line in lines:
        if re.match(r"(?i)^zweryfikuj zawarto[śs]ć karty zabiegowej dla zabiegu", line):
            continue

        line = re.sub(r"^\s*[-*]\s+", "", line)
        line = re.sub(r"^\[\s*\]\s*", "", line)
        line = re.sub(r"^\d+\.\s*$", "", line)
        line = re.sub(r"^\d+\.\s+", "", line)
        line = re.sub(r"\s{2,}", " ", line).strip()
        if not line:
            continue

        normalized.extend(split_joined_chunks(line))

    fixed: list[str] = []
    in_water_block = False
    prev = ""
    for line in normalized:
        if line == "How much water do you drink daily?":
            in_water_block = True
        elif in_water_block and line.endswith("?"):
            in_water_block = False

        if in_water_block and line == "Less than 2.5 liters":
            line = "Less than 1 liter"
        if line == prev:
            continue
        fixed.append(line)
        prev = line

    return fixed


def build_story(md_text: str, filename: str, styles):
    lines = normalize_lines(md_text)

    story = []
    title = derive_title(lines, filename)
    lines = [ln for ln in lines if not re.match(r"^#+\s*", ln)]

    story.append(Paragraph(escape_html(title), styles["DocTitle"]))
    story.append(Paragraph(escape_html("Dokument klienta | SimpliSalon Cloud"), styles["Meta"]))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#BCCCDC"), spaceBefore=1, spaceAfter=8))

    in_legal_section = False
    for line in lines:
        if line.startswith(LEGAL_START_MARKERS):
            in_legal_section = True

        line = re.sub(r"^\[\s*\]\s*\[\s*\]\s*", "", line).strip()
        line = re.sub(r"\[\s*\]\s*\|\s*\[\s*\]", "", line).strip()
        line = re.sub(r"^\[\s*\]\s*", "", line).strip()

        if not in_legal_section:
            if re.match(r"(?i)^tak\s+nie$", line):
                line = "[ ] Tak    [ ] Nie"
            elif re.match(r"(?i)^yes\s+no$", line):
                line = "[ ] Yes    [ ] No"
            else:
                line = line.replace("Tak    Nie", "[ ] Tak    [ ] Nie")
                line = line.replace("Yes    No", "[ ] Yes    [ ] No")

        if line.startswith("## "):
            story.append(Paragraph(escape_html(line[3:].strip()), styles["SectionHeader"]))
        elif line.isupper() and len(line) > 8:
            story.append(Paragraph(escape_html(line.title()), styles["SectionHeader"]))
        elif looks_like_question(line):
            story.append(Paragraph(escape_html(line), styles["Question"]))
        elif (not in_legal_section) and looks_like_option(line):
            if line.startswith("[ ]"):
                story.append(Paragraph(escape_html(line), styles["Option"]))
            else:
                story.append(Paragraph(escape_html("[ ] " + line), styles["Option"]))
        else:
            story.append(Paragraph(escape_html(line), styles["Body"]))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Wygenerowano automatycznie na podstawie pliku markdown.", styles["SmallNote"]))
    return story


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#9FB3C8"))

    now = dt.datetime.now().strftime("%Y-%m-%d")
    footer_left = f"SimpliSalon Cloud | {now}"
    footer_right = f"str. {doc.page}"

    canvas.drawString(15 * mm, 10 * mm, footer_left)
    canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, footer_right)
    canvas.restoreState()


def convert_file(input_path: Path, output_path: Path, styles):
    text = input_path.read_text(encoding="utf-8", errors="replace")
    story = build_story(text, input_path.stem, styles)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=17 * mm,
        bottomMargin=17 * mm,
        title=input_path.stem,
        author="SimpliSalon Cloud",
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)


def analyze_file_for_logic_issues(input_path: Path) -> list[str]:
    text = input_path.read_text(encoding="utf-8", errors="replace")
    raw_lines = [ln.strip() for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if ln.strip()]
    normalized = normalize_lines(text)
    issues: list[str] = []

    orphan_numbers = [ln for ln in raw_lines if re.match(r"^\d+\.\s*$", ln)]
    if orphan_numbers:
        issues.append(f"orphan numbering markers: {', '.join(orphan_numbers[:3])}")

    merged_raw = [ln for ln in raw_lines if re.search(r"[A-Za-z]\d|\d[A-Za-z]|[a-z][A-Z]", ln)]
    if merged_raw:
        issues.append("joined tokens detected (likely formatting merge in options/questions)")

    if "How much water do you drink daily?" in normalized and "Less than 2.5 liters" in normalized:
        issues.append("overlapping water intake range fixed: 'Less than 2.5 liters' -> 'Less than 1 liter'")

    return issues


def main():
    parser = argparse.ArgumentParser(description="Convert client markdown forms to styled PDFs.")
    parser.add_argument("--input-dir", default="do_wysylki_klientom")
    parser.add_argument("--output-dir", default="pdfy_klienckie")
    args = parser.parse_args()

    in_dir = Path(args.input_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    font_regular, font_bold = register_fonts()
    styles = build_styles(font_regular, font_bold)

    files = sorted(in_dir.glob("*.md"))
    if not files:
        raise SystemExit(f"No .md files found in {in_dir}")

    report_lines: list[str] = ["# Raport Logiki Kart", ""]
    files_with_issues = 0

    for file_path in files:
        out_file = out_dir / f"{file_path.stem}.pdf"
        convert_file(file_path, out_file, styles)

        issues = analyze_file_for_logic_issues(file_path)
        if issues:
            files_with_issues += 1
            report_lines.append(f"## {file_path.name}")
            for issue in issues:
                report_lines.append(f"- {issue}")
            report_lines.append("")

    report_path = out_dir / "_raport_logiki_kart.md"
    report_path.write_text("\n".join(report_lines).strip() + "\n", encoding="utf-8")

    print(f"Generated {len(files)} PDFs in: {out_dir.resolve()}")
    print(f"Logic analysis report: {report_path.resolve()} (files with issues: {files_with_issues})")


if __name__ == "__main__":
    main()
