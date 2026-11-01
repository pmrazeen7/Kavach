# Part 9: Presentation Preparation

## 9.1 The 30-second introduction

"Employees paste company secrets into ChatGPT without thinking: code, customer IDs, passwords. Our project, Kavach, is a gateway that checks everything before it leaves. A Chrome extension and a network proxy send the text to a Python pipeline that detects Indian IDs, secrets, code, and even unlabelled random passwords, and then allows, warns or blocks. It never stores the secret, only the type and count, and security staff see it all on a live dashboard."

## 9.2 The 2-minute explanation

1. **Problem (20 s).** Generative AI is useful but a data leak channel. Firewalls cannot read content; keyword DLP misses unlabelled secrets; annual training does not help at the moment of risk.
2. **Solution (30 s).** Two interceptors, one brain. The extension sees text, pastes and file uploads in the browser; the mitmproxy gateway sees traffic to AI hosts from any app. Both call the same LangGraph pipeline.
3. **Pipeline (30 s).** Sniffer, forensic, decision, intervention, logger. The forensic node runs Presidio with Indian patterns, spaCy, a code and secrets detector and our layered scanner. A risk score from 0 to 100 and a few explicit rules give ALLOW, WARN or BLOCK.
4. **Privacy and learning (20 s).** The log stores a hash, type names and counts, never values. For a block, a local LLM writes a short breach story from type names only, so the employee learns why.
5. **Dashboard and honesty (20 s).** Live incident feed, review workflow, reports for the DPDP Act. It is a working prototype: tested on synthetic data, the chat reply is a mock, and a few features are defined but not wired.

## 9.3 The 5-minute technical walkthrough

| Time | Topic | What to show or say |
|---|---|---|
| 0:00 | Architecture | Diagram 2.1: two doors, one pipeline, DB, Redis, WebSocket, dashboard |
| 0:45 | Pipeline | Diagram 3.3 and `agents/graph.py`: five nodes, one conditional edge; the fast path |
| 1:30 | Detection | `pii/presidio_analyzer.py` patterns; `agents/code_detector.py` secrets; NER only for audit; risk formula 3.7 |
| 2:15 | Scanner | Layers 0 to 7 (3.9); the `xyzwudguwd` example; entropy and trigram intuition; fingerprints with HMAC |
| 3:15 | Enforcement | `scanner_gate.py`: server re-scan, HTTP 422; fail-closed |
| 3:45 | Privacy | Logger writes types and counts; `payload_preview` empty; tests that assert it |
| 4:15 | Data and API | Tables `incidents` and `entity_detections`; JWT and RBAC; WebSocket live feed |
| 4:45 | Limits | Synthetic evaluation; mock chat reply; policy not yet consumed; security gaps in 7.4 |

## 9.4 Explaining the architecture diagram (script)

"Start at the top. The employee uses a browser or an app. In the browser, our Chrome extension hooks the page; for everything else, the traffic passes through the mitmproxy gateway on port 8080. The extension calls the backend on port 8888; the proxy calls the same pipeline function directly. Chat messages from our sandbox also pass through a gate that scans again on the server. The pipeline uses four detector families and the layered scanner. It writes an incident to the database and publishes a live event; the WebSocket broker pushes it to the React dashboard. The dashboard calls REST endpoints with a JWT for history, reports and settings."

## 9.5 Suggested live-demo sequence

Prepare first: start the backend (`python backend/main.py`), build or run the frontend (`npm run dev` in `frontend/`, or serve `frontend/dist` from the backend), sign in with the seeded admin account described in `seed_enterprise_defaults` (do not show the password on screen), and have the extension loaded unpacked from `extension/`. Keep Ollama off unless you tested it; the fallback story appears instead. Rehearse once, because browsers and AI sites change.

