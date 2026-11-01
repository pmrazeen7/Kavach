# Part 8: Viva and Interview Preparation

**How to use this section.** Each question has a *Say it* answer you can speak in about 20 to 30 seconds, then the idea *in simple words*, a *deeper* explanation where it helps, an *example from this project*, likely *follow-ups* with answers, and the *files* to point at. Questions are grouped by topic and marked **[B]** basic, **[I]** intermediate or **[A]** advanced. Answers describe what the code does today; where something is a limitation, say so. That honesty is itself a strong viva answer.

---

## 8.1 Project overview and problem statement

**Q1 [B]. What is your project in one minute?**
*Say it:* "Kavach, internally called Netrika-Trace, is a data-loss-prevention gateway for generative-AI use. It sits between an employee and tools like ChatGPT, either as a network proxy or as a Chrome extension, checks the text or file being sent, and decides allow, warn or block. It detects Indian IDs like Aadhaar and PAN, secrets like AWS keys, source code, and even unlabelled random passwords. It logs only metadata, never the secret, and shows everything on a security dashboard."
*In simple words:* a security guard that reads what you are about to send to an AI and stops you if it contains secrets.
*Example:* pasting `AKIA...` (an AWS key) is blocked and an incident appears on the dashboard with the type and count but not the key.
*Follow-ups:* **Is it a product or a prototype?** A working prototype: the main paths are implemented, but several items (real chat model, Celery, policy consumption) are partial, and it has not been load tested. **Who are the users?** Employees, SOC analysts and admins.
*Files:* `README.md`, `agents/graph.py`, `proxy/addon.py`, `extension/`.

**Q2 [B]. What is "Shadow AI" and why is it a risk?**
*Say it:* "Shadow AI is employees using AI tools the company has not approved or cannot see. The risk is that confidential data such as code, customer details and credentials is sent to external servers, may be stored or used for training, and cannot be taken back."
*In simple words:* like emailing company documents to a stranger because it is convenient.
*Follow-up:* **Why not just ban AI tools?** Bans reduce productivity and employees use personal devices; a content-aware control allows safe use.

**Q3 [B]. Why can't a normal firewall solve this?**
*Say it:* "A firewall decides by address or domain. It can block ChatGPT entirely, but it cannot read the content of a request and say 'this message contains an Aadhaar number'. Also most traffic is encrypted, so content inspection needs a TLS-intercepting proxy or an in-browser agent, which is what we built."
*Follow-up:* **Why both a proxy and an extension?** The proxy covers every app on the network; the extension sees text and files inside the page before encryption and gives instant, friendly feedback. Each covers a blind spot of the other.

**Q4 [I]. How is this different from existing DLP products?**
*Say it:* "Classic DLP relies on keywords and patterns. We add layers: Presidio with Indian IDs, NER, code and secret detection, a semantic scorer, and a layered scanner that catches unlabelled tokens, decoded content and fingerprints of real secrets. We also keep the audit log free of raw data and teach the user with a local-LLM breach story."
*Follow-up:* **Is it better than a commercial product?** I cannot claim that; I have no comparison data. The evaluation on our synthetic corpus shows the scanner works as designed, not that it beats a vendor.

**Q5 [B]. What does the DPDP Act have to do with it?**
*Say it:* "India's Digital Personal Data Protection Act 2023 requires organisations to protect personal data with reasonable security safeguards. Our system prevents personal data such as Aadhaar and PAN from leaving through AI tools and keeps an audit trail, which supports compliance. It is a technical control, not legal compliance by itself."
*Follow-up:* **Which sections?** The project's report labels Sections 8, 9 and 15; I would verify the exact section numbers against the official Act before quoting them (see 7.5).

**Q6 [I]. What are the objectives and the scope?**
*Say it:* "Detect sensitive data in AI-bound requests, decide with a transparent score, work at network and browser level, keep raw data out of logs, and give analysts a dashboard. Out of scope are mobile, non-Chrome browsers, streamed replies in the proxy, and a real LLM in the sandbox."

---

## 8.2 Architecture and complete data flow

**Q7 [B]. Explain the architecture.**
*Say it:* "There are interceptors, a backend, storage and interfaces. The Chrome extension and the mitmproxy gateway send text to a Python backend that runs a five-node LangGraph pipeline: sniffer, forensic, decision, intervention, logger. The result is stored through SQLAlchemy, a live event goes to the React dashboard over a WebSocket, and the interceptor enforces allow, warn or block."
*Example:* diagram in 2.1.
*Follow-ups:* **Where is the business logic?** In `agents/` and `pii/`, not in the route handlers. **Why a separate frontend?** Different release cycle and the browser needs only JSON.
*Files:* `backend/main.py`, `agents/graph.py`.

