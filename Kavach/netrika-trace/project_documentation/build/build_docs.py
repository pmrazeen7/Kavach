"""Builds PROJECT_DOCUMENTATION.md / .docx / .pdf from parts/*.md.

Run:  python build/build_docs.py     (from project_documentation/)
Requires: python-docx, reportlab, Pillow.
"""
from __future__ import annotations

import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from mermaid_render import render  # noqa: E402

TITLE = "Kavach (Netrika-Trace)"
SUBTITLE = "Autonomous Agentic Shadow-AI Gateway"
DOC_KIND = "Project Documentation, Implementation Guide and Viva Preparation"
DATE = "29 October 2026"
FOOTER = "Kavach (Netrika-Trace) - Project Documentation"

PARTS_DIR = os.path.join(ROOT, "parts")
OUT_DIR = ROOT
OUT_NAME = "PROJECT_DOCUMENTATION"
LANDSCAPE = False
DIAG_DIR = os.path.join(HERE, "diagrams")
COVER_BLURB = "Architecture, feature-by-feature implementation, database and API reference, testing and limitations, viva and interview question bank, and presentation scripts."
COVER_NOTES = [f"Prepared from a review of the project source code, {DATE}.", "Companion files: IMPLEMENTATION_MAP.md, VERIFICATION_NOTES.md.", "Status tags: Implemented, Partial, Mocked, Defined (not wired), Unverified."]
MD_NOTE = "> Status tags used in this document: **[Implemented]**, **[Partial]**, **[Mocked]**, **[Defined, not wired]**, **[Unverified]**. See section 1.1.\n> Companion files: `IMPLEMENTATION_MAP.md`, `VERIFICATION_NOTES.md`."


# ------------------------------------------------------------------ parse
def load_parts() -> str:
    files = sorted(glob.glob(os.path.join(PARTS_DIR, "*.md")))
    chunks = [open(f, encoding="utf-8").read().strip("\n") for f in files]
    return "\n\n".join(chunks) + "\n"


def normalise(md: str) -> str:
    """Make every text line its own paragraph (blank line between consecutive prose lines)."""
    out, in_code = [], False
    prev_kind = None
    for line in md.split("\n"):
        if line.startswith("```"):
            in_code = not in_code
            out.append(line)
            prev_kind = "code"
            continue
        if in_code:
            out.append(line)
            continue
        s = line.strip()
        if not s:
            out.append("")
            prev_kind = None
            continue
        kind = ("table" if s.startswith("|") else "list" if re.match(r"^([*-]|\d+\.)\s", s) else
                "head" if s.startswith("#") else "rule" if s == "---" else "text")
        if kind == "text" and prev_kind == "text":
            out.append("")
        out.append(line)
        prev_kind = kind
    return "\n".join(out)


def blocks(md: str):
    lines = md.split("\n")
    i, n = 0, len(lines)
    para: list[str] = []

    def flush():
        nonlocal para
        if para:
            yield ("p", " ".join(x.strip() for x in para))
            para = []

    while i < n:
        line = lines[i]
        s = line.strip()
        if line.startswith("```"):
            yield from flush()
            lang = line[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            yield ("mermaid" if lang == "mermaid" else "code", "\n".join(buf))
            continue
        if not s:
            yield from flush()
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            yield from flush()
            yield ("h", len(m.group(1)), re.sub(r"[`*]", "", m.group(2)).strip())
            i += 1
            continue
        if s == "---":
            yield from flush()
            yield ("rule",)
            i += 1
            continue
        if s.startswith("|"):
            yield from flush()
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            cells = []
            for r in rows:
                parts = [c.strip() for c in re.split(r"(?<!\\)\|", r.strip().strip("|"))]
                cells.append([c.replace("\\|", "|") for c in parts])
            cells = [r for r in cells if not all(re.match(r"^:?-{2,}:?$", c) for c in r)]
            yield ("table", cells)
            continue
        mi = re.match(r"^!\[(.*)\]\((.*)\)$", s)
        if mi:
            yield from flush()
            yield ("img", mi.group(2), mi.group(1))
            i += 1
            continue
        m = re.match(r"^(\*|-|\d+\.)\s+(.*)$", s)
        if m:
            yield from flush()
            ordered = m.group(1)[0].isdigit()
            yield ("li", ordered, m.group(1) if ordered else "", m.group(2))
            i += 1
            continue
        para.append(line)
        i += 1
    yield from flush()


INLINE = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)")


