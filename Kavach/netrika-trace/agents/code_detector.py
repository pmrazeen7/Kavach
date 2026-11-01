"""Source code and secrets detection module.

Detects if intercepted payloads contain source code, API keys,
private keys, JWT tokens, database URLs, .env content, and other
sensitive technical artifacts.
"""

import logging
import re
from typing import NamedTuple

logger = logging.getLogger(__name__)


class DetectionResult(NamedTuple):
    """Result of code/secrets detection."""
    code_detected: bool
    secrets_detected: bool
    detections: list[dict]
    score_boost: int


# ── Secret Patterns ────────────────────────────────────────────────

SECRET_PATTERNS = {
    "PRIVATE_KEY": re.compile(r"-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----"),
    "AWS_ACCESS_KEY": re.compile(r"AKIA[0-9A-Z]{16}"),
    "JWT_TOKEN": re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    # ENV_VARIABLE: must have = followed by a value with special chars or quoted, and be at line start
    # Requires at least one non-alphanumeric char in value to reduce false-positives on plain text
    "ENV_VARIABLE": re.compile(
        r'^[A-Z][A-Z0-9_]{2,}=(?:["\'][^\s"\'][^\s"\']|[^\s"\'][^\s"\'].*?[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>/?])',
        re.MULTILINE
    ),
    "DATABASE_URL": re.compile(r"(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s]+"),
    "GITHUB_TOKEN": re.compile(r"gh[pousr]_[A-Za-z0-9_]{36,}"),
    "SLACK_TOKEN": re.compile(r"xox[baprs]-[0-9A-Za-z-]+"),
    "GENERIC_API_KEY": re.compile(r"(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*[\"']?[A-Za-z0-9_\-]{16,}[\"']?", re.IGNORECASE),
    "BEARER_TOKEN": re.compile(r"Bearer\s+[A-Za-z0-9_\-.~+/]+=*"),
    "AZURE_CONNECTION": re.compile(r"DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+"),
}

# ── Code Signature Patterns ────────────────────────────────────────

CODE_PATTERNS = {
    "PYTHON_DEF": re.compile(r"^\s*def\s+\w+\s*\(", re.MULTILINE),
    "PYTHON_CLASS": re.compile(r"^\s*class\s+\w+\s*[\(:]", re.MULTILINE),
    "PYTHON_IMPORT": re.compile(r"^\s*(?:from|import)\s+\w+", re.MULTILINE),
    "JS_FUNCTION": re.compile(r"(?:function\s+\w+\s*\(|const\s+\w+\s*=\s*(?:async\s+)?\()", re.MULTILINE),
    "JS_ARROW": re.compile(r"=>\s*\{", re.MULTILINE),
    "JAVA_CLASS": re.compile(r"(?:public|private|protected)\s+(?:static\s+)?(?:class|interface)\s+\w+"),
    "C_INCLUDE": re.compile(r'^\s*#include\s+[<"]', re.MULTILINE),
    "SQL_QUERY": re.compile(r"\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b", re.IGNORECASE),
    "HTML_SCRIPT": re.compile(r"<script[\s>]", re.IGNORECASE),
    "DOCKER_CMD": re.compile(r"^\s*(?:FROM|RUN|CMD|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME)\s+", re.MULTILINE),
    "YAML_STRUCTURE": re.compile(r"^\w+:\s*\n\s+\w+:", re.MULTILINE),
    "SHELL_SHEBANG": re.compile(r"^#!\s*/(?:usr/)?bin/(?:bash|sh|zsh|python)", re.MULTILINE),
}

# Minimum number of code patterns to trigger detection
CODE_PATTERN_THRESHOLD = 2


