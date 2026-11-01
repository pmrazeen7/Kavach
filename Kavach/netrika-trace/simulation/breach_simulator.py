"""Breach simulation generator using Ollama Phi-3.

Generates realistic breach scenario narratives using a local LLM
for educational/intervention purposes. Never sends actual payload
data to the model — only sanitized summaries.
"""

import logging
import os

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")

SIMULATION_PROMPT_TEMPLATE = (
    "You are a cybersecurity educator. A user was about to send the "
    "following data to an AI chatbot: {payload_summary}. "
    "The following sensitive items were detected: {entity_list}. "
    "Write a 3-paragraph realistic story of how a malicious actor "
    "could exploit this specific leaked data. Be concrete. "
    "Name the attack type. Describe the damage. "
    "End with one sentence of advice. Maximum 200 words."
)


class BreachSimulator:
    """Generates breach simulation stories using local Phi-3 via Ollama.

    IMPORTANT: The actual payload is NEVER sent to Phi-3. Only
    sanitized summaries (entity types + counts, not values) are used.
    This preserves data privacy even in the simulation step.
    """

    def __init__(
        self,
        ollama_host: str | None = None,
        model_name: str | None = None,
    ) -> None:
        """Initialize the breach simulator.

        Args:
            ollama_host: Ollama API endpoint URL.
            model_name: Model to use (default: phi3:mini).
        """
        self.ollama_host = ollama_host or OLLAMA_HOST
        self.model_name = model_name or OLLAMA_MODEL
        self.client = None

        try:
            import ollama as ollama_sdk
            self.client = ollama_sdk.Client(host=self.ollama_host)
            logger.info(f"BreachSimulator initialized with {self.model_name} at {self.ollama_host}")
        except ImportError:
            logger.warning("Ollama SDK not installed. Breach simulation will use fallback.")
        except Exception as e:
            logger.warning(f"Ollama connection failed: {e}. Using fallback simulation.")

    def build_entity_list(self, entities: list[dict]) -> str:
        """Build a sanitized entity list string from detected entities.

        Args:
            entities: List of entity dicts with type and count.

        Returns:
            Human-readable string of entity types and counts.
        """
        type_counts: dict[str, int] = {}
        for ent in entities:
            etype = ent.get("type", "UNKNOWN")
            count = ent.get("count", 1)
            type_counts[etype] = type_counts.get(etype, 0) + count

        if not type_counts:
            return "unspecified sensitive data"

        parts = [f"{count} {etype.replace('_', ' ').title()}" for etype, count in type_counts.items()]
        return ", ".join(parts)

    def build_payload_summary(
        self,
        code_detected: bool = False,
        secrets_detected: bool = False,
        entity_types: list[str] | None = None,
    ) -> str:
        """Build a sanitized payload summary.

        Never includes actual data — only describes the types of
        sensitive information found.
        """
        parts = []
        if code_detected:
            parts.append("proprietary source code")
        if secrets_detected:
            parts.append("API keys and credentials")

        pii_labels = {"AADHAAR", "PAN", "CREDIT_CARD", "PHONE_NUMBER", "EMAIL_ADDRESS", "UPI_ID", "IFSC"}
        if entity_types:
            found_pii = [et.replace("_", " ").lower() for et in entity_types if et in pii_labels]
            if found_pii:
                parts.append(f"PII data ({', '.join(found_pii)})")

        if not parts:
            parts.append("potentially sensitive data")

        return f"A payload containing {', '.join(parts)}"

    def generate(
        self,
        entities: list[dict],
        code_detected: bool = False,
        secrets_detected: bool = False,
    ) -> str:
        """Generate a breach simulation story.

        Args:
            entities: List of detected entity dicts.
            code_detected: Whether source code was detected.
            secrets_detected: Whether secrets were detected.

        Returns:
            Generated breach simulation narrative text.
        """
        entity_list = self.build_entity_list(entities)
        entity_types = [e.get("type", "") for e in entities]
        payload_summary = self.build_payload_summary(
            code_detected=code_detected,
            secrets_detected=secrets_detected,
            entity_types=entity_types,
        )

        prompt = SIMULATION_PROMPT_TEMPLATE.format(
            payload_summary=payload_summary,
            entity_list=entity_list,
        )

        if self.client is None:
            return self._fallback(entity_list, payload_summary)

        try:
            response = self.client.chat(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.7, "num_predict": 300},
            )
            text = response["message"]["content"]
            logger.info(f"Breach simulation generated ({len(text)} chars)")
            return text
        except Exception as e:
            logger.warning(f"Ollama generation failed: {e}. Using fallback.")
            return self._fallback(entity_list, payload_summary)

    def _fallback(self, entity_list: str, payload_summary: str) -> str:
        """Generate a static fallback simulation when Ollama is unavailable."""
        return (
            f"BREACH SCENARIO: {payload_summary} was intercepted before reaching "
            f"an external AI service. Detected: {entity_list}.\n\n"
            "A sophisticated attacker could have exploited this data through multiple "
            "vectors. First, through direct AI service data retention — most AI providers "
            "store conversation data for model training, meaning sensitive information "
            "becomes permanently embedded in their systems. Second, through network "
            "interception — a man-in-the-middle attack on the TLS connection could "
            "capture the transmitted data in transit.\n\n"
            "The consequences would be severe: identity theft using leaked PII, "
            "unauthorized access using exposed credentials, competitive intelligence "
            "harvesting from proprietary code, and regulatory penalties under India's "
            "DPDP Act 2023 (Section 8, data fiduciary obligations). Financial damages "
            "could range from INR 50 crores in DPDP fines to immeasurable loss of "
            "intellectual property.\n\n"
            "ADVICE: Always review data before sharing with AI tools and use your "
            "organization's approved data classification guidelines."
        )
