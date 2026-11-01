"""Semantic similarity scorer using sentence-transformers.

Computes semantic similarity between intercepted payloads and a library
of known 'safe' vs 'dangerous' prompt templates to gauge intent.
"""

import os
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

SBERT_MODEL = os.getenv("SBERT_MODEL", "all-MiniLM-L6-v2")

# ── Prompt Template Library ────────────────────────────────────────

DANGEROUS_TEMPLATES = [
    "Here is my Aadhaar number and bank account details",
    "My credit card number is",
    "Please review this private source code from our company",
    "Here is the database password and API key",
    "Sharing our internal financial report for analysis",
    "Help me analyze this customer's personal data",
    "Here is the encryption private key",
    "Our company's trade secret formula is",
    "I'm uploading employee salary data for review",
    "Here is the patient medical record",
    "The AWS access key is AKIA",
    "Our internal API endpoint credentials are",
    "Can you review our merger and acquisition documents",
    "Here is the source code for our proprietary algorithm",
    "My PAN card number is",
    "Please process this UPI payment data",
    "Here is the IFSC code and account number for transfer",
    "The admin password for our production server is",
    "I need help with this confidential legal document",
    "Sharing our quarterly earnings before public release",
]

SAFE_TEMPLATES = [
    "What is the capital of France?",
    "Explain how photosynthesis works",
    "Write a poem about the ocean",
    "How do I sort a list in Python?",
    "What are the benefits of meditation?",
    "Translate 'hello' to Spanish",
    "Summarize the history of the Internet",
    "What is the difference between TCP and UDP?",
    "Explain the concept of machine learning",
    "Help me write a cover letter for a job application",
    "What are some good recipes for pasta?",
    "How does a blockchain work at a high level?",
    "What is the weather like in Mumbai?",
    "Can you explain object-oriented programming?",
    "Write a haiku about autumn",
    "What are the best practices for code review?",
    "How do I create a responsive website?",
    "Explain the theory of relativity simply",
    "Help me plan a vacation itinerary for Goa",
    "What are common data structures in computer science?",
]


class SemanticScorer:
    """Computes semantic similarity between payloads and known templates.

    Uses sentence-transformers (all-MiniLM-L6-v2) to embed text and
    compare against dangerous vs safe prompt templates.
    """

    def __init__(self, model_name: str | None = None) -> None:
        """Initialize the semantic scorer with a sentence-transformers model.

        Args:
            model_name: Model name to load (default: all-MiniLM-L6-v2).
        """
        self.model = None
        self.dangerous_embeddings: Optional[np.ndarray] = None
        self.safe_embeddings: Optional[np.ndarray] = None

        model = model_name or SBERT_MODEL
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(model)
            self._precompute_template_embeddings()
            logger.info(f"Semantic scorer initialized with model '{model}'.")
        except Exception as e:
            logger.warning(
                f"Failed to load sentence-transformers model '{model}': {e}. "
                "Semantic scoring will return neutral scores."
            )

    def _precompute_template_embeddings(self) -> None:
        """Precompute embeddings for all template prompts."""
        if self.model is None:
            return
        self.dangerous_embeddings = self.model.encode(
            DANGEROUS_TEMPLATES, convert_to_numpy=True, normalize_embeddings=True
        )
        self.safe_embeddings = self.model.encode(
            SAFE_TEMPLATES, convert_to_numpy=True, normalize_embeddings=True
        )

    def _cosine_similarity(self, embedding: np.ndarray, templates: np.ndarray) -> float:
        """Compute max cosine similarity between embedding and template set."""
        similarities = np.dot(templates, embedding)
        return float(np.max(similarities))

    def compute_semantic_score(self, text: str) -> float:
        """Compute a semantic risk score (0.0 to 1.0).

        Compares the payload embedding against dangerous and safe templates.
        Returns a score where:
        - 1.0 = very similar to dangerous templates
        - 0.0 = very similar to safe templates
        - 0.5 = ambiguous / neutral

        Args:
            text: The payload text to score.

        Returns:
            A float between 0.0 and 1.0 representing semantic risk.
        """
        if self.model is None or self.dangerous_embeddings is None:
            return 0.5  # Neutral score when model unavailable

        # Truncate to first 512 tokens worth of text
        truncated = text[:2048]

        try:
            payload_embedding = self.model.encode(
                [truncated], convert_to_numpy=True, normalize_embeddings=True
            )[0]

            dangerous_sim = self._cosine_similarity(
                payload_embedding, self.dangerous_embeddings
            )
            safe_sim = self._cosine_similarity(
                payload_embedding, self.safe_embeddings
            )

            # Normalize: if dangerous_sim > safe_sim, score tends toward 1.0
            # Using softmax-like normalization
            total = dangerous_sim + safe_sim
            if total == 0:
                return 0.5

            raw_score = dangerous_sim / total
            # Scale to be more discriminative (center around 0.5)
            score = (raw_score - 0.5) * 2.0
            score = max(0.0, min(1.0, score * 0.8 + 0.1))

            return round(score, 4)

        except Exception as e:
            logger.error(f"Semantic scoring failed: {e}")
            return 0.5

    def classify_intent(self, text: str) -> str:
        """Classify the intent of a payload.

        Returns:
            One of: "PII_LEAK", "IP_LEAK", "SAFE", "AMBIGUOUS"
        """
        score = self.compute_semantic_score(text)
        if score >= 0.7:
            # Check if it's more PII or IP related
            text_lower = text.lower()
            pii_keywords = {"aadhaar", "pan", "credit card", "phone", "email", "bank", "account"}
            ip_keywords = {"source code", "algorithm", "api key", "password", "secret", "private key"}

            pii_count = sum(1 for kw in pii_keywords if kw in text_lower)
            ip_count = sum(1 for kw in ip_keywords if kw in text_lower)

            if pii_count > ip_count:
                return "PII_LEAK"
            elif ip_count > 0:
                return "IP_LEAK"
            return "PII_LEAK"
        elif score <= 0.3:
            return "SAFE"
        else:
            return "AMBIGUOUS"
