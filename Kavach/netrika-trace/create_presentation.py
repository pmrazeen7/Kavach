from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt


OUT = "Netrika-Trace_Algorithm_Presentation.pptx"
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

BG = RGBColor(7, 13, 23)
PANEL = RGBColor(15, 27, 43)
PANEL_2 = RGBColor(20, 38, 57)
TEXT = RGBColor(232, 240, 247)
MUTED = RGBColor(160, 181, 198)
CYAN = RGBColor(51, 210, 220)
GREEN = RGBColor(45, 211, 133)
AMBER = RGBColor(255, 181, 71)
RED = RGBColor(255, 83, 103)
BLUE = RGBColor(83, 145, 255)


def set_bg(slide):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = BG


def add_text(slide, text, x, y, w, h, size=18, color=TEXT, bold=False,
             font="Aptos", align=PP_ALIGN.LEFT, valign=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.vertical_anchor = valign
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def title(slide, heading, subheading=None):
    add_text(slide, heading, 0.65, 0.35, 12, 0.55, 27, TEXT, True, "Aptos Display")
    if subheading:
        add_text(slide, subheading, 0.68, 0.92, 11.8, 0.35, 11, MUTED)
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.68), Inches(1.3), Inches(1.25), Inches(0.045))
    line.fill.solid(); line.fill.fore_color.rgb = CYAN; line.line.fill.background()


def panel(slide, x, y, w, h, fill=PANEL, line_color=RGBColor(32, 57, 78)):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid(); shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line_color
    shape.line.width = Pt(1)
    return shape


def bullet_list(slide, items, x, y, w, h, size=17, color=TEXT, spacing=7):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame; tf.clear(); tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = item
        p.level = 0
        p.font.name = "Aptos"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.space_after = Pt(spacing)
        p.bullet = True
    return box


def flow_node(slide, label, x, y, w, h, color=BLUE, font_size=15):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid(); shape.fill.fore_color.rgb = PANEL_2
    shape.line.color.rgb = color; shape.line.width = Pt(1.5)
    add_text(slide, label, x + 0.08, y + 0.08, w - 0.16, h - 0.16, font_size, TEXT, True, align=PP_ALIGN.CENTER, valign=MSO_ANCHOR.MIDDLE)
    return shape


def arrow(slide, x1, y1, x2, y2, color=CYAN):
    line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    line.line.color.rgb = color; line.line.width = Pt(2)
    line.line.end_arrowhead = True


def footer(slide, number):
    add_text(slide, f"NETRIKA-TRACE  |  ALGORITHM FLOW  |  {number:02d}", 0.68, 7.12, 5.5, 0.18, 8, MUTED, True)


# 1. Cover
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide)
add_text(slide, "NETRIKA-TRACE", 0.8, 1.0, 11.8, 0.8, 42, CYAN, True, "Aptos Display")
add_text(slide, "Autonomous Shadow-AI Gateway", 0.85, 1.92, 11, 0.65, 28, TEXT, True, "Aptos Display")
add_text(slide, "Algorithm flow, decision logic and pseudocode", 0.88, 2.75, 10, 0.4, 18, MUTED)
panel(slide, 0.85, 4.0, 11.7, 1.4, PANEL)
add_text(slide, "INTERCEPT", 1.2, 4.35, 2.0, 0.3, 15, CYAN, True)
add_text(slide, "ANALYZE", 4.0, 4.35, 2.0, 0.3, 15, BLUE, True)
add_text(slide, "DECIDE", 6.8, 4.35, 2.0, 0.3, 15, AMBER, True)
add_text(slide, "PROTECT", 9.6, 4.35, 2.0, 0.3, 15, GREEN, True)
for x in (3.1, 5.9, 8.7): arrow(slide, x, 4.5, x + 0.55, 4.5)
add_text(slide, "Real-time DLP for prompts, code, secrets and document uploads", 0.9, 6.2, 11.5, 0.35, 14, MUTED)

