# Verification Notes

Review date: 2026-10-29. Method: read the source files named below, traced calls across modules, and ran the safe checks listed in section 4. Nothing in the application was modified, no database was reset, and no secret values are reproduced. `VERIFIED` means confirmed by reading the code or by a test run in this review. `UNVERIFIED` means it could not be checked here.

## 1. Claims and their supporting references

| # | Claim in the documentation | Supporting reference | Status |
|---|---|---|---|
| 1 | The pipeline has five nodes and one conditional edge after the decision | `agents/graph.py::build_graph` | VERIFIED |
| 2 | The sniffer leaves `payload_preview` empty; `create_incident` forces `""` | `agents/sniffer_node.py`, `database/crud.py::create_incident` | VERIFIED |
| 3 | Risk formula: weighted sum, `+code_boost` (20), `+30` secrets, `+30` if PII score ≥ 0.9, cap 100 | `pii/risk_calculator.py::calculate`, `config.json` | VERIFIED |
| 4 | Shipped weights are 1.0, 0.0, 0.0; thresholds 70 and 40 | `config.json` | VERIFIED |
| 5 | Docstrings and notes claim weights 0.5, 0.2, 0.3 and thresholds 67 and 30; the code and config disagree | `risk_calculator.py` docstring, `information.txt`, `project_description.txt`, `EnterprisePolicy` defaults | VERIFIED (documentation drift) |
| 6 | Entity (NER) score is always 0.0 | `pii/spacy_ner.py::compute_entity_score` | VERIFIED |
| 7 | Semantic scorer runs only outside the fast path and has weight 0, so it only sets `intent_label` | `forensic_node.py`, `semantic_scorer.py`, `config.json` | VERIFIED |
| 8 | Decision order: extension/upload entities, scanner BLOCK, thresholds, scanner WARN upgrade | `agents/decision_node.py` | VERIFIED |
| 9 | Fast path skips intervention for `chat-upload`, `extension*`, `browser-extension*` | `decision_node.py::should_intervene` | VERIFIED |
| 10 | Scanner failure makes the forensic node return BLOCK | `forensic_node.py` (`scan is None`) and `tests/test_scanner_safety.py` | VERIFIED (code); test passed in this review |
| 11 | The Ollama prompt contains only type names and counts | `agents/intervention_node.py` | VERIFIED (code); Ollama itself UNVERIFIED |
| 12 | Chat replies are mocked | `agents/llm_service.py::chat_with_llm`, `_get_mock_response` | VERIFIED |
| 13 | Gate requires sign-in for `/api/chat*`, scans `POST /api/chat`, returns 422 on BLOCK | `backend/scanner_gate.py` | VERIFIED (code); `test_scanner_gate.py` not runnable here |
| 14 | Gate records `user_id` from the wrong dict key (`sub` or `user_id` instead of `id`) | `scanner_gate.py::_record_block`, `rbac.py::get_current_user_from_request` | VERIFIED (by reading) |
| 15 | Pipeline incidents are created without `org_id`, `user_id`, `device_id`, so org-scoped lists would exclude them | `logger_node.py`, `database/crud.py::get_recent_incidents` | VERIFIED (code); runtime effect UNVERIFIED |
| 16 | `latency_ms` is not set by the logger node | `logger_node.py::create_incident(...)` call | VERIFIED |
| 17 | The extension stores policy but content scripts do not use threshold, keyword or domain fields | search of `extension/content.js`, `injected_script.js` | VERIFIED (search found none); deeper behaviour UNVERIFIED |
| 18 | The pipeline does not read `enterprise_policies` | search for `get_active_policy_for_org` outside routes and CRUD | VERIFIED |
| 19 | `AIEndpointRegistry` reads `config.json` then defaults, never the database | `proxy/ai_endpoints.py::_load_endpoints` | VERIFIED |
| 20 | Hand-written HS256 JWT; no `type` check on access; PBKDF2 100,000 iterations; hard-coded fallback secret | `backend/auth/security.py`, `rbac.py` | VERIFIED |
| 21 | `/api/v1/analyze`, policy GET, extension-sync, register-device and WebSockets do not enforce a token | `backend/main.py`, `policy_routes.py`, `auth_routes.py`, `broker.py` | VERIFIED |
| 22 | CORS allows `*` | `backend/main.py::cors_middleware` | VERIFIED |
| 23 | Celery tasks and Slack/Teams notifier are never called | search for call sites | VERIFIED |
| 24 | Primary server does not start the Redis listener; legacy server does | `server/intervention_server.py::start_background_tasks`; `backend/main.py` has none | VERIFIED |
| 25 | `reports/` is git-ignored but exists locally | `.gitignore` line 8, `git check-ignore`, `ls reports` | VERIFIED |
| 26 | Routes in section 5.2 of the document are registered in `backend/main.py::create_app` | direct reading | VERIFIED |
| 27 | `/api/analyze/file`, `/api/analyze/file/fast`, `/incident/{id}`, `/api/endpoints*` exist only in the legacy server | `server/intervention_server.py::create_app` vs `backend/main.py` | VERIFIED |
| 28 | Scanner has 85 format rules | `json.load(scanner/rules/formats.json)` count | VERIFIED |
| 29 | Scanner evaluation figures (4,045 samples, 98.64 percent recall, 99.02 percent precision, 1.00 percent false alarms, p50 0.45 ms, p95 20.61 ms) | `scanner/eval/REPORT.md` | VERIFIED as quoted from the report; not regenerated here; the report is on a synthetic corpus |
| 30 | Ten database tables with the columns listed | `database/models.py` | VERIFIED |
| 31 | Default database is SQLite; PostgreSQL in Docker; pool settings | `database/session.py`, `docker-compose.yml` | VERIFIED |
| 32 | Docker Compose services and ports | `docker-compose.yml` | VERIFIED (file); not started |
| 33 | Extension manifest uses a MAIN-world script at `document_start` | `extension/manifest.json` | VERIFIED |
| 34 | The DPDP section labels in the project may not match the Act | `reports/dpdp_template.py`, `frontend/src/pages/Reports.tsx` vs reviewer's knowledge of the Act | UNVERIFIED: check the official text |

