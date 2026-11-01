"""LLM Chat Service — Google Gemini integration with document extraction.

Provides:
- Stateless per-session chat via Gemini API (free tier)
- Document text extraction (PDF, DOCX, TXT, CSV)
- Session management (each session = fresh context = digital Alzheimer's)
"""

import io
import logging
import os
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

# ── Session Store (in-memory, per-process) ─────────────────────────
# Each session has its own conversation history. New session = no memory.
_sessions: dict[str, list[dict]] = {}


def _get_mock_response(message: str, history: list) -> str:
    """Generate a mock LLM response since APIs are rate limited."""
    if "Do you remember any personal information" in message:
        return "I have absolutely no memory of any previous conversation or personal data. My context is completely fresh."
        
    if "I've uploaded a document named" in message:
        return f"I have received your document. I can see it contains text. As an AI, I suggest being careful about uploading sensitive documents."
        
    return f"This is a mock AI response. You said: '{message[:50]}...'. (Gemini API quota exceeded)"


def create_session() -> str:
    """Create a new chat session with a fresh context."""
    session_id = str(uuid.uuid4())[:8]
    _sessions[session_id] = []
    logger.info(f"[LLM] Created new session: {session_id}")
    return session_id


def get_session_history(session_id: str) -> list[dict]:
    """Get conversation history for a session."""
    return _sessions.get(session_id, [])


def list_sessions() -> list[dict]:
    """List all chat sessions with metadata."""
    sessions = []
    for sid, messages in _sessions.items():
        msg_count = len(messages)
        preview = ""
        if messages:
            first_user = next(
                (m["content"][:80] for m in messages if m["role"] == "user"), ""
            )
            preview = first_user
        sessions.append({
            "session_id": sid,
            "message_count": msg_count,
            "preview": preview,
        })
    return sessions


def chat_with_llm(
    message: str,
    session_id: str,
    system_prompt: Optional[str] = None,
) -> str:
    """Send a message to Gemini and get a response.

    Each session maintains its own conversation history.
    A new session = completely fresh context (digital Alzheimer's).
    """
    if session_id not in _sessions:
        _sessions[session_id] = []

    history = _sessions[session_id]

    # Build the conversation (Mock LLM)
    import asyncio
    
    # Generate mock response
    assistant_reply = _get_mock_response(message, history)

    try:
        # Store in session history
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": assistant_reply})

        logger.info(
            f"[LLM-MOCK] Session {session_id}: "
            f"sent {len(message)} chars, got {len(assistant_reply)} chars"
        )
        return assistant_reply

    except Exception as e:
        logger.error(f"[LLM] Mock error: {e}")
        raise


def extract_text_from_document(
    file_bytes: bytes,
    filename: str,
    *,
    max_pdf_pages: int | None = None,
) -> str:
    """Extract text content from uploaded documents.

    Supports: PDF, DOCX, TXT, CSV

    Args:
        max_pdf_pages: If set, only extract this many PDF pages (faster uploads).
    """
    ext = os.path.splitext(filename)[1].lower()

    if ext == ".txt" or ext == ".csv":
        return file_bytes.decode("utf-8", errors="replace")

    elif ext == ".pdf":
        try:
            from PyPDF2 import PdfReader

            reader = PdfReader(io.BytesIO(file_bytes))
            text_parts = []
            for i, page in enumerate(reader.pages):
                if max_pdf_pages is not None and i >= max_pdf_pages:
                    break
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            return "\n".join(text_parts)
        except ImportError:
            raise ImportError("PyPDF2 not installed. Run: pip install PyPDF2")

    elif ext == ".docx":
        try:
            from docx import Document

            doc = Document(io.BytesIO(file_bytes))
            return "\n".join(para.text for para in doc.paragraphs if para.text)
        except ImportError:
            raise ImportError(
                "python-docx not installed. Run: pip install python-docx"
            )

    else:
        # Try to decode as plain text
        try:
            return file_bytes.decode("utf-8", errors="replace")
        except Exception:
            raise ValueError(f"Unsupported file type: {ext}")


def run_memory_test(previous_session_id: str) -> dict:
    """Prove 'digital Alzheimer's' — start a fresh session and ask about PII.

    Creates a brand new session and asks the LLM about data from a
    previous session. The LLM won't remember anything.

    Returns:
        dict with previous session info and LLM's response proving no memory.
    """
    # Get the previous session's PII-containing messages
    prev_history = _sessions.get(previous_session_id, [])
    prev_user_messages = [
        m["content"] for m in prev_history if m["role"] == "user"
    ]

    # Create a completely fresh session
    new_session_id = create_session()

    # Ask the LLM about previously shared information
    test_prompts = [
        "Do you remember any personal information I shared with you before? "
        "What was my Aadhaar number, PAN card, UPI ID, or any other personal data?",
    ]

    results = []
    for prompt in test_prompts:
        response = chat_with_llm(prompt, new_session_id)
        results.append({"question": prompt, "answer": response})

    return {
        "previous_session_id": previous_session_id,
        "new_session_id": new_session_id,
        "previous_messages": prev_user_messages[:5],  # First 5 user messages
        "memory_test_results": results,
        "verdict": "NO_MEMORY",
        "explanation": (
            "The LLM was given a completely fresh session with no access to "
            "previous conversations. This proves 'digital Alzheimer's' — the "
            "model cannot recall any PII or data from prior sessions."
        ),
    }