# 2. Objective
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "1. Problem and Objective", "Stop sensitive data before it reaches an external AI service")
panel(slide, 0.7, 1.65, 5.8, 4.9)
add_text(slide, "INPUT RISK", 1.05, 1.98, 2, 0.3, 13, RED, True)
bullet_list(slide, ["Employees send prompts to ChatGPT, Gemini, Claude and similar tools.", "Payloads may contain PII, proprietary source code, API keys or database credentials.", "Traditional domain blocking is too broad and harms productivity."], 1.05, 2.45, 5.0, 3.2, 16)
panel(slide, 6.85, 1.65, 5.8, 4.9)
add_text(slide, "SYSTEM OBJECTIVE", 7.2, 1.98, 3, 0.3, 13, GREEN, True)
bullet_list(slide, ["Inspect only monitored AI-bound requests and file uploads.", "Compute a risk score from multiple forensic signals.", "Apply policy: ALLOW, WARN or BLOCK.", "Log sanitized metadata for audit and DPDP compliance."], 7.2, 2.45, 5.0, 3.5, 16)
footer(slide, 2)

# 3. Architecture
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "2. End-to-End Architecture", "Two interception surfaces feed one analysis pipeline")
flow_node(slide, "Employee\nBrowser", 0.7, 2.35, 1.65, 1.0, CYAN)
flow_node(slide, "mitmproxy\nport 8080", 3.0, 1.65, 1.8, 1.0, CYAN)
flow_node(slide, "Chrome extension\nfile / fetch scan", 3.0, 3.35, 1.8, 1.0, CYAN)
flow_node(slide, "LangGraph DLP\npipeline", 5.8, 2.35, 2.0, 1.0, BLUE)
flow_node(slide, "Policy result\nALLOW / WARN / BLOCK", 8.8, 2.35, 2.2, 1.0, AMBER, 14)
flow_node(slide, "SQLite + Redis\nSOC audit", 11.15, 2.35, 1.45, 1.0, GREEN, 12)
arrow(slide, 2.35, 2.85, 3.0, 2.15); arrow(slide, 2.35, 2.85, 3.0, 3.85)
arrow(slide, 4.8, 2.15, 5.8, 2.85); arrow(slide, 4.8, 3.85, 5.8, 2.85)
arrow(slide, 7.8, 2.85, 8.8, 2.85); arrow(slide, 11.0, 2.85, 11.15, 2.85)
add_text(slide, "Only monitored AI endpoints are analyzed; unrelated traffic passes through.", 1.0, 5.35, 11.3, 0.35, 16, MUTED, False, align=PP_ALIGN.CENTER)
footer(slide, 3)

# 4. Pipeline flowchart
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "3. Core Algorithm Flowchart", "The LangGraph state machine preserves one shared AgentState")
flow_node(slide, "1\nSNIFFER\nNormalize + hash", 0.65, 2.15, 2.0, 1.25, CYAN, 14)
flow_node(slide, "2\nFORENSIC\nParallel detectors", 3.25, 2.15, 2.0, 1.25, BLUE, 14)
flow_node(slide, "3\nDECISION\nPolicy thresholds", 5.85, 2.15, 2.0, 1.25, AMBER, 14)
flow_node(slide, "4\nINTERVENTION\nSanitized simulation", 8.45, 1.25, 2.0, 1.25, RED, 13)
flow_node(slide, "5\nLOGGER\nPersist + broadcast", 8.45, 3.3, 2.0, 1.25, GREEN, 13)
flow_node(slide, "END\nRequest outcome", 11.05, 3.3, 1.55, 1.25, GREEN, 13)
arrow(slide, 2.65, 2.78, 3.25, 2.78); arrow(slide, 5.25, 2.78, 5.85, 2.78)
arrow(slide, 7.85, 2.55, 8.45, 1.88, RED); arrow(slide, 7.85, 3.0, 8.45, 3.92, GREEN)
arrow(slide, 10.45, 3.92, 11.05, 3.92, GREEN); arrow(slide, 9.45, 2.5, 9.45, 3.3, RED)
add_text(slide, "WARN / BLOCK", 8.05, 1.45, 1.0, 0.25, 10, RED, True, align=PP_ALIGN.RIGHT)
add_text(slide, "ALLOW or fast-path", 7.75, 4.55, 1.5, 0.25, 10, GREEN, True, align=PP_ALIGN.RIGHT)
footer(slide, 4)