**Q8 [B]. Walk me through what happens when someone pastes an Aadhaar number into ChatGPT.**
*Say it:* "The extension's paste guard scans locally and holds the text back; if it goes through, the page script catches the send, the content script asks the service worker, which calls `/api/v1/analyze`. The backend runs the pipeline: the sniffer assigns an ID and hash, the forensic node's Presidio pattern matches the Aadhaar, the score becomes 100, the decision node blocks, the logger stores an incident with type and count only, and the extension shows a blocked screen."
*Follow-up:* **Is the number sent anywhere?** To our own backend on `localhost:8888`, not to the AI service. It is not stored.

**Q9 [I]. Why do you have two servers, `backend/main.py` and `server/intervention_server.py`?**
*Say it:* "The project started with the intervention server and was upgraded to an enterprise backend. The new one is primary; it still imports the chat and upload handlers from the old one. It is technical debt: a few routes exist only in the old server."
*Follow-up:* **How would you clean it up?** Move the handlers into `backend/api`, delete the old server, and update the docs.

**Q10 [B]. Why aiohttp and not Flask or Django?**
*Say it:* "We need WebSockets and concurrent requests, and aiohttp is asynchronous with built-in WebSocket support. Flask is synchronous, and Django is heavier than we need."
*Deeper:* CPU-bound work (spaCy, transformers) still blocks an event loop, so we run the pipeline with `run_in_executor`.
*Follow-up:* **Would you use FastAPI today?** Probably, for automatic request validation and API docs.

**Q11 [I]. Why LangGraph? Are these really agents?**
*Say it:* "LangGraph gives a typed shared state and explicit nodes and edges, including a conditional edge after the decision. Honestly, the nodes are deterministic Python functions, not autonomous LLM agents; 'agentic' here means a staged, orchestrated pipeline. A plain function chain would also work, but the graph makes the stages visible, testable and extensible."
*Files:* `agents/graph.py`, `agents/state.py`.

**Q12 [I]. What is the "fast path"?**
*Say it:* "For extension uploads and chat uploads we skip the semantic model and the Ollama story to reduce latency, and the decision node blocks immediately if a policy entity such as Aadhaar or an AWS key is found."
*Follow-up:* **What do you lose?** The intent label is less informative and there is no breach story for those cases.
*Files:* `agents/decision_node.py::should_intervene`, `forensic_node.py`.

---

## 8.3 The pipeline and detectors

**Q13 [B]. What does each node do?**
*Say it:* "Sniffer: ID, SHA-256, trim. Forensic: PII, NER, code and secrets, semantic score, the layered scanner, and the risk score. Decision: thresholds and rules. Intervention: breach story and page for WARN or BLOCK. Logger: save to the database, publish to Redis, email."

**Q14 [I]. Why does the sniffer store an empty preview?**
*Say it:* "To avoid keeping any user text. The design notes mention a 200-character preview, but the code sets it to empty and `create_incident` forces it empty again. Privacy by design."
*Follow-up:* **Then why does the column exist?** It is left from an earlier design; I would drop it or document it.
*Files:* `agents/sniffer_node.py`, `database/crud.py`.

**Q15 [I]. Why run detectors in parallel threads?**
*Say it:* "PII, NER and code detection are independent, so a three-worker `ThreadPoolExecutor` reduces total latency. Python's GIL limits true CPU parallelism, so the gain is modest; it helps most where a native library releases the GIL or waits on I/O."
*Follow-up:* **Is there a risk?** Loading models from several threads can deadlock; that is why spaCy and Presidio are loaded eagerly in the main thread at start-up.

**Q16 [I]. How do you detect Aadhaar, PAN, UPI and IFSC?**
*Say it:* "Custom Presidio pattern recognizers. Aadhaar is 12 digits starting with 2 to 9, optionally space separated; PAN is five letters, four digits, one letter; UPI is a name plus a known handle like `@ybl`; IFSC is four letters, a zero, then six alphanumerics."
*Deeper:* The Presidio path has no checksum, so a random 12-digit number can match. The layered scanner's Layer 1 adds the Verhoeff checksum for Aadhaar and structural checks for PAN.
*Follow-up:* **How do you reduce false positives?** Checksums, context, and the policy that only certain types block.
*Files:* `pii/presidio_analyzer.py`, `scanner/validators.py`.

**Q17 [I]. Why does the NER score always return 0?**
*Say it:* "Names, places and dates appear in normal text, so blocking on them would make the product unusable. NER output is kept for the audit view only."
*Follow-up:* **Then why run it?** It gives analysts context and costs little.

