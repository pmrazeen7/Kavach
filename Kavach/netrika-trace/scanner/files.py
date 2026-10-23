"""Text extraction for uploads so files are scanned like typed text.

Supported without extra dependencies: txt, md, csv, json, yaml, log, env, source
files, docx (python-docx), pdf (PyPDF2 when installed) and zip archives
(recursive, bounded). Images need OCR, which runs in the browser; on the server
they are reported as unscannable rather than silently passed.
"""

from __future__ import annotations

import io
import zipfile

MAX_BYTES = 10 * 1024 * 1024
MAX_ZIP_MEMBERS = 50
MAX_ZIP_TOTAL = 30 * 1024 * 1024
TEXT_EXT = {".txt", ".md", ".csv", ".tsv", ".json", ".yaml", ".yml", ".log", ".env", ".ini", ".cfg", ".conf", ".toml", ".xml", ".html", ".sql", ".sh", ".py", ".js", ".ts", ".tsx", ".java", ".go", ".rb", ".php", ".c", ".cpp", ".cs", ".pem", ".key", ".properties"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff"}


class Unscannable(Exception):
    pass


def _ext(name: str) -> str:
    i = name.rfind(".")
    return name[i:].lower() if i >= 0 else ""


def extract_text(data: bytes, filename: str, depth: int = 0) -> list[tuple[str, str]]:
    """Return [(name, text)] for the file and, for archives, each readable member."""
    if len(data) > MAX_BYTES:
        raise Unscannable("file is larger than 10 MB")
    ext = _ext(filename)
    if ext == ".zip":
        if depth >= 2:
            raise Unscannable("archives nested too deeply")
        out: list[tuple[str, str]] = []
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as exc:
            raise Unscannable("not a valid zip archive") from exc
        total = 0
        for info in zf.infolist()[:MAX_ZIP_MEMBERS]:
            if info.is_dir():
                continue
            total += info.file_size
            if total > MAX_ZIP_TOTAL or info.file_size > MAX_BYTES:
                raise Unscannable("archive expands to more than the scan limit")
            try:
                out += extract_text(zf.read(info), f"{filename}/{info.filename}", depth + 1)
            except Unscannable:
                continue
        return out
    if ext == ".docx":
        try:
            import docx

            d = docx.Document(io.BytesIO(data))
            parts = [p.text for p in d.paragraphs]
            for t in d.tables:
                for row in t.rows:
                    parts += [c.text for c in row.cells]
            return [(filename, "\n".join(parts))]
        except Exception as exc:
            raise Unscannable("could not read the .docx") from exc
    if ext == ".pdf":
        try:
            import PyPDF2

            reader = PyPDF2.PdfReader(io.BytesIO(data))
            return [(filename, "\n".join((page.extract_text() or "") for page in reader.pages[:200]))]
        except Exception as exc:
            raise Unscannable("could not read the PDF text (scanned PDFs need OCR)") from exc
    if ext in IMAGE_EXT:
        raise Unscannable("images are scanned with OCR in the browser, not on the server")
    if ext in TEXT_EXT or not ext:
        return [(filename, data.decode("utf-8", errors="replace"))]
    # Unknown type: decode printable content rather than letting it through unscanned.
    text = data.decode("utf-8", errors="replace")
    if text.count("�") > len(text) * 0.2:
        raise Unscannable(f"unsupported binary file type {ext or '(none)'}")
    return [(filename, text)]