# 5. Forensic details
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "4. Forensic Analysis", "Independent detectors run concurrently to reduce latency")
cards = [("PII", "Presidio + Indian regex\nAadhaar, PAN, UPI, cards, email", RED), ("NER", "SpaCy entities\nPERSON, ORG, GPE, MONEY", BLUE), ("CODE", "Regex + Pygments\nPython, JS, SQL, Docker, shell", CYAN), ("SECRETS", "Credential patterns\nAWS keys, JWT, private keys, DB URLs", AMBER)]
for i, (head, body, color) in enumerate(cards):
    x = 0.8 + (i % 2) * 6.1; y = 1.7 + (i // 2) * 2.15
    panel(slide, x, y, 5.45, 1.65)
    add_text(slide, head, x + 0.28, y + 0.25, 1.5, 0.3, 18, color, True)
    add_text(slide, body, x + 0.28, y + 0.72, 4.7, 0.65, 14, TEXT)
panel(slide, 0.8, 6.1, 11.55, 0.55, PANEL_2)
add_text(slide, "Risk = weighted signals + code boost + secrets boost + high-PII boost, capped at 100", 1.05, 6.24, 11.0, 0.25, 14, TEXT, True, align=PP_ALIGN.CENTER)
footer(slide, 5)

# 6. Decision
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "5. Decision Algorithm", "Thresholds are configurable in config.json")
add_text(slide, "RISK SCORE", 0.95, 1.7, 2, 0.3, 13, MUTED, True)
bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.0), Inches(2.45), Inches(11.0), Inches(0.5)); bar.fill.solid(); bar.fill.fore_color.rgb = GREEN; bar.line.fill.background()
warn = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5.4), Inches(2.45), Inches(3.3), Inches(0.5)); warn.fill.solid(); warn.fill.fore_color.rgb = AMBER; warn.line.fill.background()
block = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(8.7), Inches(2.45), Inches(3.3), Inches(0.5)); block.fill.solid(); block.fill.fore_color.rgb = RED; block.line.fill.background()
add_text(slide, "0", 0.95, 3.05, 0.4, 0.25, 12, MUTED); add_text(slide, "40", 5.25, 3.05, 0.5, 0.25, 12, AMBER, True); add_text(slide, "70", 8.55, 3.05, 0.5, 0.25, 12, RED, True); add_text(slide, "100", 11.65, 3.05, 0.6, 0.25, 12, MUTED)
add_text(slide, "ALLOW", 2.3, 3.75, 2.0, 0.35, 20, GREEN, True, align=PP_ALIGN.CENTER)
add_text(slide, "WARN", 6.0, 3.75, 2.0, 0.35, 20, AMBER, True, align=PP_ALIGN.CENTER)
add_text(slide, "BLOCK", 9.35, 3.75, 2.0, 0.35, 20, RED, True, align=PP_ALIGN.CENTER)
add_text(slide, "score < 40", 2.3, 4.25, 2.0, 0.3, 14, MUTED, align=PP_ALIGN.CENTER)
add_text(slide, "40 <= score < 70", 5.85, 4.25, 2.3, 0.3, 14, MUTED, align=PP_ALIGN.CENTER)
add_text(slide, "score >= 70", 9.35, 4.25, 2.0, 0.3, 14, MUTED, align=PP_ALIGN.CENTER)
panel(slide, 1.0, 5.15, 11.0, 0.85, PANEL_2)
add_text(slide, "Extension/file fast path: if a block-policy entity is found, force BLOCK and skip Ollama simulation.", 1.3, 5.4, 10.4, 0.3, 14, TEXT, True, align=PP_ALIGN.CENTER)
footer(slide, 6)

