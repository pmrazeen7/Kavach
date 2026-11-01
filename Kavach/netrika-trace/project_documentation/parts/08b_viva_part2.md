
---

## 8.7 Database design and SQL

**Q38 [B]. Which database do you use and why?**
*Say it:* "SQLAlchemy over SQLite by default, so the project runs with no server, and PostgreSQL in Docker for concurrency and robustness. The data is relational: organisations, users, devices, incidents and detections reference each other, so a relational database fits better than a document store."
*Follow-up:* **Why not MongoDB?** We need joins, constraints and aggregate queries; the schema is stable.
*Files:* `database/session.py`, `database/models.py`.

**Q39 [B]. What is a primary key and a foreign key? Show them in your schema.**
*Say it:* "A primary key uniquely identifies a row, like `incidents.id`. A foreign key links a row to another table, like `incidents.org_id` referencing `organizations.id`."
*Example:* `entity_detections.incident_id` references `incidents.id`; deleting an incident cascades to its detections in the ORM.
*Follow-up:* **Are foreign keys enforced in SQLite?** Not by default; SQLite needs `PRAGMA foreign_keys=ON`, which this project does not set. PostgreSQL enforces them.

**Q40 [I]. Describe the schema.**
*Say it:* "Ten tables: organizations, users, devices, enterprise_policies, incidents, entity_detections, audit_logs, model_evaluations, plus two key-value style tables, policy_config and ai_endpoints. Incidents are the centre: each has a decision, risk score, hash, entity JSON, and optional links to organisation, user and device."
*Files:* Part 5.1.

**Q41 [I]. Which columns are indexed and why?**
*Say it:* "`users.email` and `devices.device_uuid` for lookups at login and heartbeat; `incidents.org_id`, `user_id`, `device_id` and `timestamp` because lists filter by tenant and sort or window by time; `audit_logs` the same."
*Follow-up:* **What would you add?** A composite index `(org_id, timestamp)` for the main dashboard query, and an index on `decision` if filters grow.

**Q42 [I]. Write a query for the number of BLOCK incidents per target host in the last 24 hours.**
*Say it (illustrative SQL for PostgreSQL; the app builds the equivalent with SQLAlchemy):*
```sql
SELECT target_host, COUNT(*) AS blocked
FROM incidents
WHERE decision = 'BLOCK'
  AND timestamp >= NOW() - INTERVAL '24 hours'
  AND org_id = :org
GROUP BY target_host
ORDER BY blocked DESC;
```
*Follow-up:* **Where does the app do something similar?** `get_endpoint_incident_stats` and `get_incident_stats` in `database/crud.py`.

**Q43 [I]. How do you retrieve one incident with its detections?**
*Say it:* `SELECT i.*, d.entity_type, d.entity_count FROM incidents i LEFT JOIN entity_detections d ON d.incident_id = i.id WHERE i.id = :id AND i.org_id = :org;` In code, `get_incident_by_id` and `get_entity_detections_for_incident`, with the org filter for tenancy.

**Q44 [I]. How does multi-tenancy work, and is there a weakness?**
*Say it:* "Every query for non-super-admins filters on the caller's `org_id`. The weakness I found by reading the code is that pipeline-created incidents are saved without an `org_id`, so they would be invisible to organisation-level users. The fix is to pass the tenant into `create_incident`."
*Follow-up:* **Did you reproduce it?** No; it is from code reading and is marked unverified.

**Q45 [A]. Why store a SHA-256 hash of the payload?**
*Say it:* "For de-duplication and later correlation (the same content appearing again) without storing the content. A hash is one-way, but short or guessable content can be confirmed by hashing a guess, so it is not a perfect privacy guarantee."

**Q46 [A]. What about migrations and scaling the database?**
*Say it:* "We use `create_all`, so schema changes need manual work; Alembic would be the next step. For growth I would add indexes first, then retention (delete or archive old incidents), partition by time, and only then consider other stores."

