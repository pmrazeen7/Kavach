# Part 1: Project Overview

## 1.1 How to read this document

This document explains the project in the same spirit as the Sentinel reference: first in plain language, then in technical depth, then as questions and answers you can speak in a viva.
Every section is built from the actual source code in the project folder, not from the README alone. Where the README or the older design notes disagree with the code, this document follows the code and says so (see Part 7 and `VERIFICATION_NOTES.md`).

Status tags used throughout:

| Tag | Meaning |
|---|---|
| **[Implemented]** | The code exists and its logic was traced end to end. |
| **[Partial]** | Some of the behaviour exists; the gap is stated. |
| **[Mocked]** | The code path exists but returns canned or simulated output. |
| **[Defined, not wired]** | The function exists but nothing in the application calls it. |
| **[Unverified]** | It could not be checked in this review (for example, it needs a real browser, a real AI site or a running Ollama). |

## 1.2 Project title and abstract

**Title:** Kavach (code name *Netrika-Trace*): an Autonomous Agentic Shadow-AI Gateway.

The product name shown in the web interface is now **Kavach** ("shield" in Hindi and Sanskrit). The repository, the Python code, the logs, the database file and the older documents still use the name **Netrika-Trace**. They are the same system. This document uses *Kavach* for the product and *Netrika-Trace* when it quotes file names or code.

**Abstract.** Employees increasingly paste confidential material into public AI tools such as ChatGPT, Gemini and Claude: source code, customer records, database passwords and Aadhaar numbers. Once sent, that data leaves the company's control. Kavach sits between the employee and the AI service and checks what is about to leave. It works in two places: a **network proxy** (mitmproxy) that inspects traffic to a list of AI domains, and a **Chrome extension** that inspects text, pasted content and file uploads inside the browser. Both send the text to a Python backend that runs a **five-node LangGraph pipeline**. The pipeline detects personal data (Microsoft Presidio with Indian-specific patterns), named entities (spaCy), source code and secrets (regular expressions and Pygments), and meaning-level risk (sentence-transformer similarity). On top of that, a **layered scanner** written for this project catches unlabelled random tokens, encoded or disguised secrets and fingerprints of the company's real secrets. The result is an **ALLOW, WARN or BLOCK** decision. Every decision is logged as metadata only (never the raw secret) and shown in a React security dashboard with live updates, reports and role-based access.

## 1.3 The problem, in simple words

Imagine a bank clerk who wants to fix a bug. They copy 200 lines of code, including a database password, into ChatGPT and press Enter. The password is now on a server the bank does not control. Nobody notices until much later, if ever.

Three things make this hard to stop:

1. **Firewalls are blunt.** A firewall can only block ChatGPT completely, which hurts productivity. It cannot read the *content* of a request.
2. **Old DLP tools are keyword based.** They miss a password typed as `xyzwudguwd` with no label, and they miss data hidden in a PDF or encoded in base64.
3. **Training is passive.** Annual slides do not stop someone at the exact moment they make the mistake.

Kavach's answer: look at the content at the moment of sending, decide automatically, explain the decision, and keep a privacy-safe audit trail that supports India's Digital Personal Data Protection (DPDP) Act 2023.

## 1.4 Existing approach versus the proposed solution

| Aspect | Typical existing approach | Kavach |
|---|---|---|
| Where it checks | Network edge only, by domain | Network proxy **and** browser extension (typed text, paste, drag-and-drop, file picker) |
| What it understands | Keywords and a few regular expressions | Presidio PII, Indian IDs (Aadhaar, PAN, UPI, IFSC), NER, code and secret patterns, semantic similarity, **and** a layered scanner for unlabelled tokens and encodings |
| Response | Allow or block | ALLOW, WARN, BLOCK; the scanner can also REDACT or TOKENIZE (swap a secret for a reversible placeholder) |
| Privacy of the audit log | Often stores the leaked text | Stores types, counts, a SHA-256 hash and a size; the 200-character preview field exists but the sniffer node deliberately leaves it empty |
| User learning | None | A local-LLM "breach story" (Ollama, phi3:mini) built from sanitized type names only |
| Compliance | Manual | DPDP-oriented PDF and CSV reports from the audit tables |

