"""Unit tests for PII detection using Presidio with custom Indian recognizers."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from pii.presidio_analyzer import PresidioAnalyzerWrapper


@pytest.fixture
def analyzer():
    return PresidioAnalyzerWrapper()


class TestAadhaarDetection:
    def test_detects_aadhaar_with_spaces(self, analyzer):
        text = "My Aadhaar number is 4567 8901 2345"
        result = analyzer.get_entity_summary(text)
        assert "AADHAAR" in result
        assert result["AADHAAR"] >= 1

    def test_detects_aadhaar_without_spaces(self, analyzer):
        text = "Aadhaar: 456789012345"
        result = analyzer.get_entity_summary(text)
        assert "AADHAAR" in result

    def test_rejects_invalid_aadhaar_starting_with_0_or_1(self, analyzer):
        text = "Number: 0123 4567 8901"
        result = analyzer.get_entity_summary(text)
        assert "AADHAAR" not in result

    def test_multiple_aadhaar_numbers(self, analyzer):
        text = "User1: 4567 8901 2345, User2: 9876 5432 1098"
        result = analyzer.get_entity_summary(text)
        assert "AADHAAR" in result
        assert result["AADHAAR"] >= 2


class TestPANDetection:
    def test_detects_valid_pan(self, analyzer):
        text = "PAN card number is ABCDE1234F"
        result = analyzer.get_entity_summary(text)
        assert "PAN" in result

    def test_detects_pan_in_sentence(self, analyzer):
        text = "Please verify my PAN BXYPG5678H for tax filing"
        result = analyzer.get_entity_summary(text)
        assert "PAN" in result

    def test_rejects_invalid_pan(self, analyzer):
        text = "This is not a PAN: 12345ABCDE"
        result = analyzer.get_entity_summary(text)
        assert "PAN" not in result


class TestUPIDetection:
    def test_detects_upi_id(self, analyzer):
        text = "Send money to rahul.sharma@upi"
        result = analyzer.get_entity_summary(text)
        assert "UPI_ID" in result

    def test_detects_bank_upi(self, analyzer):
        text = "UPI: user123@okaxis"
        result = analyzer.get_entity_summary(text)
        assert "UPI_ID" in result


class TestIFSCDetection:
    def test_detects_ifsc_code(self, analyzer):
        text = "IFSC code: SBIN0001234"
        result = analyzer.get_entity_summary(text)
        assert "IFSC" in result

    def test_detects_hdfc_ifsc(self, analyzer):
        text = "Bank IFSC: HDFC0002345"
        result = analyzer.get_entity_summary(text)
        assert "IFSC" in result


class TestPIIScore:
    def test_safe_text_low_score(self, analyzer):
        text = "What is the weather like in Mumbai today?"
        score = analyzer.compute_pii_score(text)
        assert score < 0.3

    def test_pii_text_high_score(self, analyzer):
        text = "My Aadhaar is 4567 8901 2345 and PAN is ABCDE1234F. Credit card: 4111 1111 1111 1111"
        score = analyzer.compute_pii_score(text)
        assert score > 0.3

    def test_empty_text_zero_score(self, analyzer):
        score = analyzer.compute_pii_score("")
        assert score == 0.0


class TestAnalyzePrivacy:
    def test_no_values_in_results(self, analyzer):
        text = "My Aadhaar is 4567 8901 2345"
        results = analyzer.analyze(text)
        for result in results:
            assert "value" not in result or result.get("value") == "****"
            assert "type" in result
            assert "start" in result
            assert "end" in result
            assert "score" in result
