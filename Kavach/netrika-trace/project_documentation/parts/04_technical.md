# Part 4: Technical Deep Dive

Each topic follows one pattern: **What it is**, **Why here**, **How it works in this project**, **Alternatives**. Items under "Could be added later" are *not* implemented.

## 4.1 Python and aiohttp (backend)

**What.** aiohttp is an asynchronous HTTP framework built on `asyncio`: one thread serves many connections by switching whenever a handler waits (network, disk).

**Why here.** The server holds long-lived WebSocket connections and many short API calls. Async handles both without a thread per client.

**How.** `backend/main.py::create_app()` builds `web.Application(middlewares=[cors_middleware, scanner_gate], client_max_size≈10 MB)` and registers routes. CPU-heavy work (the pipeline with spaCy and transformers) is pushed out of the event loop with `loop.run_in_executor(None, ...)`, otherwise one slow scan would freeze every other request. The models are loaded eagerly in the main thread at import time (a comment says this prevents thread deadlocks).

**Alternatives.** Flask (simple but synchronous, WebSockets are awkward), FastAPI (async plus automatic validation and OpenAPI; a good future upgrade), Django (heavy for this size).

**Could be added later.** Request-schema validation with Pydantic (the package is a dependency but handlers parse JSON by hand), rate limiting, structured logging.

## 4.2 LangGraph (agent orchestration)

**What.** A library for building a graph of steps that share one state object. Each *node* is a function `state -> state`; *edges* say which runs next; *conditional edges* choose by a function.

**Why here.** The DLP flow is a small state machine with one branch (intervene or not). Using a graph makes each stage independently testable and easy to explain.

**How.** `StateGraph(AgentState)`, `add_node`, `set_entry_point`, `add_edge`, `add_conditional_edges("decision_node", should_intervene, {...})`, `graph.compile()`, `invoke(initial_state)`.

**Honest view.** The nodes are ordinary deterministic Python; the "agents" do not plan or call tools. "Agentic" here means an orchestrated multi-stage pipeline. An examiner may ask whether this needs LangGraph; a plain function chain would work, and LangGraph's value is structure, typed state and room to add parallel or looping nodes.

**Alternatives.** A simple sequence of function calls; Celery chains; Prefect or Airflow (too heavy for per-request latency).

## 4.3 PII detection: Presidio and regular expressions

**What.** Presidio's `AnalyzerEngine` combines recognizers (patterns, checksums, spaCy NER) to find entities in text. A `PatternRecognizer` is a regular expression with a score.

**Why here.** Presidio already knows credit cards, SSNs, IBANs; Indian identifiers are added as custom recognizers.

**How.** See 3.5.1. A regex fallback (`_regex_analyze`) keeps detection working if Presidio cannot start (the code comments mention Python 3.14 compatibility problems).

**Limits.** The Aadhaar pattern is just 12 digits starting with 2 to 9, without a Verhoeff checksum, so random 12-digit numbers can match; the layered scanner's Layer 1 does validate with Verhoeff. Regex is brittle against obfuscation, which is why Layer 0 of the scanner exists.

**Alternatives.** Cloud DLP APIs (send data out, which defeats the purpose); trained NER models for PII (need labelled data).

## 4.4 spaCy NER

**What.** A statistical NLP library; `en_core_web_sm` is a small English model that tags people, organisations, places, money and dates.

**Why here.** To give analysts context ("which organisations were mentioned") without letting ordinary names block work.

**How.** Used only for the audit list; `compute_entity_score` returns 0.0 by design (3.5.2).

## 4.5 Sentence-transformers (semantic scoring)

**What.** `all-MiniLM-L6-v2` turns a sentence into a 384-number vector so that similar meanings are close (high cosine similarity).

**Why here.** To flag *intent* such as "here is our customer database, summarise it" even without a recognisable pattern.

**How.** Compare to curated dangerous and safe example prompts; take the maximum similarity to each side and normalise (3.5.4).

**Trade-offs.** It needs torch and a model download, is slow on CPU (the project skips it on the fast path), and its quality depends on the template lists. Its weight is currently 0.

## 4.6 Layered scanner: the statistics

