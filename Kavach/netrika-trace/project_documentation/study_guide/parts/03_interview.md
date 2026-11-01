# Part 3: Interview Practice on the Project

Short answers you can say aloud. Keep them natural; do not memorise word for word.

## 3.1 Explaining the project

**Tell me about your project.**
"Kavach is a data-loss-prevention gateway for generative AI. A Chrome extension and a network proxy intercept what employees send to tools like ChatGPT and pass it to a Python pipeline built with LangGraph. The pipeline detects personal data like Aadhaar and PAN, secrets, source code and even unlabelled random passwords, scores the risk and decides allow, warn or block. It stores only metadata, never the secret, and a React dashboard shows incidents live."

**What problem does it solve?**
"Employees paste confidential data into AI tools and it cannot be taken back. Firewalls cannot read content and keyword tools miss unlabelled secrets. We check the content at the moment of sending."

**Why both a proxy and an extension?**
"The extension sees text and files inside the browser and gives instant feedback. The proxy covers desktop apps and scripts. Each covers the other's blind spot."

**What happens when I paste an Aadhaar number?**
"The extension catches the paste or send, the text goes to the backend, the forensic stage matches the Aadhaar pattern, the risk score reaches 100, the decision stage blocks, the logger saves an incident with the type and count only, and the extension shows a blocked screen."

**What is the privacy design?**
"We never store the raw text. The log holds a SHA-256 hash, types, counts and scores. The local LLM only receives type names. Tests check that secrets do not reach logs."

## 3.2 Design decisions

**Why Python?** "The NLP and ML libraries are Python, and aiohttp gives async handling for WebSockets and many requests."

**Why LangGraph?** "It gives explicit stages that share a typed state and a conditional branch. Honestly, the stages are plain functions, so it adds structure rather than intelligence."

**Why a local LLM?** "A cloud LLM would receive the data we are trying to protect."

**Why SQLite and PostgreSQL?** "SQLite for zero-setup demos, PostgreSQL in Docker for concurrency. The data is relational."

**Why Redis pub/sub?** "To announce new incidents without the logger knowing who listens, which keeps components loosely coupled."

**Why React and TypeScript?** "A dashboard with live-updating parts suits components and state; TypeScript catches data-shape mistakes early."

**Why write the scanner in both Python and TypeScript?** "The browser needs instant feedback without sending text to a server; the server must enforce because a browser cannot be trusted. A parity test keeps both consistent."

**Why do NER entities not block?** "Names and places are in almost every message, so blocking on them would make the tool unusable. They are kept for the dashboard only."

**Why a risk score plus rules, not only ML?** "Rules are fast, explainable and predictable. Strong signals like an Aadhaar match must block regardless of the score."

## 3.3 Challenges and how to talk about them

**Detecting secrets with no label.** "A regex cannot find a random string. We used statistics: entropy, how unlike English the letter patterns are, dictionary coverage, and shape checks that exclude UUIDs and hashes, combined by a small logistic regression."

**Too many false alarms on real code.** "Early versions flagged many harmless identifiers. We added code-aware context rules and benign-shape checks and brought the false-alarm rate on real code down to about 3 percent on our test set."

**Slow or hanging regexes.** "Two patterns caused catastrophic backtracking. We rewrote them and added an adversarial test."

**Latency.** "The scanner takes under a millisecond typically, but spaCy and the embedding model are slower, so uploads use a fast path that skips the slow stages."

**Hidden or encoded secrets.** "We normalise text first: Unicode folding, removing invisible characters, collapsing spaced letters and decoding base64, hex and URL-encoding to a limited depth."

*(Only use a challenge in an interview if you can explain the details. If something was built with AI assistance, say how you reviewed and tested it.)*

## 3.4 Limitations and next steps (say these proudly)

**What are the limits?**
"It is a prototype. The chat sandbox uses a mock reply, accuracy was measured on a synthetic test set, the policy screen is not fully connected to the decisions, and some authentication hardening is still needed. No scanner can stop a determined person who paraphrases a secret."

**What would you improve?**
"Connect policy settings to the decision logic, replace the hand-written JWT with a maintained library and add rate limiting, add database migrations, connect a real LLM, run background jobs with Celery, and measure accuracy on real consented data."

**Is it production ready?** "No. It demonstrates the design well, but it needs hardening, load testing and real-world evaluation first."

## 3.5 Concept questions that often follow

