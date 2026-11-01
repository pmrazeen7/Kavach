#!/usr/bin/env bash
# Netrika-Trace Demo Script
# Sends 3 test payloads through the intervention server API
# to demonstrate the DLP pipeline decisions.
set -e

API_URL="${1:-http://localhost:8888}"

echo "============================================"
echo "  NETRIKA-TRACE — Demo Script"
echo "============================================"
echo ""
echo "API endpoint: $API_URL"
echo ""

# ── Test 1: Safe Payload ───────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Safe Payload (Weather query)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SAFE_PAYLOAD='{"payload": "What is the weather like in Mumbai today? I am planning a trip to Gateway of India and would like to know if I should carry an umbrella.", "user_ip": "192.168.1.100", "target_host": "api.openai.com", "target_url": "https://api.openai.com/v1/chat/completions"}'

echo "Sending safe payload..."
RESPONSE=$(curl -s -X POST "$API_URL/api/analyze" \
    -H "Content-Type: application/json" \
    -d "$SAFE_PAYLOAD" 2>/dev/null || echo '{"error": "Server not running. Start with: python server/intervention_server.py"}')

echo "Response: $RESPONSE"
echo ""

# ── Test 2: PII Payload ───────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: PII Payload (Aadhaar + PAN)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PII_PAYLOAD='{"payload": "My name is Rahul Sharma and my Aadhaar number is 4567 8901 2345. My PAN card is ABCDE1234F. My bank IFSC is SBIN0001234 and UPI ID is rahul@upi. Phone: +91 9876543210.", "user_ip": "192.168.1.101", "target_host": "api.anthropic.com", "target_url": "https://api.anthropic.com/v1/messages"}'

echo "Sending PII payload..."
RESPONSE=$(curl -s -X POST "$API_URL/api/analyze" \
    -H "Content-Type: application/json" \
    -d "$PII_PAYLOAD" 2>/dev/null || echo '{"error": "Server not running"}')

echo "Response: $RESPONSE"
echo ""

# ── Test 3: Source Code Payload ────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Source Code + Secrets Payload"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CODE_PAYLOAD='{"payload": "Review this code:\nimport os\nDB_URL = \"postgres://admin:pass@prod:5432/db\"\nAWS_KEY = \"AKIAIOSFODNN7EXAMPLE\"\ndef connect():\n    return db.connect(DB_URL)\n# -----BEGIN RSA PRIVATE KEY-----", "user_ip": "192.168.1.102", "target_host": "chat.openai.com", "target_url": "https://chat.openai.com/backend-api/conversation"}'

echo "Sending source code payload..."
RESPONSE=$(curl -s -X POST "$API_URL/api/analyze" \
    -H "Content-Type: application/json" \
    -d "$CODE_PAYLOAD" 2>/dev/null || echo '{"error": "Server not running"}')

echo "Response: $RESPONSE"
echo ""

echo "============================================"
echo "  Demo Complete"
echo "============================================"
echo ""
echo "View results at: http://localhost:8501 (Streamlit Dashboard)"
echo "View incidents at: http://localhost:8888/api/incidents"