**Entropy.** Shannon entropy `H = -Σ p(c) log2 p(c)` measures how unpredictable the characters of a token are; random keys have high entropy, English words low.

**Language model.** A trigram (3-letter) model trained on about 52,000 words gives the probability that letters follow each other naturally; `xyzwudguwd` scores as very unlike English.

**Logistic regression.** Combines about 26 features (length, entropy, character mix, trigram score, dictionary coverage, vowel runs, shape tests) into a probability using `p = 1 / (1 + e^-(w·x + b))`. The weights are in `rules/model.json`, trained by `train_model.py` on synthetic examples (`synth.py`). **No real leaked-credential dataset was used.**

**Noisy-OR.** `score = 1 - Π(1 - w_i c_i)`: independent evidence accumulates but never passes 100.

**HMAC fingerprints.** `HMAC-SHA256(key, secret)` identifies a known secret without storing it. Because a plain hash of a short secret can be brute-forced, the key is secret and server-only (`SCANNER_HMAC_KEY` or `data/scanner/hmac.key`). Losing the key silently disables Layer 4.

**Why two implementations.** The browser needs instant results while typing and must not send text to a server first; the server must not trust the browser. A shared rule pack plus a parity test keeps them aligned.

**Alternatives.** A trained neural classifier (needs real data and more compute); entropy-only rules (many false alarms on UUIDs, hashes and base64 image data).

## 4.7 Code and secret detection (regex and Pygments)

**Regex** finds known prefixes and structures (AWS `AKIA...`, `-----BEGIN ... PRIVATE KEY-----`, `eyJ...` JWTs). **Pygments** is a syntax-highlighting library whose lexers can guess a language; here it is a second opinion on whether text is code. Alternatives: tree-sitter parsers (more exact, heavier), ML code classifiers.

## 4.8 mitmproxy (network interception)

**What.** An interactive HTTPS proxy. It acts as a man-in-the-middle by presenting certificates signed by its own CA, which clients must trust.

**How.** A Python addon class with `request` and `response` hooks (3.1).

**Security note.** TLS interception is powerful and sensitive; it is appropriate only on managed company devices with consent and policy. Alternatives: a secure web gateway from a vendor, DNS or SNI-based filtering (cannot see content), endpoint agents.

## 4.9 Chrome Manifest V3 extension

**What.** MV3 replaced persistent background pages by short-lived service workers and restricts remote code and request blocking.

**Why a MAIN-world script.** Content scripts in the isolated world cannot wrap the page's own `fetch`. The manifest declares `injected_script.js` with `"world": "MAIN"` and `"run_at": "document_start"`, so it patches `window.fetch` and `XMLHttpRequest` before page scripts run. It communicates with the isolated content script by `window.postMessage`, and the content script calls `chrome.runtime.sendMessage` to the service worker, which can use the extension's host permission to call `localhost:8888`.

**Why not the old `webRequest` blocking API.** MV3 limits it; patching in the page is the practical alternative, with the trade-off that a determined page or user can evade or break hooks.

## 4.10 Database: SQLAlchemy, SQLite and PostgreSQL

**What.** SQLAlchemy is an ORM: Python classes map to tables; `Session` objects run queries.

**How.** `database/session.py` reads `DATABASE_URL` (default `sqlite:///data/netrika.db`). For SQLite it sets `check_same_thread=False`; for other URLs it creates a pooled engine (`pool_size=10`, `max_overflow=20`, `pool_pre_ping=True`). `init_database()` runs `Base.metadata.create_all`. There is **no migration tool** (no Alembic), so schema changes on an existing database are manual.

**Why both.** SQLite needs no server (good for a demo); PostgreSQL is concurrent and robust (the Docker setup).

**Indexes.** Declared with `index=True` on `users.email`, `devices.device_uuid`, and on `incidents.org_id`, `user_id`, `device_id`, `timestamp`; `audit_logs.org_id`, `user_id`, `timestamp`. Unique constraints: `organizations.domain`, `users.email`, `devices.device_uuid`, `policy_config.key`, `ai_endpoints.hostname`.

**Alternatives.** MongoDB (no need, the data is relational), raw SQL (more control, more code).

