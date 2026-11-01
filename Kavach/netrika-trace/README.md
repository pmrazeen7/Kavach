<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/kavach-logo-dark.svg">
    <img src="docs/assets/kavach-logo.svg" alt="Kavach: Stop leaks before they leave" width="520">
  </picture>
</p>

<h1 align="center">Kavach, the Autonomous Agentic Shadow-AI Gateway</h1>

> **A transparent network proxy that intercepts AI-bound requests, runs a 3-agent LangGraph pipeline to score data leakage risk, and blocks/warns on sensitive data — fully offline using local LLMs.**

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![DPDP Act](https://img.shields.io/badge/Compliance-DPDP%20Act%202023-red)](https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf)

---

## 🎯 What It Does

When an employee sends data to any AI tool (ChatGPT, Gemini, Claude, etc.), Kavach:

1. **Intercepts** the request via mitmproxy transparent proxy
2. **Analyzes** it through a 3-agent LangGraph pipeline:
   - **Sniffer Agent**: Extracts and normalizes payload
   - **Forensic Agent**: Runs PII detection (Presidio), NER (SpaCy), semantic scoring, code/secrets detection
   - **Decision Agent**: Applies risk thresholds → ALLOW / WARN / BLOCK
3. **Intervenes**: Redirects to a red-screen page (BLOCK) or injects a warning banner (WARN)
4. **Simulates**: Generates a breach scenario using local Phi-3 (never sends actual data to LLM)
5. **Logs**: Records everything to SQLite for audit & DPDP compliance

---

## 🏗️ Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────────────────────────┐
│   Employee   │────▶│  mitmproxy  │────▶│  LangGraph Pipeline              │
│   Browser    │     │  (port 8080)│     │  sniffer → forensic → decision  │
└──────────────┘     └─────────────┘     │  → intervention → logger        │
                          │              └──────────────────────────────────┘
                          │                     │           │
                    ┌─────▼─────┐         ┌─────▼─────┐ ┌──▼──────┐
                    │  AI APIs  │         │  SQLite   │ │  Redis  │
                    │  OpenAI   │         │  Audit DB │ │  PubSub │
                    │  Claude   │         └───────────┘ └─────────┘
                    │  Gemini   │
                    └───────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Redis 7+
- Ollama (for breach simulation)

### Local Setup

```bash
# Clone and install
cd netrika-trace
pip install -r requirements.txt

# Run setup (downloads models, inits DB)
bash setup.sh

# Start all services (3 terminals)
python server/intervention_server.py    # Port 8888 (API + intervention pages)
python proxy/run_proxy.py               # Port 8080 (mitmproxy)
streamlit run dashboard/app.py          # Port 8501 (admin dashboard)
```

### Docker Setup

```bash
# Start Ollama on host (needs GPU)
ollama pull phi3:mini
ollama serve

# Start all services
docker-compose up -d
```

---

## 🖥️ Browser Proxy Setup

### Chrome
1. Settings → System → Open proxy settings
2. Set HTTP/HTTPS proxy to `127.0.0.1:8080`
3. Visit `http://mitm.it` to install CA certificate

### Firefox
1. Settings → Network Settings → Manual proxy
2. HTTP Proxy: `127.0.0.1`, Port: `8080`
3. Check "Also use this proxy for HTTPS"
4. Visit `http://mitm.it` to install CA cert

### System-wide (Ubuntu)
```bash
export http_proxy=http://127.0.0.1:8080
export https_proxy=http://127.0.0.1:8080
```

---

## 🔍 Testing

### Unit Tests
```bash
pytest tests/ -v
```

### Manual Test Commands
```bash
# 1. Safe payload (should ALLOW)
curl -X POST http://localhost:8888/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"payload": "What is the weather in Mumbai?", "user_ip": "192.168.1.1", "target_host": "api.openai.com", "target_url": "https://api.openai.com/v1/chat"}'

# 2. PII payload (should WARN or BLOCK)
curl -X POST http://localhost:8888/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"payload": "My Aadhaar is 4567 8901 2345 and PAN is ABCDE1234F", "user_ip": "192.168.1.1", "target_host": "api.openai.com", "target_url": "https://api.openai.com/v1/chat"}'

# 3. Source code (should BLOCK)
curl -X POST http://localhost:8888/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"payload": "def connect():\n  DB_URL=\"postgres://admin:pass@host/db\"\n  AWS=AKIAIOSFODNN7EXAMPLE", "user_ip": "192.168.1.1", "target_host": "chat.openai.com", "target_url": "https://chat.openai.com/api"}'

# 4. AWS keys (should BLOCK)
curl -X POST http://localhost:8888/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"payload": "AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET=wJalrXUtnFEMI", "user_ip": "192.168.1.1", "target_host": "api.openai.com", "target_url": "https://api.openai.com/v1/chat"}'

# 5. Check incidents
curl http://localhost:8888/api/incidents
```

### Demo Script
```bash
bash demo.sh
```

---

## 📊 Dashboard

Access the admin dashboard at `http://localhost:8501`:

- **War Room**: Live monitoring, statistics, incident table
- **Incident Detail**: Deep dive with breach simulation viewer
- **DPDP Compliance**: Weekly compliance stats and PDF generation
- **Policy Config**: Threshold sliders, feature toggles, endpoint management

---

## 🛡️ Detected Entities

| Category | Types Detected |
|----------|---------------|
| **Indian PII** | Aadhaar, PAN, UPI ID, IFSC, Indian Phone |
| **Standard PII** | Credit Card, Email, Phone, SSN, IBAN |
| **Named Entities** | Organizations, Persons, Locations (SpaCy NER) |
| **Source Code** | Python, JavaScript, Java, SQL, Shell, Docker |
| **Secrets** | AWS Keys, Private Keys, JWT, DB URLs, .env vars, GitHub/Slack tokens |

---

## 📄 DPDP Act Compliance

Kavach specifically addresses requirements under:

- **Section 8**: Obligations of Data Fiduciary — prevents unauthorized data processing
- **Section 9**: Significant Data Fiduciary — provides audit trails for data audits
- **Section 15**: Breach Notification — maintains complete incident records

Generate compliance PDFs from the dashboard or API:
```bash
curl -O http://localhost:8888/api/compliance/pdf
```

---

## 📁 Project Structure

```
netrika-trace/
├── agents/          # LangGraph pipeline nodes
├── pii/             # PII/NER/semantic detection
├── simulation/      # Breach simulator + Jinja2 templates
├── proxy/           # Mitmproxy addon
├── server/          # aiohttp API + WebSocket server
├── dashboard/       # Streamlit admin UI
├── reports/         # ReportLab PDF builders
├── db/              # SQLAlchemy models + CRUD
├── frontend/        # React + Vite dashboard (SOC UI)
└── tests/           # Unit tests + sample payloads
```

---

## ⚖️ Privacy by Design

- Payload text is processed in memory by the configured detectors. New incidents store entity types and counts, metadata, and a SHA-256 payload hash; the raw-text preview field is left empty.
- A SHA-256 hash is not anonymization and may be vulnerable to guesses for predictable payloads.
- Existing database rows created before preview removal may still contain raw text. Back up the database, inspect and sanitize those rows before using an existing database in production.
- No automatic retention or deletion policy is configured. Do not describe this deployment as zero-retention.
- External LLM use depends on configuration; do not send confidential data to a hosted model unless explicitly authorized.

## Monitoring behavior and dashboard data

- The dashboard request totals and traffic chart use the selected rolling UTC window (1 hour, 24 hours, 7 days, or 30 days) and persisted incident records. Detection types and endpoint counts remain all-time.
- Model metrics appear only on Model Evaluation when records exist. The evaluation API requires explicit labeled `y_true` and `y_pred` arrays; it calculates metrics for those submitted labels and does not run the live detector against a dataset itself.
- Dashboard metrics come from `/api/v1/analytics/stats`, endpoint totals from `/api/v1/analytics/endpoints-stats`, incidents from `/api/v1/incidents`, and evaluation records from `/api/v1/eval/latest`.
- The React chat scans PDF, DOCX, TXT, and CSV uploads up to 10 MB through `/api/chat/upload/scan`, then requests a summary from `/api/chat/upload/respond`. Incident detail supports saving review notes; edits are persisted through the authenticated incident API.
- Docker Compose starts the mitmproxy service on port `8080` as well as the API and UI. Install its CA certificate in a test browser before inspecting HTTPS traffic.
- The mitmproxy addon only analyzes POST requests to registered AI endpoints. A BLOCK decision replaces the upstream response with a redirect. WARN attempts banner insertion only for HTML responses. Pipeline errors fail open, so a request may be forwarded if analysis fails.
- `/api/analyze` is an analysis endpoint: it returns a decision but does not itself enforce that decision on another outbound request.

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.