**Q18 [A]. How does the semantic scorer work, and why is its weight zero?**
*Say it:* "It embeds the text with MiniLM and compares it with sets of dangerous and safe example prompts using cosine similarity; the ratio of the closest dangerous to closest safe similarity becomes a 0 to 1 score. In `config.json` its weight is 0, so today it only sets the intent label. We turned it off because it was too noisy to block on."
*Deeper:* cosine similarity is `a·b / (|a||b|)`; vectors are normalised so it is a dot product.
*Follow-up:* **How would you make it useful?** Train a classifier on labelled prompts and calibrate a threshold against false alarms.

**Q19 [B]. How is the risk score computed?**
*Say it:* "`int(100 × (pii×w1 + entity×w2 + semantic×w3))`, plus 20 for code, plus 30 for secrets, plus 30 if the PII score is at least 0.9, capped at 100. With the shipped config only the PII weight is non-zero."
*Example:* an Aadhaar gives pii score 1.0, so 100.
*Follow-up:* **Why the boosters?** A secret or code snippet is serious even if no personal data is present.
*Files:* `pii/risk_calculator.py`, `config.json`.

**Q20 [I]. How is the final decision made?**
*Say it:* "Rule 1: extension or upload sources with any policy entity are blocked at once. Rule 2: if the scanner says BLOCK, we block. Otherwise the score is compared with `config.json`: 70 or more blocks, 40 or more warns, below that allows. If the scanner suggested WARN, REDACT or TOKENIZE, an ALLOW is raised to WARN."
*Follow-up:* **Why are the thresholds in a config file?** So they can be tuned without code changes; but the database policy screen does not feed them yet, which is a gap.

**Q21 [I]. What is the breach simulation and what keeps it private?**
*Say it:* "For WARN and BLOCK the system asks a local LLM (Ollama with phi3:mini) to write a short story of how an attacker could abuse that type of data. The prompt contains only counts and type names such as '2x AADHAAR', never the payload, and if Ollama is missing a fixed fallback text is used."
*Follow-up:* **Why local?** Sending the data to a cloud LLM would be the very leak we prevent. **Can the LLM hallucinate?** Yes; it is educational text, not evidence, and it never influences the decision.
*Files:* `agents/intervention_node.py`.

**Q22 [I]. What does the logger store and what does it never store?**
*Say it:* "Stores the incident ID, time, source tag, destination, SHA-256 of the payload, size, score, decision, intent, a JSON of entity types and counts, and the story text. Never the payload, never the values."
*Follow-up:* **How do you prove it?** Tests such as `test_nothing_secret_is_ever_logged` and `test_scan_summary_kept_in_pipeline_state_has_no_values`.

---

## 8.4 Interceptors

**Q23 [I]. How does the proxy work?**
*Say it:* "mitmproxy runs on port 8080 with our addon. For each request to a host in the AI list, we extract prompt text from JSON, form or raw bodies, run the pipeline, and on BLOCK return a 302 redirect to an intervention page; on WARN we inject a banner into the HTML response. We also scan and mask the AI reply."
*Follow-up:* **What about HTTPS?** mitmproxy re-signs traffic with its own CA, which the client must trust. **What if the pipeline crashes?** By default the request passes; `PROXY_FAIL_CLOSED=1` blocks with 503.

**Q24 [A]. How does the extension intercept `fetch` and file uploads?**
*Say it:* "A content script declared with `world: MAIN` runs inside the page's JavaScript context at `document_start`, so it can wrap `window.fetch` and `XMLHttpRequest` before the site's code and listen to file input, drop and paste events. It talks to the isolated content script with `postMessage`; that script uses `chrome.runtime.sendMessage` to the service worker, which calls our backend."
*Follow-up:* **Why not do the network call from the page?** The page's Content Security Policy and CORS could block it; the service worker has host permission.
*Files:* `extension/manifest.json`, `injected_script.js`, `content.js`, `background.js`.

**Q25 [A]. What is Manifest V3 and how did it affect the design?**
*Say it:* "MV3 is Chrome's current extension platform: service workers instead of persistent background pages, no remote code, limited blocking of network requests. Because we cannot reliably block requests with `webRequest`, we patch the page's own APIs."
*Follow-up:* **Can a user bypass it?** A determined user could disable the extension; that is why the proxy is a second layer.

**Q26 [I]. What does "fail closed" mean here?**
*Say it:* "If the safety check cannot run, we refuse rather than allow. The scanner failing makes the forensic node return BLOCK, and the extension's file path blocks when no files could be read. The proxy is configurable because blocking all AI traffic on a crash is an availability decision."

---

## 8.5 The layered scanner

