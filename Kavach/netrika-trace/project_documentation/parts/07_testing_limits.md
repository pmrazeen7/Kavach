# Part 7: Testing, Reliability, and Limitations

## 7.1 Tests that exist and what they establish

| File | Tests | What it covers | What it establishes (and does not) |
|---|---|---|---|
| `tests/test_code_detector.py` | 16 | Secrets (AWS key, private key, JWT, database URL, env variables), code patterns, safe text, a sample payload file | Regexes behave on short examples. Does not prove real-world recall |
| `tests/test_forensic.py` | 15 | Aadhaar with and without spaces, invalid Aadhaar prefixes, PAN, UPI, IFSC, safe text, empty text, no raw values in results | The Presidio wrapper's patterns and the no-values rule |
| `tests/test_risk_calculator.py` | 11 | Weighted calculation, boosters, cap at 100, thresholds, explanation | The score formula, using the shipped `config.json` |
| `tests/test_enterprise_api.py` | 11 | Login, device registration, unauthorised access, health, extension block policy, upload routes, analyze endpoint, evaluation input validation | The HTTP layer with an in-process test client |
| `tests/test_scanner_engine.py` | 26 | Validators, bare tokens, evasions, homoglyphs, cross-message, fingerprints, profiles, tokenize and redact, file reading, backtracking and latency | The scanner's behaviour on designed cases |
| `tests/test_scanner_gate.py` | 9 | Sign-in required, a secret never reaches the model through the raw API, bare token blocked, confirm once, masked results, settings, ingest confined to the project root, rewrite before the model | Server enforcement |
| `tests/test_scanner_safety.py` | 6 | Fail-closed pipeline, nothing secret logged, state has no values, proxy masks replies, output scanning switch | Privacy and safety rules |
| `tests/test_scanner_eval.py` | 2 | Evaluation thresholds hold; corpus deterministic | Recall, false-alarm and latency gate on a synthetic corpus |
| `frontend/src/scanner/parity.test.ts`, `perf.test.ts` | 9 | TypeScript and Python engines agree; speed | Cross-language parity |

### Verified results from this review (2026-10-29)

* **Python:** `pytest tests` with a temporary database and scanner key (no project data touched). The two files `test_enterprise_api.py` and `test_scanner_gate.py` could not even be imported on this machine, because Windows Application Control blocked a compiled SQLAlchemy DLL (`_util_cy`). That is an environment restriction, not a code failure, and it was not bypassed. For the other six files: **92 tests ran, 90 passed, 2 failed.**
  * `test_code_detector.py::test_detects_env_variables` fails: the test expects the type name `ENV_VARIABLE` from `detect_secrets` and gets nothing. A known, pre-existing failure.
  * `test_scanner_eval.py::test_eval_thresholds_hold` failed on p95 latency (89.7 ms against a 50 ms limit) while the machine was busy. The project's own report records p95 of about 20.6 ms; treat this as a timing-sensitive test that can fail on a loaded machine (**not investigated further**).
* **The 20 tests in the two blocked files** passed in earlier development sessions on this project, but they were **not re-run in this review**, so no pass is claimed for them here.
* **Frontend:** `vitest run` 9 of 9 passed; `tsc --noEmit` clean; `eslint src` clean; `vite build` succeeded.

### Important untested areas

* Real HTTPS interception through mitmproxy and certificate trust.
* The extension on real AI websites (only a simulated paste on localhost was tried), and its behaviour when sites change their requests.
* Ollama and `phi3:mini` generation.
* Docker Compose start-up, PostgreSQL behaviour, Redis pub/sub in a deployed setting, Celery.
* Email delivery (needs SMTP).
* PDF report generation in a clean clone (see 7.3).
* Concurrency, load and long-running behaviour.
* Detection accuracy on real company data; the numbers in 3.9 come from a synthetic corpus.

## 7.2 Known bugs and incomplete functionality (found by reading the code)

| # | Finding | Where | Effect |
|---|---|---|---|
| 1 | Pipeline-created incidents have no `org_id` | `agents/logger_node.py` calls `create_incident` without `org_id`, `user_id`, `device_id` | Non-super-admin users filtered by `org_id` would not see them (**[Unverified]** at runtime) |
| 2 | The gate looks up `user.get("sub")` or `user.get("user_id")`, but the authenticated dict uses the key `id` | `backend/scanner_gate.py::_record_block` | Blocked-chat incidents are stored without `user_id` |
| 3 | `payload_preview` is overwritten with `""` in `create_incident` | `database/crud.py` | Consistent with the privacy design, but the column and the README's "200-character preview" claim are misleading |
| 4 | `latency_ms` is never set by the logger node | `agents/logger_node.py` | Stored latency is 0 for pipeline incidents; analytics averages are therefore not meaningful |
| 5 | Policy thresholds in the database and in `config.json` disagree and only `config.json` is used | `agents/decision_node.py` | The Policy screen changes nothing about decisions |
| 6 | The extension stores the policy but its content scripts never read it | `extension/` | Same as above for the browser |
| 7 | `AIEndpointRegistry` ignores the database | `proxy/ai_endpoints.py` | Adding a host through the endpoints API (legacy server) does not affect the proxy |
| 8 | Chat model is a mock | `agents/llm_service.py` | Demo replies are canned |
| 9 | Celery tasks and Slack/Teams notifier are never called | `workers/`, `backend/services/notifier.py` | Features exist only on paper |
| 10 | The primary server does not subscribe to Redis | `backend/main.py` | The logger node's Redis event is unused in the Docker setup |
| 11 | `reports/` is ignored by git | `.gitignore` | PDF endpoints fail in a fresh clone |
| 12 | `load_weights()` is annotated as a 3-tuple but returns 4 values | `pii/risk_calculator.py` | Harmless at runtime; misleading type hint |
| 13 | The file-analysis routes in the design notes (`/api/analyze/file`, `/fast`) are not served by the primary server | `server/intervention_server.py` only | Out-of-date documentation |
| 14 | The design notes quote different weights and thresholds than the code (0.5/0.2/0.3 and 67/30 against 1.0/0.0/0.0 and 70/40 in `config.json`) | `information.txt`, `project_description.txt`, docstrings | Update the notes before you present |