## 2. Unresolved questions

1. Does Ollama with `phi3:mini` work on the target machine? Not tested.
2. Does the extension behave correctly on the current ChatGPT, Gemini and Claude pages? Not tested; sites change.
3. Does mitmproxy interception work end to end with the CA installed, and does `netrika-trace.internal` resolve? Not tested.
4. Is the organisation-scoping gap (finding 15) visible in the running dashboard for an ORG_ADMIN? Reasoned from the code, not reproduced.
5. Does `docker compose up` start cleanly? The backend service uses `postgresql://` while the proxy uses `postgresql+psycopg://`; whether the plain URL resolves to an installed driver was not checked.
6. Is `docs/openapi.yaml` in sync with the routes? Not compared.
7. What does each Streamlit page actually render? `dashboard/app.py` was only outlined.
8. Who wrote which part? The repository shows one author identity; contribution claims were left for the student to fill in.

## 3. Limitations of this review

* The two API test files (`test_enterprise_api.py`, `test_scanner_gate.py`) could not be imported on this machine because Windows Application Control blocked a compiled SQLAlchemy library. This was not bypassed, so their results are not claimed for this run.
* Accuracy figures are from the project's own synthetic corpus and describe the detectors, not real-world traffic.
* No performance, load or penetration testing was done.
* The frontend was examined through its routes, hooks and build results, not by reading every component.

## 4. Checks that were run

| Check | Result |
|---|---|
| `pytest tests` (temporary SQLite database and scanner key, 6 of 8 files importable) | 92 run, 90 passed, 2 failed (`test_detects_env_variables`; `test_eval_thresholds_hold` on p95 latency 89.7 ms against a 50 ms gate under load) |
| `vitest run` | 9 of 9 passed |
| `tsc --noEmit` | clean |
| `eslint src` | clean |
| `vite build` | succeeded |
| Count of formats in `formats.json` | 85 |
| Git history | 15 commits, one author identity |

## 5. Items marked partial, planned or mocked

| Item | Why |
|---|---|
| AI chat reply | Mocked |
| Semantic scoring | Computed but weight 0 |
| Policy screen | Stored and pushed; not consumed |
| Reports | Work only where the git-ignored `reports/` folder exists |
| Celery tasks, Slack/Teams | Defined, not wired |
| Real-site extension behaviour, TLS interception, Ollama, Docker | Not verified |
