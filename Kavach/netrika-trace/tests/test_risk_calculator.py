"""Unit tests for the risk score calculator."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from pii.risk_calculator import RiskCalculator


@pytest.fixture
def calculator():
    return RiskCalculator()


class TestRiskCalculation:
    def test_zero_scores_return_zero(self, calculator):
        score = calculator.calculate(
            pii_score=0.0, entity_score=0.0, semantic_score=0.0
        )
        assert score == 0

    def test_max_scores_return_high(self, calculator):
        score = calculator.calculate(
            pii_score=1.0, entity_score=1.0, semantic_score=1.0
        )
        assert score == 100

    def test_code_detection_boosts_score(self, calculator):
        base_score = calculator.calculate(
            pii_score=0.2, entity_score=0.1, semantic_score=0.1
        )
        boosted_score = calculator.calculate(
            pii_score=0.2, entity_score=0.1, semantic_score=0.1,
            code_detected=True,
        )
        assert boosted_score == base_score + 20

    def test_secrets_detection_boosts_score(self, calculator):
        base_score = calculator.calculate(
            pii_score=0.2, entity_score=0.1, semantic_score=0.1
        )
        boosted_score = calculator.calculate(
            pii_score=0.2, entity_score=0.1, semantic_score=0.1,
            secrets_detected=True,
        )
        assert boosted_score == base_score + 30

    def test_score_capped_at_100(self, calculator):
        score = calculator.calculate(
            pii_score=1.0, entity_score=1.0, semantic_score=1.0,
            code_detected=True, secrets_detected=True,
        )
        assert score == 100

    def test_weighted_calculation(self, calculator):
        # With pii_weight=1.0, entity_weight=0.0, semantic_weight=0.0:
        # PII=0.5 * 1.0 = 0.5, Entity and Semantic are ignored → 50
        score = calculator.calculate(
            pii_score=0.5, entity_score=0.2, semantic_score=0.3
        )
        assert abs(score - 50) <= 1


class TestDecision:
    def test_allow_below_threshold(self, calculator):
        assert calculator.get_decision(10) == "ALLOW"
        assert calculator.get_decision(0) == "ALLOW"
        assert calculator.get_decision(39) == "ALLOW"

    def test_warn_at_threshold(self, calculator):
        # warn_threshold is now 40
        assert calculator.get_decision(40) == "WARN"
        assert calculator.get_decision(50) == "WARN"
        assert calculator.get_decision(69) == "WARN"

    def test_block_at_threshold(self, calculator):
        assert calculator.get_decision(70) == "BLOCK"
        assert calculator.get_decision(85) == "BLOCK"
        assert calculator.get_decision(100) == "BLOCK"


class TestExplain:
    def test_explain_returns_breakdown(self, calculator):
        result = calculator.explain(
            pii_score=0.5, entity_score=0.3, semantic_score=0.7,
            code_detected=True, secrets_detected=False,
        )
        assert "risk_score" in result
        assert "decision" in result
        assert "breakdown" in result
        assert "pii" in result["breakdown"]
        assert "entity" in result["breakdown"]
        assert "semantic" in result["breakdown"]
        assert result["breakdown"]["code_boost"] == 20
        assert result["breakdown"]["secrets_boost"] == 0

    def test_explain_decision_matches_score(self, calculator):
        result = calculator.explain(
            pii_score=1.0, entity_score=1.0, semantic_score=1.0,
            code_detected=False, secrets_detected=False,
        )
        assert result["decision"] == "BLOCK"
        assert result["risk_score"] == 100