## 1.5 Objectives and scope

**Objectives**

1. Detect sensitive data in AI-bound requests before it leaves the organisation.
2. Decide ALLOW, WARN or BLOCK from a transparent risk score and explicit policy rules.
3. Work both at network level and in the browser.
4. Keep raw secrets out of logs, the database, the dashboard and the local LLM prompt.
5. Give security staff a multi-tenant dashboard with roles, incident review and exportable reports.
6. Give employees an in-browser experience that explains what was found and how to fix it.

**In scope:** text prompts, JSON API bodies, pasted text, `.txt`, `.csv`, `.pdf`, `.docx` uploads (and `.json`, `.zip` in the scanner file reader), images through in-browser OCR in the chat sandbox, the model's reply in the sandbox and in the proxy.

**Out of scope or not done:** blocking at the operating-system level, mobile devices, non-Chrome browsers, streamed (SSE) AI replies in the proxy, and a real LLM behind the chat sandbox (it is mocked, see 3.10).

## 1.5.1 Target users and use cases

| User | What they do with the system |
|---|---|
| **Employee** | Uses AI tools as normal; sees overlays when something is blocked, warned or redacted. |
| **SOC analyst** | Watches the live feed, filters incidents, reviews them, exports CSV or PDF. |
| **Organisation admin** | Edits policy, manages devices and users, views analytics. |
| **Super admin** | Sees every organisation. |
| **Compliance officer** | Downloads the DPDP compliance report. |

Typical use cases: stop an Aadhaar number from going into a chatbot; stop an AWS key pasted into a prompt; stop a `.env` file from being uploaded; teach the employee why with a short breach story; give auditors a record that the attempt was caught.

## 1.6 Major features and their current status

| # | Feature | Where | Status |
|---|---|---|---|
| 1 | Network proxy for AI domains | `proxy/addon.py`, `proxy/run_proxy.py` | **[Implemented]** code traced; live HTTPS interception **[Unverified]** |
| 2 | Chrome extension (fetch/XHR hook, paste guard, file uploads) | `extension/` | **[Implemented]**; behaviour on real AI sites **[Unverified]** |
| 3 | LangGraph 5-node pipeline | `agents/` | **[Implemented]** |
| 4 | PII detection with Indian patterns | `pii/presidio_analyzer.py` | **[Implemented]** |
| 5 | NER with spaCy | `pii/spacy_ner.py` | **[Implemented]**, audit only |
| 6 | Code and secrets detection | `agents/code_detector.py` | **[Implemented]**; one unit test fails (see 7.1) |
| 7 | Semantic similarity scoring | `pii/semantic_scorer.py` | **[Partial]**: computed, but its weight in the score is 0 in `config.json` |
| 8 | Risk score and decision policy | `pii/risk_calculator.py`, `agents/decision_node.py` | **[Implemented]** |
| 9 | Layered scanner (bare tokens, decoding, fingerprints) | `scanner/`, `frontend/src/scanner/` | **[Implemented]**, measured on a synthetic corpus |
| 10 | Server-side enforcement gate for chat | `backend/scanner_gate.py` | **[Implemented]** |
| 11 | Chat sandbox with document upload | `server/intervention_server.py`, `frontend/src/pages/Chat.tsx` | **[Implemented]** UI and DLP; the AI reply is **[Mocked]** |
| 12 | Breach simulation with local LLM | `agents/intervention_node.py` | **[Implemented]** with static fallback; Ollama itself **[Unverified]** |
| 13 | Audit logging (metadata only) | `agents/logger_node.py`, `database/` | **[Implemented]** |
| 14 | Authentication, RBAC, multi-tenancy | `backend/auth/`, `backend/api/auth_routes.py` | **[Implemented]** with security caveats (7.4) |
| 15 | React SOC dashboard with live feed | `frontend/` | **[Implemented]** |
| 16 | Reports: incident PDF, DPDP PDF, CSV | `reports/`, `backend/api/` | **[Partial]**: `reports/` is git-ignored (7.3) |
| 17 | Policy management and extension sync | `backend/api/policy_routes.py`, `extension/background.js` | **[Partial]**: stored and pushed, but not applied by the pipeline (3.15) |
| 18 | Email, Slack and Teams alerts | `utils/mailer.py`, `backend/services/notifier.py` | Email **[Implemented]** (needs SMTP); Slack/Teams **[Defined, not wired]** |
| 19 | Background workers (Celery) | `workers/` | **[Defined, not wired]** |
| 20 | Model evaluation endpoint | `backend/api/eval_routes.py` | **[Implemented]** (computes metrics from submitted labels) |
| 21 | Streamlit admin panel | `dashboard/app.py` | **[Implemented]** as legacy; not exercised in this review |
| 22 | Docker Compose deployment | `docker-compose.yml`, `Dockerfile` | **[Implemented]** as configuration; not run in this review |