def inline_tokens(text: str):
    """Yield (kind, text) where kind in plain|bold|code|italic."""
    pos = 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            yield ("plain", text[pos:m.start()])
        t = m.group(0)
        if t.startswith("**"):
            yield ("bold", t[2:-2])
        elif t.startswith("`"):
            yield ("code", t[1:-1])
        else:
            yield ("italic", t[1:-1])
        pos = m.end()
    if pos < len(text):
        yield ("plain", text[pos:])


# ------------------------------------------------------------------ diagrams
def render_diagrams(items):
    os.makedirs(DIAG_DIR, exist_ok=True)
    paths = {}
    k = 0
    for it in items:
        if it[0] == "mermaid":
            k += 1
            p = os.path.join(DIAG_DIR, f"diagram_{k:02d}.png")
            w, h = render(it[1], p)
            paths[id(it)] = (p, w, h)
    return paths


# ------------------------------------------------------------------ markdown output
def toc_entries(items):
    out = []
    for it in items:
        if it[0] == "h" and it[1] in (1, 2):
            out.append((it[1], it[2]))
    return out


def anchor(text: str) -> str:
    a = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"\s+", "-", a)


def write_markdown(md_body: str, items):
    toc = ["# Table of Contents", ""]
    for lvl, t in toc_entries(items):
        toc.append(("" if lvl == 1 else "    ") + f"- [{t}](#{anchor(t)})")
    cover = f"""# {TITLE}

## {SUBTITLE}

**{DOC_KIND}**

Prepared {DATE}.

{MD_NOTE}

---

"""
    path = os.path.join(OUT_DIR, OUT_NAME + ".md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(cover + "\n".join(toc) + "\n\n---\n\n" + md_body)
    return path


# ------------------------------------------------------------------ docx
def build_docx(items, diag):
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt, RGBColor

    doc = Document()
    sec = doc.sections[0]
    pw, ph = (29.7, 21.0) if LANDSCAPE else (21.0, 29.7)
    from docx.enum.section import WD_ORIENT
    if LANDSCAPE:
        sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = Cm(pw), Cm(ph)
    CONTENT_W, CONTENT_H = pw - 4.4, ph - 4.4
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin, sec.bottom_margin = Cm(2.2), Cm(2.2)
    sec.different_first_page_header_footer = True

    INDIGO = RGBColor(0x31, 0x2E, 0x81)
    st = doc.styles
    st["Normal"].font.name = "Calibri"
    st["Normal"].font.size = Pt(10.5)
    st["Normal"]._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    st["Normal"].paragraph_format.space_after = Pt(6)
    st["Normal"].paragraph_format.line_spacing = 1.12
    for name, size, before, after in (("Heading 1", 22, 0, 10), ("Heading 2", 15, 14, 6), ("Heading 3", 12, 10, 4), ("Heading 4", 11, 8, 3)):
        h = st[name]
        h.font.name = "Calibri"
        h.font.size = Pt(size)
        h.font.bold = True
        h.font.color.rgb = INDIGO if name != "Heading 4" else RGBColor(0x37, 0x41, 0x51)
        h._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
        h.paragraph_format.space_before = Pt(before)
        h.paragraph_format.space_after = Pt(after)
        h.paragraph_format.keep_with_next = True

    def shade(el, fill):
        pr = el.get_or_add_tcPr() if hasattr(el, "get_or_add_tcPr") else el
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), fill)
        pr.append(shd)

    def add_runs(p, text, size=None, bold_all=False, color=None):
        for kind, t in inline_tokens(text):
            r = p.add_run(t)
            if size:
                r.font.size = Pt(size)
            if kind == "bold" or bold_all:
                r.bold = True
            if kind == "italic":
                r.italic = True
            if kind == "code":
                r.font.name = "Consolas"
                r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
                r.font.size = Pt((size or 10.5) - 1)
                r.font.color.rgb = RGBColor(0x9D, 0x17, 0x4D)
            if color is not None and kind != "code":
                r.font.color.rgb = color

    def field(p, instr):
        r = p.add_run()
        for typ, txt in (("begin", None), (None, instr), ("separate", None), ("text", "1"), ("end", None)):
            if typ in ("begin", "separate", "end"):
                fc = OxmlElement("w:fldChar")
                fc.set(qn("w:fldCharType"), typ)
                r._r.append(fc)
            elif typ is None:
                it = OxmlElement("w:instrText")
                it.set(qn("xml:space"), "preserve")
                it.text = txt
                r._r.append(it)
            else:
                t = OxmlElement("w:t")
                t.text = txt
                r._r.append(t)

    # footer with page numbers
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rr = fp.add_run(FOOTER + "   |   Page ")
    rr.font.size = Pt(8.5)
    rr.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    field(fp, "PAGE")
    for r in fp.runs:
        r.font.size = Pt(8.5)

    # ---- cover
    for _ in range(5):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(TITLE)
    r.font.size = Pt(34)
    r.bold = True
    r.font.color.rgb = INDIGO
    p = doc.add_paragraph()
    r = p.add_run(SUBTITLE)
    r.font.size = Pt(18)
    r.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)
    doc.add_paragraph()
    p = doc.add_paragraph()
    r = p.add_run(DOC_KIND)
    r.font.size = Pt(13)
    r.bold = True
    p = doc.add_paragraph()
    r = p.add_run(COVER_BLURB)
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(0x37, 0x41, 0x51)
    for _ in range(6):
        doc.add_paragraph()
    for line in COVER_NOTES:
        p = doc.add_paragraph()
        r = p.add_run(line)
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    doc.add_page_break()

    # ---- table of contents: a real TOC field with cached entries (Word updates page numbers on open)
    h = doc.add_paragraph()
    r = h.add_run("Table of Contents")
    r.font.size = Pt(22)
    r.bold = True
    r.font.color.rgb = INDIGO
    entries = toc_entries(items)
    first = True
    for idx, (lvl, text) in enumerate(entries):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0 if lvl == 1 else 0.8)
        p.paragraph_format.space_after = Pt(2 if lvl == 2 else 4)
        if first:
            r0 = p.add_run()
            fc = OxmlElement("w:fldChar"); fc.set(qn("w:fldCharType"), "begin"); r0._r.append(fc)
            it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = ' TOC \\o "1-2" \\h \\z \\u '; r0._r.append(it)
            fc2 = OxmlElement("w:fldChar"); fc2.set(qn("w:fldCharType"), "separate"); r0._r.append(fc2)
            first = False
        rr = p.add_run(text)
        rr.bold = lvl == 1
        rr.font.size = Pt(11 if lvl == 1 else 10)
        if idx == len(entries) - 1:
            r1 = p.add_run()
            fc3 = OxmlElement("w:fldChar"); fc3.set(qn("w:fldCharType"), "end"); r1._r.append(fc3)
    note = doc.add_paragraph()
    nr = note.add_run("In Word, press Ctrl+A then F9 (or accept the update prompt) to fill in page numbers.")
    nr.italic = True
    nr.font.size = Pt(8.5)
    nr.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    # ask Word to refresh fields when the file opens
    settings = doc.settings.element
    uf = OxmlElement("w:updateFields")
    uf.set(qn("w:val"), "true")
    settings.append(uf)
    doc.add_page_break()

    # ---- body
    first_h1 = True
    for it in items:
        kind = it[0]
        if kind == "h":
            lvl, text = it[1], it[2]
            if lvl == 1:
                if not first_h1:
                    doc.add_page_break()
                first_h1 = False
            doc.add_heading(text, level=min(lvl, 4))
        elif kind == "p":
            p = doc.add_paragraph()
            add_runs(p, it[1])
        elif kind == "li":
            style = "List Number" if it[1] else "List Bullet"
            p = doc.add_paragraph(style=style)
            p.paragraph_format.space_after = Pt(3)
            add_runs(p, it[3])
        elif kind == "code":
            t = doc.add_table(rows=1, cols=1)
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            cell = t.rows[0].cells[0]
            shade(cell._tc, "F3F4F6")
            cell.paragraphs[0].text = ""
            lines = it[1].split("\n")
            for li, ln in enumerate(lines):
                p = cell.paragraphs[0] if li == 0 else cell.add_paragraph()
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.0
                r = p.add_run(ln if ln else " ")
                r.font.name = "Consolas"
                r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
                r.font.size = Pt(8.5)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
        elif kind == "img":
            from PIL import Image as _I
            ip = os.path.join(OUT_DIR, it[1])
            iw, ih = _I.open(ip).size
            wcm = CONTENT_W
            hcm = wcm * ih / iw
            if hcm > CONTENT_H - 1.0:
                hcm = CONTENT_H - 1.0
                wcm = hcm * iw / ih
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.add_run().add_picture(ip, width=Cm(wcm))
        elif kind == "mermaid":
            path, w, h = diag[id(it)]
            max_w, max_h = CONTENT_W, (11.8 if LANDSCAPE else 21.0)
            wcm = max_w
            hcm = wcm * h / w
            if hcm > max_h:
                hcm = max_h
                wcm = hcm * w / h
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_together = True
            p.add_run().add_picture(path, width=Cm(wcm))
        elif kind == "table":
            rows = it[1]
            ncols = max(len(r) for r in rows)
            t = doc.add_table(rows=len(rows), cols=ncols)
            t.style = "Table Grid"
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            widths = [max([len(re.sub(r"[`*]", "", (r[c] if c < len(r) else ""))) for r in rows] + [4]) for c in range(ncols)]
            widths = [min(max(w, 6), 48) for w in widths]
            tot = sum(widths)
            avail = CONTENT_W
            for ri, row in enumerate(rows):
                for ci in range(ncols):
                    cell = t.rows[ri].cells[ci]
                    cell.width = Cm(avail * widths[ci] / tot)
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_after = Pt(1)
                    txt = row[ci] if ci < len(row) else ""
                    add_runs(p, txt, size=8.5, bold_all=(ri == 0))
                    if ri == 0:
                        shade(cell._tc, "E0E7FF")
                    elif ri % 2 == 0:
                        shade(cell._tc, "F9FAFB")
            if True:
                # repeat header row
                trPr = t.rows[0]._tr.get_or_add_trPr()
                th = OxmlElement("w:tblHeader")
                th.set(qn("w:val"), "true")
                trPr.append(th)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
        elif kind == "rule":
            pass

    path = os.path.join(OUT_DIR, OUT_NAME + ".docx")
    doc.save(path)
    return path