| Question | Short answer |
|---|---|
| What is DLP? | Technology that stops sensitive data leaving an organisation |
| What is Shadow AI? | Use of AI tools the organisation does not know about or control |
| What is PII? | Personally identifiable information |
| What is a false positive? | Raising an alert for something harmless |
| What is fail-closed? | If the check cannot run, refuse rather than allow |
| What is loose coupling? | Components communicate without depending on each other's internals |
| What is a hash? | A one-way fixed-size fingerprint of data |
| HMAC vs hash? | HMAC uses a secret key, so outsiders cannot recompute it |
| What is a JWT? | A signed token carrying identity claims |
| What is RBAC? | Permissions assigned by role |
| What is middleware? | Code that runs on every request before the handler |
| REST vs WebSocket? | Request and response vs a persistent two-way connection |
| Image vs container? | Blueprint vs a running instance |
| What is an embedding? | A vector that represents meaning |
| Precision vs recall? | Right alerts among alerts vs real cases caught |

## 3.6 Your own contribution

Prepare a truthful answer to "what did you personally do?". A good structure:

1. The part you built or understand best and can explain line by line.
2. The parts you integrated, tested or reviewed, and how.
3. What you learned and what you would do differently.

If an AI assistant helped with parts of the project, say so plainly and describe how you verified the result. Interviewers value honesty and understanding more than a claim of doing everything alone.

---

# Part 4: Revision Sheets

## 4.1 One-page cheat sheet

**Flow:** extension or proxy, then backend, then Sniffer, Forensic, Decision, (Intervention), Logger, then dashboard.

**Decision:** score 70 or more BLOCK, 40 or more WARN, else ALLOW; extension or upload with a sensitive entity blocks at once; the scanner's BLOCK is final.

**Score:** weighted PII score times 100, plus 20 for code, plus 30 for secrets, plus 30 if PII is certain, capped at 100.

**Detectors:** Presidio (plus Aadhaar, PAN, UPI, IFSC), regex secrets and code, spaCy NER (audit only), MiniLM semantic (label only), layered scanner.

**Scanner layers:** 0 clean and decode, 1 known formats and checksums, 2 statistics for random tokens, 3 context labels, 4 fingerprints of real secrets, 7 decision (noisy-OR, profiles strict, balanced, relaxed).

**Actions:** ALLOW, WARN, REDACT (mask), TOKENIZE (placeholder), BLOCK.

**Privacy:** hash, type and count only; never the secret; local LLM sees only type names.

**Stack:** Python, aiohttp, LangGraph, Presidio, spaCy, sentence-transformers, Ollama, mitmproxy, Chrome MV3, SQLAlchemy (SQLite or PostgreSQL), Redis, Celery, JWT, React, TypeScript, Vite, Tailwind, Docker, pytest, vitest.

**Ports:** backend 8888, proxy 8080, frontend 3000 (Docker).

**Honest limits:** mock chat reply, synthetic accuracy numbers, partly connected policy, auth to harden.

## 4.2 Glossary

| Term | Meaning |
|---|---|
| Async / event loop | Doing other work while waiting; the loop schedules the tasks |
| Middleware | Code that wraps every request |
| LangGraph | Library for graphs of steps sharing state |
| Node, edge | A step, the link to the next step |
| Regex | Pattern language for text |
| Presidio | Microsoft's PII detection library |
| NER | Tagging names, places, organisations |
| Embedding | Numbers representing meaning |
| Cosine similarity | Closeness of two embeddings |
| Entropy | Randomness measure |
| Logistic regression | Simple probability classifier |
| Noisy-OR | Combining independent evidence |
| Precision, recall, F1 | Alert accuracy, catch rate, their balance |
| Ollama, phi3:mini | Local LLM runner and a small model |
| Proxy, mitmproxy | Middleman for traffic; scriptable HTTPS proxy |
| TLS, CA | HTTPS encryption; the authority that signs certificates |
| Manifest V3 | Chrome's current extension platform |
| Content script, service worker | Page-level script; background script of an extension |
| ORM, SQLAlchemy | Tables as Python classes |
| Primary key, foreign key | Unique row id, link to another table |
| Index | Structure that speeds up lookups |
| Redis, pub/sub | In-memory store; publish and subscribe messaging |
| Celery | Task queue with workers |
| Hash, SHA-256, HMAC | One-way fingerprint, a standard hash, keyed hash |
| PBKDF2 | Slow salted password hashing |
| JWT | Signed login token |
| RBAC | Role-based access control |
| CORS | Browser rule on cross-site API calls |
| React, props, state | UI library; inputs from parent; data a component owns |
| Vite, Tailwind | Build tool, utility CSS |
| Web Worker | Background thread in the browser |
| Docker, image, container, volume | Packaging tool, blueprint, running copy, persistent storage |
| Fail-closed | Refuse when the check cannot run |
| Parity test | Test that two implementations agree |
| REDACT, TOKENIZE | Mask a value, swap for a reversible placeholder |
| DPDP Act | India's data protection law (2023) |