---

## 8.8 APIs and integrations

**Q47 [B]. REST versus WebSocket: which do you use where?**
*Say it:* "REST for requests the client starts, such as login and listing incidents. WebSockets for pushes from the server, such as a new incident on the live feed or a policy update to extensions."
*Example:* `/api/v1/incidents` versus `/ws/alerts`.
*Follow-up:* **What if the WebSocket drops?** The dashboard keeps working from REST data; it reconnects, but missed events are not replayed.

**Q48 [I]. What does the analyze endpoint do?**
*Say it:* "`POST /api/v1/analyze` takes `{payload, user_ip, target_host, ...}`, rejects payloads under two characters with 400, runs the pipeline in an executor, applies a block policy for extension traffic, broadcasts a live event and returns the decision, score, entities, reason and latency."
*Follow-up:* **Is it authenticated?** The code does not enforce a token and trusts organisation and device identifiers from the caller. That is a known gap.

**Q49 [I]. How do you validate input?**
*Say it:* "Handlers parse JSON and check types and ranges: `limit` between 1 and 100, `window` one of four values, `decision` in a set, notes up to 4,000 characters, evaluation arrays of 0 and 1 only, scanner text length caps. Bad input gets a 400 with an `error` message."
*Follow-up:* **What is missing?** Schema validation with Pydantic and consistent error formats.

**Q50 [I]. How does the browser talk to the backend securely?**
*Say it:* "After login the React app keeps the JWT in `localStorage` and sends `Authorization: Bearer ...` through `apiFetch`. The extension's service worker sends its stored token if there is one."
*Follow-up:* **Risks of `localStorage`?** Any script injected into the page can read it; httpOnly cookies are safer.

**Q51 [I]. What external integrations exist?**
*Say it:* "Ollama for the local LLM, Redis, SMTP for email, optional Slack or Teams webhooks (defined but not called), and the AI hosts the proxy watches. The Gemini integration is not active: the chat reply is mocked."

---

## 8.9 Algorithms and business logic

**Q52 [I]. Why a noisy-OR for the scanner score?**
*Say it:* "Each finding is independent evidence. Noisy-OR combines them as `1 - Π(1 - w_ic_i)`: more evidence raises the score but it never exceeds 100 and one strong finding already gives a high score."
*Example:* two findings with weighted confidence 0.5 each give `1 - 0.5×0.5 = 0.75`, so 75.

**Q53 [A]. What is catastrophic backtracking and did you consider it?**
*Say it:* "Some regex shapes take exponential time on crafted input, which is a denial-of-service risk when scanning untrusted text. During development two patterns hung the evaluation; we rewrote them with required separators, and there is a test `test_adversarial_inputs_do_not_cause_catastrophic_backtracking` plus length caps."

**Q54 [I]. Why are 'policy entity' types handled separately from NER entities?**
*Say it:* "Blocking on every person or place name would block almost every message. Only types that are sensitive by definition (Aadhaar, PAN, keys, credentials) drive blocking; the rest are for audit."

---

## 8.10 AI and machine learning

**Q55 [B]. Where is AI or ML used?**
*Say it:* "Four places: Presidio and spaCy (pre-trained NLP), the MiniLM sentence-transformer for semantic similarity, a small logistic-regression model for bare tokens that we trained ourselves, and a local LLM (Ollama phi3:mini) for breach stories. Most detection is rules and statistics; that is deliberate because it is explainable and fast."

**Q56 [I]. What did you train, and on what data?**
*Say it:* "Only the logistic regression and the trigram language model. The regression used synthetic examples from `scanner/synth.py`, and the language model used a word list. We did not use real leaked credentials. The sentence-transformer and spaCy models are pre-trained and used as they are."
*Follow-up:* **Did you fine-tune anything?** No.