## 1.7 Technologies and their roles

| Layer | Technology (version from the project files) | Role |
|---|---|---|
| Language | Python 3.11 (Dockerfile; local run used 3.11.9), TypeScript 5, JavaScript | Backend, frontend, extension |
| Web server | aiohttp ≥ 3.9 | Async HTTP API, static files, WebSockets |
| Orchestration | LangGraph ≥ 0.2, langchain-core ≥ 0.3 | Five-node state machine |
| PII | presidio-analyzer / anonymizer ≥ 2.2 | Detects credit cards, SSN, IBAN and custom Indian IDs |
| NLP | spaCy ≥ 3.7 (`en_core_web_sm`) | Named entity recognition |
| Embeddings | sentence-transformers ≥ 2.2, `all-MiniLM-L6-v2`, torch ≥ 2.1 | Semantic similarity |
| Code detection | Pygments ≥ 2.17 plus regex | Source code and secret detection |
| Proxy | mitmproxy ≥ 10 | Intercepts HTTPS to AI hosts |
| Local LLM | Ollama ≥ 0.3, `phi3:mini` | Breach stories |
| Database | SQLAlchemy ≥ 2.0; SQLite (default) or PostgreSQL 15 (Docker) | Audit and tenancy tables |
| Cache and events | Redis 7, redis-py ≥ 5 | Publish/subscribe of incidents |
| Background jobs | Celery ≥ 5.3 | Defined PDF and webhook tasks |
| Auth | Hand-written HS256 JWT, PBKDF2-HMAC-SHA256 | Login and tokens |
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3, Framer Motion 11, Recharts 2, TanStack Query 5, Zustand 4, React Router 6 | SOC dashboard, chat sandbox, landing page |
| Browser OCR | tesseract.js 5 | Reads text from images in the browser |
| Extension | Chrome Manifest V3 | Hooks and overlays |
| Reports | ReportLab ≥ 4 | PDF reports |
| Admin UI | Streamlit ≥ 1.35, Plotly | Legacy panel |
| Tests | pytest ≥ 7.4, pytest-asyncio, vitest 2 | Python and TypeScript tests |

## 1.8 My contribution

The repository history (15 commits, all under one GitHub identity, `pmrazeen7`) does not by itself show who wrote which module, and this review has no other evidence about a team split. **Fill the table below with what you can truthfully explain**, because an examiner will probe it.

| Area | Evidence in the repository | What you should be able to explain |
|---|---|---|
| Core pipeline (LangGraph nodes, Presidio, NER, risk score) | Present from the first commits | Every step in Part 3, sections 3.3 to 3.8 |
| Enterprise upgrade (auth, RBAC, multi-tenant DB, extension, Docker) | Present in the models and routes | Sections 3.13 and 3.16 |
| Frontend redesign | Commits from 2026-10-23 and 2026-10-24 | Part 3.14 |
| Layered scanner, server gate, evaluation harness | Latest commits on the `scanner-engine` branch | Section 3.9; read `scanner/README.md` |

**Honest note for the viva:** the layered scanner, the browser scanner, the evaluation harness and the 2026 frontend redesign were produced in recent working sessions with an AI coding assistant. Be ready to explain how they work in your own words, to say which parts you reviewed and tested, and to give the exact limitations in Part 7. Examiners respect a clear, accurate account far more than a claim of full ownership.