1. **Dashboard** (30 s): show stats, charts and the live feed, empty or with seeded incidents.
2. **Safe message** in the Chat page: "What is the capital of India?" Status shows safe; reply is a mock (say so).
3. **Bare token:** type `xyzwudguwd`. The scanner underlines or masks it, the chip says Blocked and Send is locked. Open the findings drawer and show the reason. Use *Mark as safe* or *Allow once* only to show the confirmation flow.
4. **Aadhaar and secrets:** paste a made-up Aadhaar-shaped number and a fake `AKIA` key. Show REDACT or TOKENIZE and the placeholder restore on a reply.
5. **Server gate:** with `curl`, call `/api/chat` with a token but a secret in the message and show the 422 `blocked_by_policy`. This proves it is not only a UI check.
6. **Pipeline from the command line:** run `demo.sh` (it posts to `/api/analyze`) and read the three results: safe, PII, code with secrets.
7. **Live feed:** the incidents from steps 3 to 6 appear on the dashboard; open one and show entity types, count, hash and no raw value; mark it reviewed.
8. **Reports:** export CSV and the DPDP PDF (only if `reports/` is present, see 7.3).
9. **Extension (optional):** on a test page (`extension/test.html`) pick `test_sensitive.txt` and show the scanning overlay and blocked screen.
10. **Close** with the limitations slide.

**Use only fake data**: never real Aadhaar, PAN or keys.

## 9.6 Likely faculty questions during the demo

| Question | Short answer |
|---|---|
| Is that a real ChatGPT reply? | No. The reply is a mock. The scanning, blocking and logging are real. |
| What if I type the key in pieces? | Layer 0 collapses spaced characters and joins wrapped lines, and the server also scans the last 6 messages of the session; a deliberately split paraphrase can still evade. |
| What if I base64 it? | Layer 0 decodes it and the decoded view is scanned. |
| Can I just disable the extension? | Yes on an unmanaged device; the proxy is the second layer. |
| Why did that harmless word get flagged? | The bare-token model is statistical; ambiguous tokens block until confirmed; we measured about 1 percent false alarms on our corpus. |
| Where is the data stored? | SQLite by default or PostgreSQL; only metadata. |
| Show me the code for the decision. | `agents/decision_node.py::decision_node` and `pii/risk_calculator.py::calculate`. |
| What happens if Redis is down? | The logger warns and carries on. |
| Is it production ready? | No; see 7.4 and 7.7. |

## 9.7 Honest explanation of limitations and future work (30 seconds)

"It is a strong prototype with measured but synthetic accuracy. The chat sandbox uses a mock model. The policy screen stores settings but the pipeline reads a config file. Authentication has gaps I have documented. Next steps are fixing tenant tagging, wiring policy end to end, hardening authentication, adding migrations and measuring on real, consented data."

---

# Glossary

