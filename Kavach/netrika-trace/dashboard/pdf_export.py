"""Dashboard PDF export helpers for Streamlit."""

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def export_incident_table_pdf(incidents_data: list[dict]) -> bytes:
    """Export the incident table as a PDF.

    Args:
        incidents_data: List of incident dicts.

    Returns:
        PDF file as bytes.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()

    elements = []
    elements.append(Paragraph("NETRIKA·TRACE — INCIDENT LOG", ParagraphStyle(
        name="ExportTitle",
        fontSize=16,
        textColor=colors.HexColor("#ff2d55"),
        fontName="Helvetica-Bold",
        spaceAfter=8,
    )))
    elements.append(Paragraph(
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        ParagraphStyle(name="Timestamp", fontSize=8, textColor=colors.gray),
    ))
    elements.append(Spacer(1, 12))

    if not incidents_data:
        elements.append(Paragraph("No incidents to display.", styles["Normal"]))
    else:
        header = ["ID", "Time", "Source IP", "Target", "Score", "Decision"]
        data = [header]
        for inc in incidents_data[:50]:
            ts = inc.get("timestamp", "")
            if isinstance(ts, str) and len(ts) > 16:
                ts = ts[:16]
            data.append([
                inc.get("id", "")[:8] + "...",
                str(ts),
                inc.get("user_ip", ""),
                inc.get("target_host", ""),
                str(inc.get("risk_score", "")),
                inc.get("decision", ""),
            ])

        table = Table(data, colWidths=[60, 100, 80, 100, 40, 60])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2196f3")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("PADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8f8")]),
        ]))
        elements.append(table)

    doc.build(elements)
    return buf.getvalue()