**Q57 [A]. How do you evaluate it?**
*Say it:* "`scanner/eval/run.py` runs a seeded corpus of 4,045 labelled samples and reports recall by group and layer, precision, false-alarm rate by negative category and latency. CI fails if a metric drops below a gate. The API also has an endpoint to compute precision, recall and F1 from submitted labels."
*Deeper:* precision = TP / (TP + FP); recall = TP / (TP + FN); F1 is their harmonic mean.
*Follow-up:* **Why recall matters more here?** A missed secret is costly, but too many false alarms make users ignore the tool, so both are tracked.

**Q58 [A]. What are the limits of a local small LLM?**
*Say it:* "It can write generic or inaccurate stories and is slow on CPU, so we limit it to 300 tokens, skip it on the fast path, and never let it affect the decision."

**Q59 [I]. Is the chat sandbox a real AI?**
*Say it:* "No. The DLP around it is real, but `chat_with_llm` returns canned mock replies, because the free Gemini quota was exceeded during development. The sandbox exists to demonstrate scanning, redaction and the memory test."
*Follow-up:* **Should the UI say that?** Yes; I would label it as a simulator.

---

## 8.11 Security and authentication

**Q60 [B]. How does login work?**
*Say it:* "The backend looks up the user by email, verifies the password against a PBKDF2-HMAC-SHA256 hash with a random salt and 100,000 iterations, and returns a signed JWT access token (7 days) and a refresh token (30 days). Later requests send the token in the `Authorization` header."
*Follow-up:* **What is a JWT?** A signed token with three base64url parts: header, claims, signature. The server recomputes the HMAC-SHA256 signature with its secret to verify it.

**Q61 [I]. What is RBAC here?**
*Say it:* "Roles map to permissions: SUPER_ADMIN all; ORG_ADMIN incidents, policies, users, devices, analytics, exports; ANALYST view and review incidents, analytics and exports; EMPLOYEE only extension use. Handlers are wrapped by `require_permission`, which returns 401 or 403."

**Q62 [A]. What security weaknesses does your project have?**
*Say it:* "Honestly: a hard-coded fallback JWT secret and default credentials in sample files; refresh tokens accepted as access tokens; no token revocation or login rate limiting; several endpoints and all WebSockets unauthenticated; CORS open to all origins; tokens in `localStorage`; PBKDF2 iterations on the low side. They are documented in 7.4 with fixes."
*Follow-up:* **Which first?** Secrets management and authenticating the analyze endpoint and WebSockets, then token hygiene.

**Q63 [I]. Is intercepting TLS ethical and safe?**
*Say it:* "It is legitimate only on company-managed devices with a clear policy and consent, because the proxy can read all traffic to the monitored hosts. We limit it to a list of AI hosts, store no payloads, and protect the CA key."

**Q64 [A]. How do you protect secrets in your own logs?**
*Say it:* "Results carry masked previews and keyed fingerprints only; logs contain sizes and IDs; tests assert that no raw secret reaches logs, pipeline state or the WebSocket feed."

---

## 8.12 Testing and debugging

**Q65 [B]. How did you test the project?**
*Say it:* "pytest for the backend (about 96 test functions across eight files covering detectors, risk formula, API, scanner, gate and safety), plus vitest for the browser engine's parity and speed. In my latest run 90 of the 92 tests I could run passed; two failed: a known env-variable detector test and a timing-sensitive latency gate. Two API test files could not run on this machine because of an application-control block, so I do not claim them for this run."
*Follow-up:* **What is not tested?** Real HTTPS interception, real AI sites, Docker, Ollama and PostgreSQL.

**Q66 [I]. Tell me about a hard bug.**
*Say it (from the project history):* "Two scanner regexes caused catastrophic backtracking and hung the evaluation. I located them by timing, rewrote them to require separators, and added an adversarial test. Another was a false-alarm rate of about 27 percent on real code, fixed by code-aware context rules and benign-shape checks, bringing it to about 3 percent." *(Say this only if you understand and can reproduce these steps; see the Honest note in 1.8.)*