## 4.11 Redis, pub/sub and WebSockets

**Redis** is an in-memory data store. **Pub/sub** lets one process publish a message on a channel and others receive it live, without storing it. **A WebSocket** is a persistent two-way connection between browser and server.

**How here.** The logger node publishes to `netrika:incidents` (0.2 s timeout, failure tolerated). The legacy server subscribes and forwards to WebSockets; the primary server calls `broadcast_incident_event` directly. In both, WebSocket clients live in an in-memory `set`, so with several backend instances an event would reach only the clients connected to the instance that handled it. Redis pub/sub is how that could be shared, but `backend/main.py` does not subscribe.

**Pub/sub does not store messages**, so a client that was offline misses events; the dashboard refills from the REST API on load.

**Alternatives.** Server-Sent Events (one-way, simpler), polling (simple, higher latency), Kafka (durable log, overkill here).

## 4.12 Authentication and security design

* **Passwords:** PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte random salt, the two derived keys are compared by hashing both with SHA-256 and using `==` (not `hmac.compare_digest`). Current guidance recommends more iterations (hundreds of thousands) or a memory-hard function (argon2, bcrypt, scrypt). `passlib` and `bcrypt` are in `requirements.txt` but not used.
* **JWT:** hand-written HS256 using `hmac`; `PyJWT` is listed but unused. Claims: `sub`, `org_id`, `role`, `email`, `iat`, `exp`. `decode_token` checks signature and expiry. It does **not** check the `type` claim, so a refresh token is accepted as an access token (7.4).
* **Secret handling:** `JWT_SECRET` falls back to a hard-coded default string when the variable is missing.
* **RBAC:** role to permission map (2.5), enforced by decorators; data is scoped by `org_id`.
* **CORS:** the middleware answers `Access-Control-Allow-Origin: *` for every route.
* **Privacy:** metadata-only logging (3.11).

**Could be added later.** Short-lived access tokens, token type checks, token revocation, login rate limiting, secure cookies, WebSocket authentication, secrets from a vault.

## 4.13 React frontend stack

* **React 18 + Vite 5 + TypeScript 5:** component UI, fast dev server and build, static types.
* **Tailwind 3 with CSS variables:** one token file (`src/index.css`) for colours, radii and shadows; light and dark themes by `data-theme`.
* **TanStack Query:** caching, loading and error states for REST data. **Zustand:** a tiny store for the live incident list. **React Router:** routing with lazy loading. **Framer Motion:** animation (respecting reduced motion). **Recharts:** charts.
* **Web Worker:** the TypeScript scanner runs off the main thread (`src/scanner/worker.ts`, `client.ts`) so typing stays smooth.
* **tesseract.js:** OCR in the browser for images (assets in `public/ocr`).

## 4.14 Docker and configuration

A single `Dockerfile` (python:3.11-slim) installs CPU-only PyTorch, the requirements and the spaCy model; `docker-compose.yml` starts six services (2.7). The Dockerfile's default command starts the proxy; compose overrides it per service. Environment variables carry configuration. Alternatives: Kubernetes (scale and orchestration, more complexity), plain virtual environments.

## 4.15 Testing, logging and reliability

* Python logging with prefixes such as `[SNIFFER]`, `[FORENSIC]`, `[DECISION]`; level set by `LOG_LEVEL`.
* Graceful degradation: lazy detector loading, regex fallback for Presidio, keyword fallback for spaCy, static fallback for the breach story, Redis and email failures ignored, scanner failures treated as BLOCK.
* Tests: see Part 7.

## 4.16 Concepts implemented versus future improvements

| Implemented | Future (not implemented) |
|---|---|
| Layered, explainable detection with failure fallbacks | Real labelled leak dataset and measured accuracy on real traffic |
| JWT and RBAC | Argon2, refresh-token rotation, WebSocket auth, rate limiting |
| In-memory WebSocket fan-out | Redis-backed fan-out across instances |
| `create_all` schema creation | Alembic migrations |
| Celery tasks defined | Actually queue PDF and webhook work |
| Config-file thresholds | Per-organisation policy actually consumed by the pipeline |
| Mock chat model | Real LLM integration |
