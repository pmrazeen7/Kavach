"""Unit tests for source code and secrets detection."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from agents.code_detector import CodeDetector


@pytest.fixture
def detector():
    return CodeDetector()


class TestSecretDetection:
    def test_detects_aws_key(self, detector):
        text = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
        secrets = detector.detect_secrets(text)
        types = [s["pattern_name"] for s in secrets]
        assert "AWS_ACCESS_KEY" in types

    def test_detects_private_key(self, detector):
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...\n-----END RSA PRIVATE KEY-----"
        secrets = detector.detect_secrets(text)
        types = [s["pattern_name"] for s in secrets]
        assert "PRIVATE_KEY" in types

    def test_detects_jwt_token(self, detector):
        text = "Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.zbgZaqS8t-K6"
        secrets = detector.detect_secrets(text)
        types = [s["pattern_name"] for s in secrets]
        assert "JWT_TOKEN" in types

    def test_detects_database_url(self, detector):
        text = "DB_URL=postgres://admin:password@host:5432/db"
        secrets = detector.detect_secrets(text)
        types = [s["pattern_name"] for s in secrets]
        assert "DATABASE_URL" in types

    def test_detects_env_variables(self, detector):
        text = "SECRET_KEY=mysecretvalue123\nAPI_TOKEN=abc123def456"
        secrets = detector.detect_secrets(text)
        types = [s["pattern_name"] for s in secrets]
        assert "ENV_VARIABLE" in types

    def test_no_secrets_in_safe_text(self, detector):
        text = "What is the weather like today? I love photography and cooking."
        secrets = detector.detect_secrets(text)
        assert len(secrets) == 0

    def test_redacts_secret_values(self, detector):
        text = "AKIAIOSFODNN7EXAMPLE"
        secrets = detector.detect_secrets(text)
        for secret in secrets:
            assert secret["value"] == "****REDACTED****"


class TestCodePatternDetection:
    def test_detects_python_functions(self, detector):
        text = "def process_data(x):\n    return x * 2\n\ndef calculate(y):\n    return y + 1"
        patterns = detector.detect_code_patterns(text)
        pattern_names = [p["pattern_name"] for p in patterns]
        assert "PYTHON_DEF" in pattern_names

    def test_detects_python_imports(self, detector):
        text = "import os\nfrom datetime import datetime\nimport json"
        patterns = detector.detect_code_patterns(text)
        pattern_names = [p["pattern_name"] for p in patterns]
        assert "PYTHON_IMPORT" in pattern_names

    def test_detects_sql_queries(self, detector):
        text = "SELECT * FROM users WHERE id = 1; INSERT INTO logs VALUES ('test')"
        patterns = detector.detect_code_patterns(text)
        pattern_names = [p["pattern_name"] for p in patterns]
        assert "SQL_QUERY" in pattern_names

    def test_detects_javascript_functions(self, detector):
        text = "function processData(input) {\n  const result = await fetch(url);\n  return result;\n}"
        patterns = detector.detect_code_patterns(text)
        pattern_names = [p["pattern_name"] for p in patterns]
        assert any(p in pattern_names for p in ["JS_FUNCTION", "JS_ARROW"])

    def test_no_code_in_natural_language(self, detector):
        text = "Today I went to the market and bought some vegetables. The weather was nice."
        patterns = detector.detect_code_patterns(text)
        assert len(patterns) == 0


class TestFullAnalysis:
    def test_analyze_code_with_secrets(self, detector):
        text = (
            "import os\n"
            "DB_URL = 'postgres://admin:pass@host/db'\n"
            "def connect():\n"
            "    return db.connect(DB_URL)\n"
        )
        result = detector.analyze(text)
        assert result.code_detected is True
        assert result.secrets_detected is True
        assert result.score_boost >= 40

    def test_analyze_safe_text(self, detector):
        text = "What is the capital of France? It is Paris."
        result = detector.analyze(text)
        assert result.code_detected is False
        assert result.secrets_detected is False
        assert result.score_boost == 0

    def test_analyze_returns_detections_list(self, detector):
        text = "AKIAIOSFODNN7EXAMPLE"
        result = detector.analyze(text)
        assert isinstance(result.detections, list)
        assert len(result.detections) > 0

    def test_source_code_payload_file(self, detector):
        payload_path = os.path.join(
            os.path.dirname(__file__), "sample_payloads", "source_code_payload.txt"
        )
        with open(payload_path, "r") as f:
            text = f.read()
        result = detector.analyze(text)
        assert result.code_detected is True
        assert result.secrets_detected is True
