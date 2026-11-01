"""Draws the master architecture poster (layers with every framework) as a PNG."""
from PIL import Image, ImageDraw, ImageFont

FR = r"C:\Windows\Fonts\arial.ttf"
FB = r"C:\Windows\Fonts\arialbd.ttf"

W, H = 3200, 1490
LANES = [
    ("PEOPLE", (243, 244, 246), (107, 114, 128), [
        ("Employee", "uses ChatGPT, Gemini, Claude"),
        ("SOC analyst and admin", "reviews incidents, edits settings"),
    ]),
    ("INTERCEPTION", (224, 231, 255), (79, 70, 229), [
        ("Chrome extension", "JavaScript, Manifest V3, pdf.js"),
        ("mitmproxy gateway", "Python proxy on port 8080"),
        ("Chat sandbox page", "React, scanner in a Web Worker"),
    ]),
    ("BACKEND  (Python 3.11)", (219, 234, 254), (37, 99, 235), [
        ("aiohttp + asyncio", "API on port 8888, static files"),
        ("Middleware", "CORS, scanner_gate server check"),
        ("Login and roles", "JWT, PBKDF2, RBAC"),
        ("WebSocket broker", "live feed, policy push"),
        ("Reports", "ReportLab PDF, csv export"),
    ]),
    ("PIPELINE  (LangGraph)", (237, 233, 254), (109, 40, 217), "pipeline"),
    ("DETECTION AND AI TOOLS", (252, 231, 243), (190, 24, 93), [
        ("Presidio", "personal data, Indian IDs"),
        ("spaCy", "names and places"),
        ("sentence-transformers", "MiniLM on PyTorch, meaning"),
        ("Regex + Pygments", "secrets and source code"),
        ("Layered scanner", "entropy, logistic regression, HMAC"),
        ("Ollama phi3:mini", "local breach story, Jinja2 page"),
    ]),
    ("STORAGE AND MESSAGING", (209, 250, 229), (5, 150, 105), [
        ("SQLAlchemy", "ORM for the database"),
        ("SQLite or PostgreSQL 15", "audit and tenancy tables"),
        ("Redis 7", "pub/sub incident events"),
        ("SMTP email", "smtplib alerts"),
        ("Celery (not wired)", "PDF and webhook tasks"),
    ]),
    ("PRESENTATION", (254, 243, 199), (180, 83, 9), [
        ("React 18 dashboard", "TypeScript, Vite, React Router"),
        ("Data and state", "TanStack Query, Zustand"),
        ("Look and feel", "Tailwind, Framer Motion, Recharts"),
        ("In-browser tools", "Web Worker, tesseract.js OCR"),
        ("Streamlit panel", "legacy admin, Plotly, pandas"),
    ]),
    ("PACKAGING AND QUALITY", (229, 231, 235), (55, 65, 81), [
        ("Docker + Compose", "backend, proxy, worker, db, redis"),
        ("nginx", "serves the built React app"),
        ("pytest + pytest-asyncio", "Python tests"),
        ("vitest + ESLint + tsc", "TypeScript checks"),
    ]),
]
PIPE = [("1 Sniffer", "uuid, SHA-256"), ("2 Forensic", "detectors in parallel,\nrisk score 0 to 100"),
        ("3 Decision", "ALLOW, WARN or BLOCK"), ("4 Intervention", "only WARN and BLOCK"), ("5 Logger", "save, announce, email")]


def wrap(draw, text, font, width):
    out = []
    for para in text.split("\n"):
        words, line = para.split(), ""
        for w in words:
            t = (line + " " + w).strip()
            if draw.textlength(t, font=font) <= width:
                line = t
            else:
                out.append(line)
                line = w
        out.append(line)
    return out


def main(path):
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FB, 40)
    f_lane = ImageFont.truetype(FB, 27)
    f_box_t = ImageFont.truetype(FB, 31)
    f_box_s = ImageFont.truetype(FR, 25)
    d.text((60, 28), "Kavach (Netrika-Trace): architecture and frameworks", font=f_title, fill=(49, 46, 129))
    top, gap = 100, 26
    heights = [118, 150, 150, 150, 170, 150, 170, 118]
    y = top
    label_w = 270
    prev = None
    for (name, bg, fg, boxes), h in zip(LANES, heights):
        d.rounded_rectangle([40, y, W - 40, y + h], radius=22, fill=bg)
        # lane label
        lines = wrap(d, name, f_lane, label_w - 40)
        ty = y + h / 2 - len(lines) * 17
        for ln in lines:
            d.text((64, ty), ln, font=f_lane, fill=fg)
            ty += 34
        inner_x0, inner_x1 = 40 + label_w, W - 70
        if boxes == "pipeline":
            n = len(PIPE)
            bw = (inner_x1 - inner_x0 - (n - 1) * 60) / n
            for i, (t, s) in enumerate(PIPE):
                x0 = inner_x0 + i * (bw + 60)
                d.rounded_rectangle([x0, y + 16, x0 + bw, y + h - 16], radius=16, fill="white", outline=fg, width=4)
                tw = d.textlength(t, font=f_box_t)
                d.text((x0 + bw / 2 - tw / 2, y + 26), t, font=f_box_t, fill=(17, 24, 39))
                sy = y + 70
                for ln in wrap(d, s, f_box_s, bw - 24):
                    lw = d.textlength(ln, font=f_box_s)
                    d.text((x0 + bw / 2 - lw / 2, sy), ln, font=f_box_s, fill=(55, 65, 81))
                    sy += 30
                if i < n - 1:
                    ax = x0 + bw
                    d.line([(ax + 6, y + h / 2), (ax + 48, y + h / 2)], fill=fg, width=5)
                    d.polygon([(ax + 56, y + h / 2), (ax + 40, y + h / 2 - 10), (ax + 40, y + h / 2 + 10)], fill=fg)
        else:
            n = len(boxes)
            g = 28
            bw = (inner_x1 - inner_x0 - (n - 1) * g) / n
            for i, (t, s) in enumerate(boxes):
                x0 = inner_x0 + i * (bw + g)
                dashed = "not wired" in t
                box = [x0, y + 16, x0 + bw, y + h - 16]
                d.rounded_rectangle(box, radius=16, fill="white", outline=fg, width=4)
                tl = wrap(d, t, f_box_t, bw - 24)
                sl = wrap(d, s, f_box_s, bw - 24)
                total = len(tl) * 36 + len(sl) * 30 + 4
                ty = y + h / 2 - total / 2
                for ln in tl:
                    lw = d.textlength(ln, font=f_box_t)
                    d.text((x0 + bw / 2 - lw / 2, ty), ln, font=f_box_t, fill=(17, 24, 39))
                    ty += 36
                ty += 4
                for ln in sl:
                    lw = d.textlength(ln, font=f_box_s)
                    d.text((x0 + bw / 2 - lw / 2, ty), ln, font=f_box_s, fill=(55, 65, 81))
                    ty += 30
        # arrow to the next lane
        if name != "PACKAGING AND QUALITY":
            cx = W - 120
            if name in ("STORAGE AND MESSAGING",):
                pass
            d.polygon([(cx - 16, y + h + 3), (cx + 16, y + h + 3), (cx, y + h + gap - 3)], fill=(100, 108, 130))
        y += h + gap
    img.save(path, "PNG", optimize=True)


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