**Q27 [B]. What problem does the layered scanner solve?**
*Say it:* "Regexes find labelled or formatted secrets. Employees also paste a bare random string like `xyzwudguwd` with no label, encoded or spaced-out secrets, or their company's real keys. The scanner combines normalisation, format validators, statistics, context and fingerprints to catch those."

**Q28 [I]. How can you detect a random string without a keyword?**
*Say it:* "From its statistics: entropy, how unlike English its letter sequences are (a trigram language model), dictionary coverage, and shape tests that exclude UUIDs, hashes, paths and identifiers. A small logistic regression turns those features into a probability."
*In simple words:* real words and names look 'pronounceable'; random keys do not.
*Follow-ups:* **What is entropy?** A measure of unpredictability, `-Σ p log2 p`. **What is logistic regression?** A model that weighs features and squashes the sum to a probability between 0 and 1. **How was it trained?** On synthetic positives and negatives generated by `synth.py`; no real leaked data.
*Files:* `scanner/statistical.py`, `train_model.py`.

**Q29 [I]. What are the evasion defences in Layer 0?**
*Say it:* "Unicode normalisation (NFKC), stripping zero-width characters, folding look-alike Cyrillic and Greek letters, collapsing spaced-out characters, joining wrapped lines, and decoding base64, hex, URL-encoding, HTML entities and reversed text up to three levels deep. Findings are mapped back to the original text positions."
*Follow-up:* **Why a depth limit?** To bound time and stop decompression-bomb style abuse.

**Q30 [A]. What are fingerprints and why HMAC?**
*Say it:* "We read the company's real secrets from files such as `.env`, and store a keyed hash (HMAC-SHA256) of each, never the secret. Later any token or substring that matches a stored fingerprint is flagged, even if no other layer would notice. A keyed hash prevents someone who steals the database from brute-forcing short secrets offline. This layer is server-only so the key never reaches a browser."
*Follow-ups:* **What if the key is lost?** Layer 4 silently stops matching, so back it up. **What are canaries?** Planted fake secrets that raise an alert if anyone ever sees them.

**Q31 [I]. What do REDACT and TOKENIZE mean?**
*Say it:* "REDACT masks the value. TOKENIZE replaces it with a reversible placeholder such as `[SECRET_1]`; the mapping stays in the user's browser memory, so the AI sees the placeholder and the browser restores the original text in the reply."

**Q32 [I]. How do you make sure the browser engine and the server engine agree?**
*Say it:* "They share one rule pack (`formats.json`, `lexicon.json`, `model.json`). A script dumps the Python answers for a labelled corpus and a TypeScript test replays them, requiring at least 99 percent action agreement and no BLOCK-versus-non-BLOCK disagreement on known formats, evasions and context."

**Q33 [A]. Why can the UI scanner not be trusted, and what do you do about it?**
*Say it:* "Anyone can call the API directly. So `scanner_gate` is a server middleware that scans every `/api/chat` message again with conversation history and refuses a BLOCK with HTTP 422 before the model is called."
*Follow-up:* **Does the gate cover the extension?** The extension path uses `/api/v1/analyze`, which runs the pipeline (including the scanner) but is not behind that middleware.

**Q34 [A]. What accuracy does the scanner have?**
*Say it:* "On our own synthetic corpus of 4,045 samples: recall 98.64 percent, precision 99.02 percent, false-alarm rate 1.0 percent on hard negatives and 3.04 percent on real code. Human-style passwords were caught only 84.15 percent of the time. These come from a corpus the same authors wrote, so they overstate real-world performance; I do not have measurements on real traffic."
*Follow-up:* **What would you do to measure properly?** Collect consented, labelled real prompts, split train and test, and report confidence intervals.
*Files:* `scanner/eval/REPORT.md`.

---

## 8.6 Programming language and framework choices

**Q35 [B]. Why Python for the backend?**
*Say it:* "The NLP and ML ecosystem (spaCy, Presidio, transformers, scikit-style tooling) is Python, and aiohttp provides an async server. Using one language for detection and API avoids a bridge."
*Follow-up:* **Downsides?** Slower raw speed and the GIL, which we mitigate with executors.

**Q36 [B]. Why React with TypeScript?**
*Say it:* "The dashboard has many live-updating parts; React's components and state make that manageable, and TypeScript catches shape errors in API data at build time. Vite gives a fast build; Tailwind with CSS variables gives a single theme file."
*Follow-up:* **React versus a framework?** React is a library; routing, data fetching and state come from React Router, TanStack Query and Zustand.

**Q37 [I]. Why write the scanner twice (Python and TypeScript)?**
*Say it:* "Instant feedback while typing must run in the browser without sending text to a server; enforcement must run on the server because a browser cannot be trusted. The cost is duplicated logic, which the shared rule pack and the parity test manage."