# 7. Pseudocode
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "6. End-to-End Pseudocode", "Presentation version of run_pipeline() and the graph routing")
panel(slide, 0.8, 1.55, 11.75, 5.25, RGBColor(10, 20, 32))
code = """FUNCTION analyze_request(payload, metadata):
    state <- initialize_state(payload, metadata)

    state <- sniffer(state)
        state.incident_id <- UUID()
        state.payload_hash <- SHA256(state.payload)
        state.payload <- normalize_and_limit(state.payload, 50000)
        state.preview <- first_200_chars(state.payload)

    state <- forensic(state)
        pii, ner, code, secrets <- run_detectors_in_parallel(state.payload)
        state.risk_score <- calculate_risk(pii, ner, semantic, code, secrets)
        state.entities <- keep_policy_entities_only()

    state.decision <- apply_policy(state.risk_score, state.entities, metadata.source)
    IF state.decision IN {WARN, BLOCK} AND NOT fast_path(metadata.source):
        state.simulation <- generate_local_simulation(sanitized_types(state))
        render_intervention_page(state)

    persist_sanitized_incident(state)
    broadcast_dashboard_event(state)
    RETURN state"""
add_text(slide, code, 1.15, 1.9, 11.0, 4.5, 15, RGBColor(220, 235, 245), False, "Consolas")
footer(slide, 7)

# 8. Privacy and outputs
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "7. Outputs and Privacy Controls", "The system protects the data while recording enough evidence to audit")
panel(slide, 0.8, 1.65, 5.6, 4.85)
add_text(slide, "USER OUTCOME", 1.15, 1.98, 2.2, 0.3, 13, CYAN, True)
bullet_list(slide, ["ALLOW: request continues unchanged.", "WARN: request continues and a warning banner is injected into HTML.", "BLOCK: request is redirected to a red-screen intervention page.", "Fast file scans return a decision without waiting for simulation."], 1.15, 2.4, 4.8, 3.4, 15)
panel(slide, 6.75, 1.65, 5.8, 4.85)
add_text(slide, "PRIVACY GUARANTEES", 7.1, 1.98, 2.8, 0.3, 13, GREEN, True)
bullet_list(slide, ["Store entity types and counts, not raw values.", "Use SHA-256 for deduplication instead of storing the full payload.", "Limit the stored preview to 200 characters.", "Send only sanitized categories to local Phi-3; never send raw secrets.", "Persist to SQLite and broadcast metadata to the SOC dashboard."], 7.1, 2.4, 4.9, 3.8, 15)
footer(slide, 8)

# 9. Example
slide = prs.slides.add_slide(prs.slide_layouts[6]); set_bg(slide); title(slide, "8. Example Walkthrough", "A source-code prompt containing credentials")
panel(slide, 0.8, 1.65, 3.0, 4.75)
add_text(slide, "INPUT", 1.1, 1.98, 1.2, 0.3, 13, CYAN, True)
add_text(slide, "Prompt contains:\n\n- Source code\n- Database URL\n- AWS access key", 1.1, 2.55, 2.35, 2.0, 17, TEXT)
flow_node(slide, "Detect\ncode + secret", 4.25, 2.45, 2.0, 1.0, RED)
flow_node(slide, "Add boosts\nscore rises", 7.0, 2.45, 2.0, 1.0, AMBER)
flow_node(slide, "BLOCK\nredirect + log", 9.75, 2.45, 2.0, 1.0, RED)
arrow(slide, 3.8, 2.95, 4.25, 2.95); arrow(slide, 6.25, 2.95, 7.0, 2.95); arrow(slide, 9.0, 2.95, 9.75, 2.95)
panel(slide, 4.25, 4.45, 7.5, 1.15, PANEL_2)
add_text(slide, "Stored evidence: incident ID, risk score, entity types, payload hash and 200-char preview.", 4.55, 4.75, 6.9, 0.45, 15, TEXT, True, align=PP_ALIGN.CENTER)
add_text(slide, "Result: the external AI service never receives the sensitive payload.", 1.0, 6.25, 11.3, 0.35, 17, GREEN, True, align=PP_ALIGN.CENTER)
footer(slide, 9)

prs.save(OUT)
print(OUT)