**Q67 [I]. How do you debug the pipeline?**
*Say it:* "Every node logs with a prefix like `[FORENSIC]` and the incident ID; `RiskCalculator.explain` returns each component's contribution; the scanner result includes reasons and layers per finding."

---

## 8.13 Performance and scalability

**Q68 [I]. What is the latency and where does it go?**
*Say it:* "The scanner alone is about 0.45 ms median and about 20 ms at the 95th percentile on 30-line chunks (from the project's evaluation). The pipeline is slower because of spaCy and optionally the transformer, which is why uploads use a fast path. I have no end-to-end latency measurement for the whole pipeline."

**Q69 [A]. How would you scale it?**
*Say it:* "Run several backend instances behind a load balancer with shared state: Redis for WebSocket fan-out and chat sessions, PostgreSQL for data. Put slow stages (embedding, LLM) on a queue with Celery workers so the request path stays fast, and batch database writes. Cache loaded models per process."
*Follow-up:* **What breaks first today?** In-memory sessions and WebSocket sets, and CPU-heavy NLP on the request thread.

**Q70 [I]. Why a Web Worker in the browser?**
*Say it:* "Scanning while typing could freeze the UI. A worker runs the engine on another thread and posts results back."

---

## 8.14 Limitations and future scope

**Q71 [B]. What are the main limitations?**
*Say it:* "No scanner is perfect: paraphrased or memorised secrets slip through; human-style passwords are caught less often; the bare-token model is trained on synthetic data; the AI reply is mocked; some features are defined but not wired; and accuracy is measured on a synthetic corpus, not on real traffic."

**Q72 [I]. What would you build next?**
*Say it:* "Fix tenant tagging and make policy drive decisions; replace the hand-rolled JWT and authenticate WebSockets; add migrations; wire Celery or remove it; connect a real LLM; and collect consented real data to measure accuracy."

---

## 8.15 My specific contribution (answer from your own experience)

**Q73 [B]. What did you personally build?**
*Say it:* use the table in 1.8. State what you wrote or can explain line by line. If you used an AI coding assistant for parts (the layered scanner, evaluation harness, frontend redesign), say so and describe how you reviewed and tested them.

**Q74 [I]. What would you do differently?**
*Say it:* "Write down the policy model first so config, database and extension agree; test with real consented samples earlier; avoid two servers; and add authentication to every endpoint from day one."

**Q75 [I]. Which part are you proudest of, and why?**
*Say it:* pick one you can defend, for example the privacy rule that no raw value is ever stored, enforced by tests; or the fail-closed design.

---

## 8.16 Quick rapid-fire list (one-line answers)

| Question | One-line answer |
|---|---|
| Ports? | 8888 backend, 8080 proxy, 3000 frontend (Docker), 8501 Streamlit, 5432 PostgreSQL, 6379 Redis |
| Default database? | SQLite at `data/netrika.db` |
| Decision values? | ALLOW, WARN, BLOCK (scanner adds REDACT, TOKENIZE) |
| Block threshold? | 70 in `config.json` (default 70 in code) |
| Warn threshold? | 40 in `config.json` (code default 30) |
| Who reviews incidents? | ANALYST and above |
| What is stored for a leak? | Type, count, hash, size, score; never the value |
| Why Presidio? | Mature PII engine with custom recognizers |
| Why mitmproxy? | Scriptable HTTPS interception in Python |
| What is TLS interception? | A proxy re-signs HTTPS with its own CA so it can read content |
| What is a service worker? | Event-driven background script of an MV3 extension |
| What is cosine similarity? | Angle-based similarity of two vectors |
| What is a hash? | One-way fixed-size fingerprint of data |
| What is HMAC? | A hash that uses a secret key |
| What is idempotent? | Repeating a request has the same effect as doing it once |