| Term | Meaning |
|---|---|
| **Shadow AI** | Use of AI tools that the organisation has not approved or cannot see |
| **DLP** | Data Loss Prevention: tools that stop sensitive data leaving |
| **PII** | Personally Identifiable Information |
| **Aadhaar, PAN, UPI, IFSC** | Indian 12-digit identity number, tax ID, payment address, bank branch code |
| **DPDP Act 2023** | India's Digital Personal Data Protection Act |
| **LangGraph** | A library that runs a graph of steps sharing one state |
| **Node / edge / conditional edge** | A step / the link to the next step / a link chosen by a function |
| **Presidio** | Microsoft's open-source PII detection engine |
| **NER** | Named Entity Recognition: tagging names, organisations, places |
| **Embedding** | A list of numbers representing the meaning of text |
| **Cosine similarity** | A measure of how close two embeddings are |
| **Regex** | Regular expression: a pattern to match text |
| **Entropy** | Measure of randomness; high for random keys |
| **Logistic regression** | A simple model that outputs a probability from weighted features |
| **Trigram** | A sequence of three characters or words |
| **Noisy-OR** | A way to combine independent evidence into one probability |
| **HMAC** | A hash that uses a secret key |
| **Fingerprint** | A keyed hash that identifies a secret without storing it |
| **Canary** | A planted fake secret that raises an alert when seen |
| **REDACT / TOKENIZE** | Mask a value / replace it with a reversible placeholder |
| **Fail closed / fail open** | Refuse when a check cannot run / allow when it cannot run |
| **Proxy / mitmproxy** | An intermediary for traffic / a scriptable HTTPS interception proxy |
| **TLS interception** | A proxy re-signing HTTPS so it can read it; needs a trusted CA |
| **Manifest V3** | Chrome's current extension platform |
| **Service worker** | Event-driven background script of an extension |
| **Content script (MAIN / isolated world)** | Extension script that runs inside the page's JS context / in a separate context |
| **JWT** | Signed token with header, claims and signature |
| **PBKDF2** | A password hashing function that repeats a hash many times with a salt |
| **RBAC** | Role-Based Access Control |
| **Multi-tenancy** | Several organisations sharing one system, with separated data |
| **ORM** | Object-Relational Mapper (SQLAlchemy) |
| **Primary / foreign key** | Unique row identifier / reference to another table's row |
| **Index** | A structure that speeds up lookups |
| **Pub/sub** | Publishers send to channels; subscribers receive live |
| **WebSocket** | A persistent two-way connection |
| **Celery** | A task queue for background jobs |
| **Ollama / phi3:mini** | Local LLM runner / a small language model |
| **Parity test** | A test that two implementations give the same answers |
| **Precision / recall / F1** | Share of alerts that were right / share of real cases caught / their harmonic mean |
| **Vite / Tailwind / Zustand / TanStack Query** | Front-end build tool / utility CSS / small state store / data-fetching cache |

---

# Appendix A: Implementation references

| Topic | Where to look |
|---|---|
| Pipeline wiring | `agents/graph.py::build_graph`, `run_pipeline` |
| Decision rules | `agents/decision_node.py::decision_node`, `should_intervene` |
| Risk formula | `pii/risk_calculator.py::RiskCalculator.calculate`; weights in `config.json` |
| Indian IDs | `pii/presidio_analyzer.py` (`_create_indian_recognizers`, `compute_pii_score`) |
| Code and secrets | `agents/code_detector.py` (`SECRET_PATTERNS`, `CODE_PATTERNS`, `analyze`) |
| Semantic | `pii/semantic_scorer.py` |
| Scanner engine | `scanner/engine.py::Scanner.scan`; decision `scanner/decision.py`; facade `scanner/service.py` |
| Gate | `backend/scanner_gate.py::scanner_gate` |
| Auth | `backend/auth/security.py`, `rbac.py`, `backend/api/auth_routes.py` |
| Incident API | `backend/api/incident_routes.py` |
| Analytics | `backend/api/analytics_routes.py`; queries in `database/crud.py` |
| Live feed | `backend/websocket/broker.py`; `frontend/src/hooks/useWebSocket.ts` |
| Proxy | `proxy/addon.py::NetrikaTraceAddon` |
| Extension | `extension/injected_script.js`, `content.js`, `background.js`, `paste_guard.js` |
| Frontend routes | `frontend/src/App.tsx` |
| Compose | `docker-compose.yml`, `Dockerfile` |

# Appendix B: Additional questions for self-practice

1. Draw the decision flowchart from memory and place the fast path on it.
2. Explain why `entity_weight` is 0 and what would break if it were 0.3.
3. Show how a secret split across two chat messages is caught, and where it still fails.
4. Compare REST, WebSocket and Server-Sent Events for the live feed.
5. Explain the difference between a content script in the MAIN world and one in the isolated world.
6. If two backend instances ran, what would go wrong with the live feed and with chat sessions, and how would Redis help?
7. Explain how you would add Alembic migrations to the existing database.
8. Why is a hash of a short secret not safe, and how does HMAC help?
9. How would you prove to an auditor that no raw secret is stored?
10. Propose three metrics to monitor in production (for example block rate, false-positive appeals, p95 latency) and say how each would be computed from the `incidents` table.
11. What would you change so that policy edits actually change decisions?
12. What would the tenant fix and its regression test look like?