class CodeDetector:
    """Detects source code and secrets in text payloads.

    Uses a combination of:
    1. Regex patterns for secrets (API keys, tokens, passwords)
    2. Code signature patterns for common programming languages
    3. Pygments lexer guessing for language identification
    """

    def __init__(self) -> None:
        """Initialize the code detector."""
        self._pygments_available = False
        try:
            import pygments
            import pygments.lexers
            self._pygments_available = True
        except ImportError:
            logger.warning("Pygments not available. Code detection will rely on regex only.")

    def detect_secrets(self, text: str) -> list[dict]:
        """Detect secrets and sensitive credentials in text.

        Args:
            text: The text to scan for secrets.

        Returns:
            List of dicts with: type, pattern_name, start, end.
            Actual secret values are NEVER returned.
        """
        detections = []
        for secret_type, pattern in SECRET_PATTERNS.items():
            for match in pattern.finditer(text):
                detections.append({
                    "type": "SECRET",
                    "pattern_name": secret_type,
                    "start": match.start(),
                    "end": match.end(),
                    "value": "****REDACTED****",
                })
        return detections

    def detect_code_patterns(self, text: str) -> list[dict]:
        """Detect source code patterns in text.

        Args:
            text: The text to scan for code patterns.

        Returns:
            List of dicts with: type, pattern_name, count.
        """
        detections = []
        for pattern_name, pattern in CODE_PATTERNS.items():
            matches = pattern.findall(text)
            if matches:
                detections.append({
                    "type": "CODE_PATTERN",
                    "pattern_name": pattern_name,
                    "count": len(matches),
                })
        return detections

    def detect_with_pygments(self, text: str) -> dict | None:
        """Use Pygments lexer guessing to identify programming language.

        Only triggers on text that ALSO has at least one code-signature pattern match,
        to avoid false positives on plain natural language or PII documents.
        """
        if not self._pygments_available:
            return None

        # Require minimum length and at least one clear code indicator
        if len(text) < 200:
            return None

        # Pre-check: at least one code pattern must match before trusting Pygments
        code_hits = self.detect_code_patterns(text)
        if not code_hits:
            return None

        try:
            from pygments.lexers import guess_lexer

            sample = text[:5000]
            lexer = guess_lexer(sample)

            # Exclude generic/plain text lexers
            text_lexers = {
                "Text only", "text", "Plain text", "plaintext",
                "Markdown", "reStructuredText", "BBCode",
            }
            if lexer.name in text_lexers:
                return None

            return {
                "type": "PYGMENTS_DETECTION",
                "language": lexer.name,
                "confidence": "medium",
            }
        except Exception:
            return None

    def analyze(self, text: str) -> DetectionResult:
        """Run full code and secrets analysis on text."""
        secret_entities: list[dict] = []
        code_entities: list[dict] = []
        code_detected = False
        secrets_detected = False

        # 1. Secrets detection
        secret_hits = self.detect_secrets(text)
        if secret_hits:
            secrets_detected = True
            for hit in secret_hits:
                secret_entities.append({
                    "type": hit["pattern_name"],   # e.g. AWS_ACCESS_KEY, DATABASE_URL
                    "value": "****",
                    "start": hit["start"],
                    "count": 1,
                    "source": "SECRET",
                })
            logger.info(f"[CODE_DETECTOR] Found {len(secret_hits)} secret(s): "
                        f"{[h['pattern_name'] for h in secret_hits]}")

        # 2. Code pattern detection (regex)
        code_hits = self.detect_code_patterns(text)
        total_code_matches = sum(d["count"] for d in code_hits)
        if len(code_hits) >= CODE_PATTERN_THRESHOLD or total_code_matches >= 3:
            code_detected = True
            for hit in code_hits:
                code_entities.append({
                    "type": hit["pattern_name"],   # e.g. PYTHON_DEF, SQL_QUERY
                    "value": "****",
                    "start": 0,
                    "count": hit["count"],
                    "source": "CODE",
                })
            logger.info(
                f"[CODE_DETECTOR] Found {len(code_hits)} code pattern types, "
                f"{total_code_matches} total matches"
            )

        # 3. Pygments confirmation (only when regex code patterns already present)
        if not code_detected:
            pygments_result = self.detect_with_pygments(text)
            if pygments_result:
                code_detected = True
                code_entities.append({
                    "type": pygments_result["type"],
                    "language": pygments_result["language"],
                    "value": "****",
                    "start": 0,
                    "count": 1,
                    "source": "CODE",
                })
                logger.info(
                    f"[CODE_DETECTOR] Pygments detected language: {pygments_result['language']}"
                )

        all_detections = secret_entities + code_entities

        return DetectionResult(
            code_detected=code_detected,
            secrets_detected=secrets_detected,
            detections=all_detections,
            score_boost=(30 if secrets_detected else 0) + (40 if code_detected else 0),
        )
