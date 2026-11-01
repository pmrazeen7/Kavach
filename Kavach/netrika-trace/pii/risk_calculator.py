"""Weighted risk score aggregator.

Combines PII detection, NER entity, and semantic similarity scores
into a single composite risk score (0-100).
"""

import json
import logging
import os

logger = logging.getLogger(__name__)


def load_weights() -> tuple[float, float, float]:
    """Load risk score weights from config.json.

    Returns:
        Tuple of (pii_weight, entity_weight, semantic_weight).
    """
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
        with open(config_path, "r") as f:
            config = json.load(f)
        return (
            config.get("pii_weight", 1.0),
            config.get("entity_weight", 0.0),
            config.get("semantic_weight", 0.0),
            config.get("code_detection_score_boost", 20),
        )
    except (FileNotFoundError, json.JSONDecodeError):
        return (1.0, 0.0, 0.0, 20)


class RiskCalculator:
    """Aggregates multiple risk signals into a composite risk score.

    Combines:
    - PII detection score (Presidio) — weight: 0.5
    - Entity extraction score (SpaCy NER) — weight: 0.2
    - Semantic similarity score (sentence-transformers) — weight: 0.3

    Additional boosters:
    - Source code detection: +40 points
    - Secrets detection: +30 points
    """

    def __init__(self) -> None:
        """Initialize risk calculator with configurable weights."""
        self.pii_weight, self.entity_weight, self.semantic_weight, self.code_boost = load_weights()
        logger.info(
            f"RiskCalculator initialized with weights: "
            f"PII={self.pii_weight}, Entity={self.entity_weight}, "
            f"Semantic={self.semantic_weight}, CodeBoost={self.code_boost}"
        )

    def calculate(
        self,
        pii_score: float,
        entity_score: float,
        semantic_score: float,
        code_detected: bool = False,
        secrets_detected: bool = False,
    ) -> int:
        """Calculate the composite risk score.

        Args:
            pii_score: Normalized PII detection score (0.0 - 1.0).
            entity_score: Normalized entity extraction score (0.0 - 1.0).
            semantic_score: Normalized semantic similarity score (0.0 - 1.0).
            code_detected: Whether source code was detected in the payload.
            secrets_detected: Whether secrets (API keys, JWTs) were detected.

        Returns:
            Integer risk score from 0 to 100.
        """
        # Weighted combination
        base_score = (
            pii_score * self.pii_weight
            + entity_score * self.entity_weight
            + semantic_score * self.semantic_weight
        )

        # Scale to 0-100
        risk_score = int(base_score * 100)

        # Apply boosters
        if code_detected:
            risk_score += self.code_boost
            logger.info(f"Source code detected: +{self.code_boost} risk points")

        if secrets_detected:
            risk_score += 30
            logger.info("Secrets detected: +30 risk points")

        if pii_score >= 0.9:
            risk_score += 30
            logger.info("High PII detected: +30 risk points")

        # Cap at 100
        risk_score = min(risk_score, 100)

        logger.info(
            f"Risk calculation: PII={pii_score:.3f}({self.pii_weight}), "
            f"Entity={entity_score:.3f}({self.entity_weight}), "
            f"Semantic={semantic_score:.3f}({self.semantic_weight}), "
            f"Code={code_detected}, Secrets={secrets_detected} "
            f"→ Final Score: {risk_score}"
        )

        return risk_score

    def get_decision(self, risk_score: int) -> str:
        """Determine the decision based on risk score and thresholds.

        Args:
            risk_score: The computed risk score (0-100).

        Returns:
            One of: "ALLOW", "WARN", "BLOCK"
        """
        try:
            config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
            with open(config_path, "r") as f:
                config = json.load(f)
            block_threshold = config.get("block_threshold", 70)
            warn_threshold = config.get("warn_threshold", 30)
        except (FileNotFoundError, json.JSONDecodeError):
            block_threshold = 70
            warn_threshold = 30

        if risk_score >= block_threshold:
            return "BLOCK"
        elif risk_score >= warn_threshold:
            return "WARN"
        else:
            return "ALLOW"

    def explain(
        self,
        pii_score: float,
        entity_score: float,
        semantic_score: float,
        code_detected: bool,
        secrets_detected: bool,
    ) -> dict:
        """Generate a detailed risk explanation for audit purposes.

        Returns:
            Dict with breakdown of each component's contribution.
        """
        risk_score = self.calculate(
            pii_score, entity_score, semantic_score, code_detected, secrets_detected
        )
        decision = self.get_decision(risk_score)

        return {
            "risk_score": risk_score,
            "decision": decision,
            "breakdown": {
                "pii": {
                    "score": round(pii_score, 4),
                    "weight": self.pii_weight,
                    "contribution": round(pii_score * self.pii_weight * 100, 2),
                },
                "entity": {
                    "score": round(entity_score, 4),
                    "weight": self.entity_weight,
                    "contribution": round(entity_score * self.entity_weight * 100, 2),
                },
                "semantic": {
                    "score": round(semantic_score, 4),
                    "weight": self.semantic_weight,
                    "contribution": round(semantic_score * self.semantic_weight * 100, 2),
                },
                "code_boost": self.code_boost if code_detected else 0,
                "secrets_boost": 30 if secrets_detected else 0,
            },
        }