# ------------------------------------------------------------------ pdf
def build_pdf(items, diag):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph,
                                    Preformatted, Spacer, Table, TableStyle)
    from reportlab.platypus.tableofcontents import TableOfContents
    from xml.sax.saxutils import escape

    F = r"C:\Windows\Fonts"
    pdfmetrics.registerFont(TTFont("Body", os.path.join(F, "arial.ttf")))
    pdfmetrics.registerFont(TTFont("Body-B", os.path.join(F, "arialbd.ttf")))
    pdfmetrics.registerFont(TTFont("Body-I", os.path.join(F, "ariali.ttf")))
    pdfmetrics.registerFont(TTFont("Body-BI", os.path.join(F, "arialbi.ttf")))
    pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-B", italic="Body-I", boldItalic="Body-BI")
    pdfmetrics.registerFont(TTFont("Mono", os.path.join(F, "consola.ttf")))
    pdfmetrics.registerFont(TTFont("Mono-B", os.path.join(F, "consolab.ttf")))

    INDIGO = colors.HexColor("#312E81")
    ACC = colors.HexColor("#4F46E5")
    GREY = colors.HexColor("#6B7280")

    base = ParagraphStyle("base", fontName="Body", fontSize=9.6, leading=13.6, spaceAfter=5, textColor=colors.HexColor("#111827"), alignment=TA_LEFT)
    h1 = ParagraphStyle("h1", parent=base, fontName="Body-B", fontSize=20, leading=24, textColor=INDIGO, spaceBefore=0, spaceAfter=10)
    h2 = ParagraphStyle("h2", parent=base, fontName="Body-B", fontSize=13.5, leading=17, textColor=INDIGO, spaceBefore=12, spaceAfter=5, keepWithNext=1)
    h3 = ParagraphStyle("h3", parent=base, fontName="Body-B", fontSize=11, leading=14, textColor=colors.HexColor("#1F2937"), spaceBefore=8, spaceAfter=3, keepWithNext=1)
    h4 = ParagraphStyle("h4", parent=h3, fontSize=10)
    li = ParagraphStyle("li", parent=base, leftIndent=14, bulletIndent=3, spaceAfter=2.5)
    cell = ParagraphStyle("cell", parent=base, fontSize=7.8, leading=10, spaceAfter=0)
    cellh = ParagraphStyle("cellh", parent=cell, fontName="Body-B")
    toc1 = ParagraphStyle("toc1", parent=base, fontName="Body-B", fontSize=10.5, leading=14, spaceBefore=5, spaceAfter=1)
    toc2 = ParagraphStyle("toc2", parent=base, fontSize=9, leading=12, leftIndent=14, spaceAfter=0)

    def mark(text: str) -> str:
        parts = []
        for kind, t in inline_tokens(text):
            e = escape(t)
            if kind == "bold":
                parts.append(f"<b>{e}</b>")
            elif kind == "italic":
                parts.append(f"<i>{e}</i>")
            elif kind == "code":
                parts.append(f'<font name="Mono" color="#9D174D" size="8.3">{e}</font>')
            else:
                parts.append(e)
        return "".join(parts)

    class Doc(BaseDocTemplate):
        def afterFlowable(self, fl):
            if isinstance(fl, Paragraph) and fl.style.name in ("h1", "h2"):
                lvl = 0 if fl.style.name == "h1" else 1
                text = fl.getPlainText()
                key = f"h{self.seq.nextf('toc')}"
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=lvl, closed=(lvl == 1))
                self.notify("TOCEntry", (lvl, text, self.page - 1, key))

    from reportlab.lib.pagesizes import landscape as _ls
    W, H = _ls(A4) if LANDSCAPE else A4
    frame = Frame(2 * cm, 2 * cm, W - 4 * cm, H - 4 * cm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    def on_page(canv, d):
        canv.saveState()
        canv.setFont("Body", 8)
        canv.setFillColor(GREY)
        canv.drawCentredString(W / 2, 1.1 * cm, f"{FOOTER}   |   Page {d.page - 1}")
        canv.setStrokeColor(colors.HexColor("#E5E7EB"))
        canv.line(2 * cm, 1.55 * cm, W - 2 * cm, 1.55 * cm)
        canv.restoreState()

    def on_cover(canv, d):
        canv.saveState()
        canv.setFillColor(colors.HexColor("#EEF2FF"))
        canv.rect(0, 0, W, H, fill=1, stroke=0)
        canv.setFillColor(colors.HexColor("#C7D2FE"))
        canv.circle(W - 2 * cm, H - 3 * cm, 7 * cm, fill=1, stroke=0)
        canv.setFillColor(colors.HexColor("#FBCFE8"))
        canv.circle(1 * cm, 4 * cm, 6 * cm, fill=1, stroke=0)
        canv.setFillColor(colors.HexColor("#A7F3D0"))
        canv.circle(W / 2, -1 * cm, 5 * cm, fill=1, stroke=0)
        canv.restoreState()

    out = os.path.join(OUT_DIR, OUT_NAME + ".pdf")
    doc = Doc(out, pagesize=(W, H), title=f"{TITLE} - {OUT_NAME}", author="Project documentation", subject=SUBTITLE,
              pageTemplates=[PageTemplate(id="cover", frames=[frame], onPage=on_cover, autoNextPageTemplate="body"),
                             PageTemplate(id="body", frames=[frame], onPage=on_page)])

    story = []
    ctitle = ParagraphStyle("ct", parent=base, fontName="Body-B", fontSize=34, leading=40, textColor=INDIGO)
    csub = ParagraphStyle("cs", parent=base, fontSize=17, leading=22, textColor=ACC)
    ckind = ParagraphStyle("ck", parent=base, fontName="Body-B", fontSize=12.5, leading=17)
    cnote = ParagraphStyle("cn", parent=base, fontSize=9.5, leading=13, textColor=colors.HexColor("#4B5563"))
    story += [Spacer(1, (3.5 if LANDSCAPE else 6.5) * cm), Paragraph(escape(TITLE), ctitle), Spacer(1, 6), Paragraph(escape(SUBTITLE), csub), Spacer(1, 22),
              Paragraph(escape(DOC_KIND), ckind), Spacer(1, 8),
              Paragraph(escape(COVER_BLURB), cnote), Spacer(1, (3.5 if LANDSCAPE else 9) * cm),
              *[Paragraph(escape(x), cnote) for x in COVER_NOTES], PageBreak()]

    toc = TableOfContents()
    toc.levelStyles = [toc1, toc2]
    toc.dotsMinLevel = 0
    h1toc = ParagraphStyle("h1toc", parent=h1)
    story += [Paragraph("Table of Contents", h1toc), toc, PageBreak()]

    first_h1 = True
    for it in items:
        kind = it[0]
        if kind == "h":
            lvl, text = it[1], it[2]
            if lvl == 1 and not first_h1:
                story.append(PageBreak())
            if lvl == 1:
                first_h1 = False
            style = {1: h1, 2: h2, 3: h3}.get(lvl, h4)
            story.append(Paragraph(escape(text), style))
        elif kind == "p":
            story.append(Paragraph(mark(it[1]), base))
        elif kind == "li":
            if it[1]:
                story.append(Paragraph(mark(it[3]), li, bulletText=it[2]))
            else:
                story.append(Paragraph(mark(it[3]), li, bulletText="\u2022"))
        elif kind == "code":
            pre = Preformatted(it[1], ParagraphStyle("code", fontName="Mono", fontSize=7.4, leading=9.2, backColor=colors.HexColor("#F3F4F6"),
                                                    borderPadding=5, leftIndent=4, spaceBefore=3, spaceAfter=8))
            story.append(pre)
        elif kind == "img":
            from PIL import Image as _I
            ip = os.path.join(OUT_DIR, it[1])
            iw, ih = _I.open(ip).size
            wp = W - 4 * cm
            hp = wp * ih / iw
            if hp > H - 4.6 * cm:
                hp = H - 4.6 * cm
                wp = hp * iw / ih
            if story and isinstance(story[-1], Paragraph):
                story[-1].keepWithNext = 1
            im = Image(ip, width=wp, height=hp)
            im.hAlign = "CENTER"
            story.append(im)
        elif kind == "mermaid":
            path, w, h = diag[id(it)]
            max_w, max_h = W - 4 * cm, (11.8 if LANDSCAPE else 21.5) * cm
            if story and isinstance(story[-1], Paragraph):
                story[-1].keepWithNext = 1
            wp = max_w
            hp = wp * h / w
            if hp > max_h:
                hp = max_h
                wp = hp * w / h
            img = Image(path, width=wp, height=hp)
            img.hAlign = "CENTER"
            story += [img, Spacer(1, 6)]
        elif kind == "table":
            rows = it[1]
            ncols = max(len(r) for r in rows)
            data = []
            for ri, r in enumerate(rows):
                data.append([Paragraph(mark(r[c] if c < len(r) else ""), cellh if ri == 0 else cell) for c in range(ncols)])
            weights = [max([len(re.sub(r"[`*]", "", (r[c] if c < len(r) else ""))) for r in rows] + [4]) for c in range(ncols)]
            weights = [min(max(w, 7), 46) for w in weights]
            tot = sum(weights)
            avail = W - 4 * cm
            colw = [avail * w / tot for w in weights]
            t = Table(data, colWidths=colw, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E0E7FF")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ]))
            story += [t, Spacer(1, 7)]
        elif kind == "rule":
            story.append(Spacer(1, 4))

    doc.multiBuild(story)
    return out


def check_glyphs(text: str):
    from reportlab.pdfbase.ttfonts import TTFont
    f = TTFont("chk", r"C:\Windows\Fonts\arial.ttf")
    cmap = f.face.charToGlyph
    missing = sorted({c for c in text if ord(c) > 126 and ord(c) not in cmap})
    return missing


def main():
    md = normalise(load_parts())
    items = list(blocks(md))
    miss = check_glyphs(md)
    if miss:
        print("WARNING glyphs missing in Arial:", [(c, hex(ord(c))) for c in miss])
    diag = render_diagrams(items)
    write_markdown(md, items)
    print("markdown ok")
    print("docx", build_docx(items, diag))
    print("pdf", build_pdf(items, diag))


if __name__ == "__main__":
    main()