## 7.3 Packaging problem: `reports/` is git-ignored

`.gitignore` line 8 is `reports/`. The directory exists locally (`pdf_builder.py`, `dpdp_template.py`), but a clone from the repository will not contain it, so the incident PDF, the DPDP PDF and the Celery PDF task raise `ModuleNotFoundError`. Fix by removing the ignore line, or move the generated output to a different folder name.

## 7.4 Security considerations

| Topic | Observation |
|---|---|
| Default secrets | `JWT_SECRET` has a hard-coded fallback; the sample compose file and the first-run seed contain default credentials in plain text. Replace all of them. |
| Token handling | Hand-written JWT; refresh tokens are accepted as access tokens; 7-day access lifetime; no revocation; tokens kept in `localStorage` (readable by any script on the page). |
| Unauthenticated surfaces | `/api/v1/analyze`, `/api/v1/policies` (GET), `/api/v1/policies/extension-sync`, `/api/v1/auth/register-device` and all WebSocket endpoints do not enforce a token. The analyze endpoint trusts `org_id`, `user_id` and `device_id` supplied by the caller. |
| CORS | `*` on every response. |
| Password hashing | PBKDF2 with 100,000 iterations; modern guidance suggests more or a memory-hard algorithm. |
| TLS interception | Powerful; requires consent and policy. |
| Data minimisation | Strong: hash and counts only, masked previews, keyed fingerprints; tests check it. |
| Fingerprint key | Losing `SCANNER_HMAC_KEY` or `hmac.key` disables Layer 4 silently. |
| Ingestion | Fingerprint ingestion is limited to files inside the project root (tested). |
| Input limits | Request size capped near 10 MB; text length caps on the scanner API; backtracking-resistant patterns (tested). |
| Evasion | Anyone can paraphrase or retype a secret; no scanner prevents all leaks. |

## 7.5 Compliance claims to double-check

The Reports page and `dpdp_template.py` label "Section 8", "Section 9" and "Section 15" of the DPDP Act 2023 with titles such as "Processing by Significant Data Fiduciary" and "Personal Data Breach Notification". To the best of this review's knowledge, the Act numbers these topics differently (for example, children's data is Section 9 and Significant Data Fiduciaries are Section 10; breach intimation is part of Section 8). The description of the penalty of up to ₹250 crore matches commonly cited figures for security-safeguard failures. **Verify every citation against the official text before presenting, and say "supports compliance" rather than "makes the organisation compliant".** The tool is a technical control, not legal advice.

## 7.6 Failure scenarios and how they are handled

| Scenario | Handling |
|---|---|
| Presidio or spaCy missing | Regex or keyword fallback (reduced accuracy) |
| Sentence-transformer model missing | Neutral score; no effect on the risk score at weight 0 |
| Ollama down or model missing | Static breach story |
| Redis down | Warning logged; the request completes |
| Database error while logging | Error logged; decision still returned (the incident is lost) |
| Scanner engine exception | BLOCK (`scanner_unavailable`) |
| Whole pipeline exception in the proxy | Allow by default; `503` with `PROXY_FAIL_CLOSED=1` |
| Backend unreachable from the extension | Fallback in `content.js`; the file path blocks |
| Huge payload | Sniffer truncates to 50,000 characters; fast path scans up to 500,000 characters of PII text |
| Streamed AI reply in the proxy | Not scanned (limitation) |

## 7.7 Limitations

1. No tool can guarantee that nothing leaks; paraphrase and memory defeat scanning.
2. Unlabelled secrets are a statistical decision. Word-like passwords are missed more often (84.15 percent recall in the synthetic test); rare words can be blocked until confirmed.
3. The bare-token model is small and trained on synthetic data; unusual real secrets may behave differently.
4. Layer 4 knows only secrets you registered from files; secrets that live only in a vault or someone's head are invisible to it.
5. Image OCR runs only in the chat sandbox and is unreliable on photos and handwriting; scanned PDFs without a text layer are not OCR'd.
6. The extension guards pasted text and uploads, not every keystroke on every site.
7. Multi-turn scanning covers the last 6 user messages of a session.
8. Not covered: ROT13 and custom ciphers, secrets inside images, deep archives, seed phrases.
9. Dictionary coverage is English plus a short list of transliterated Hindi and Indian names; other languages' words look "random".
10. Single-process in-memory state: chat sessions, the pending-upload map and WebSocket client sets are lost on restart and not shared across instances.
11. No database migrations, no rate limiting, no horizontal scaling story as shipped.

## 7.8 Realistic future improvements

* Fix the tenant gap (pass `org_id`, `user_id`, `device_id` and latency into `create_incident`), then add a regression test.
* Make the pipeline and the extension actually read the organisation's policy.
* Use a real LLM behind the chat sandbox, or label the sandbox as a simulator.
* Replace the hand-written JWT with a maintained library, add token type checks, short lifetimes, WebSocket tokens and rate limiting.
* Add Alembic migrations and a PostgreSQL integration test in CI.
* Wire Celery for PDFs and webhooks, or remove the dead code.
* Subscribe the primary server to Redis so several instances share the live feed.
* Collect real, consented examples to measure accuracy on real traffic, and calibrate the thresholds.
* Cache embeddings and models, and add queueing for the slow analysis stages if load grows.
