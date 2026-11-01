# Part 2: The Tools and Frameworks

Every chapter follows the same order so you can revise quickly: **What it is**, **Why the project uses it**, **How it works (concepts to know)**, **Alternatives**, **Interview questions**.

---

## 2.1 Python and asynchronous programming (asyncio, aiohttp)

**What it is.** Python is the language of the whole backend. `asyncio` is Python's built-in way to do many things "at the same time" on one thread. `aiohttp` is a web framework built on it.

**Why here.** The server has many short requests and long-lived WebSocket connections. Most of the time a request is *waiting* (for the network, a database). Async lets one thread serve other requests during those waits. The detection libraries (spaCy, transformers) are also Python, so no language bridge is needed.

**How it works.**
* A function declared `async def` can `await` something slow. While it waits, the **event loop** runs other work.
* Async helps with *waiting*, not with heavy *computing*. A big spaCy scan would still block the loop, so the project runs the pipeline in a thread pool with `run_in_executor`.
* **Middleware** is code that runs before or after every request. The project uses it for CORS headers and for the security gate that scans chat messages.
* **The GIL** (Global Interpreter Lock) lets only one thread run Python code at a time, so threads help with waiting and with libraries that release the lock, not with pure Python number crunching.

**Alternatives.** Flask (simple, synchronous), FastAPI (async with automatic validation and docs; a popular modern choice), Django (full-featured, heavier).

**Interview questions**
* **What is the difference between concurrency and parallelism?** Concurrency is handling many tasks by switching between them; parallelism is running them literally at the same time on several cores.
* **Why not just use threads?** Threads cost memory and switching overhead per connection; async scales better for many idle connections.
* **What does `await` do?** It pauses this function until the result is ready and lets the event loop run other tasks meanwhile.
* **Why `run_in_executor`?** To stop CPU-heavy code from freezing the event loop.

---

## 2.2 REST, JSON and WebSockets

**What they are.** *REST* is a style of web API: the client sends an HTTP request (GET to read, POST to create, PATCH to update, DELETE to remove) and the server replies, usually in *JSON* (a text format for structured data). A *WebSocket* is a connection that stays open so the server can push messages whenever it wants.

**Why here.** The dashboard asks for lists and reports with REST. New incidents appear instantly through a WebSocket, so nobody has to refresh.

**Concepts.**
* HTTP status codes: 200 OK, 400 bad input, 401 not signed in, 403 not allowed, 404 not found, 422 request understood but refused, 500 server error. (Kavach answers 422 when it blocks a chat message.)
* REST is *request then response*; WebSocket is *two-way and persistent*.
* Alternatives for live updates: polling (ask every few seconds), Server-Sent Events (one-way push).

**Interview questions**
* **REST versus WebSocket?** REST for client-initiated requests; WebSocket for server pushes and real-time feeds.
* **What happens if the WebSocket drops?** The live feed stops until it reconnects; stored data is safe in the database.
* **What is idempotent?** An operation that has the same effect if repeated; GET and PUT are idempotent, POST usually is not.
* **Why validate input on the server?** The client can be bypassed; the server must never trust it.

---

## 2.3 LangGraph (the pipeline)

**What it is.** A library for building a **graph of steps** that share one state. Each *node* is a function that takes the state and returns an updated state. *Edges* connect nodes; a *conditional edge* chooses the next node using a function.

**Why here.** The detection flow is a small flowchart with one branch (intervene or not). A graph makes each stage separate, testable and easy to draw.

**How it works.**
```python
graph = StateGraph(AgentState)          # state is a typed dictionary
graph.add_node("sniffer_node", sniffer_node)
graph.add_edge("sniffer_node", "forensic_node")
graph.add_conditional_edges("decision_node", should_intervene, {...})
pipeline = graph.compile()
result = pipeline.invoke(initial_state)
```

**Be honest about it.** The nodes are normal Python functions, not autonomous AI agents. "Agentic" here means a staged, orchestrated pipeline. LangGraph also supports loops, parallel branches and LLM-driven agents, which this project does not use.

**Alternatives.** Plain function calls in order; task orchestrators such as Prefect or Airflow (heavier, for batch jobs).

**Interview questions**
* **What is a state machine?** A system that is always in one state and moves to another by defined rules.
* **Why a shared state object?** Every stage can read earlier results and add its own without passing many arguments.
* **Do you need LangGraph for this?** Not strictly; it adds structure and room to grow.

---

## 2.4 Regular expressions (regex)

**What it is.** A mini-language for describing text patterns. `[A-Z]{5}[0-9]{4}[A-Z]` means "five capital letters, four digits, one capital letter", which is the shape of an Indian PAN number.

**Why here.** Many secrets have a fixed shape: AWS keys start with `AKIA` and have 16 more characters; Aadhaar is 12 digits; private keys start with `-----BEGIN ... PRIVATE KEY-----`.

**Concepts to know.**
* `\d` digit, `\w` word character, `\s` space, `.` any character, `*` zero or more, `+` one or more, `{n}` exactly n, `[...]` a set, `(...)` a group, `|` or, `^` and `$` start and end, `\b` word boundary.
* **Checksums complement regex.** A regex can match any 12 digits; the Verhoeff checksum checks whether they could really be an Aadhaar number.
* **Catastrophic backtracking.** Some patterns take exponential time on crafted input, which is a denial-of-service risk. The project rewrote two such patterns and added a test.
* Regex is brittle against disguise (spacing, encoding), which is why the scanner first normalises text.

**Interview questions**
* **Write a regex for an Indian PAN.** `\b[A-Z]{5}[0-9]{4}[A-Z]\b`.
* **What are the limits of regex for security?** Easy to evade, no understanding of meaning, false positives.
* **What is a false positive and a false negative?** Flagging something harmless; missing something harmful.

---

## 2.5 Microsoft Presidio (PII detection)

**What it is.** An open-source library that finds personal data in text. Its `AnalyzerEngine` runs many *recognizers* (patterns, checksums, NLP) and returns each match with a type, position and confidence score.

**Why here.** It already knows credit cards, SSNs, emails and IBANs. The project adds *custom recognizers* for Aadhaar, PAN, UPI IDs and IFSC codes using `PatternRecognizer` (a regex plus a score).

**How it works here.** The wrapper runs Presidio, ignores harmless types such as names and dates when scoring, and gives high-confidence types (Aadhaar, PAN, keys, credentials) a heavy weight. If Presidio fails to load, a regex fallback runs so detection degrades instead of stopping.

**Alternatives.** Cloud DLP services (they would receive the data, defeating the purpose), training your own PII model (needs labelled data), pure regex.

**Interview questions**
* **What is PII?** Personally Identifiable Information: data that can identify a person.
* **How do you add a new entity type?** Create a `PatternRecognizer` with a regex and a score and register it with the analyzer.
* **Why is confidence score useful?** It lets you set thresholds to balance missed detections against false alarms.

---

## 2.6 spaCy and Named Entity Recognition (NER)

**What it is.** spaCy is an NLP library. *NER* tags words that are names of people, organisations, places, dates and money. The project uses the small English model `en_core_web_sm`.

**Why here.** To give analysts context ("which organisations appear in this message"). It is not used to block, because names appear in ordinary text.

**Concepts.** *Tokenisation* splits text into words; a *pipeline* applies tagger, parser and NER; models are *pre-trained* on large labelled text; small models are fast but less accurate than large ones.

**Interview questions**
* **What is NER?** Finding and labelling named things in text.
* **Why does your NER score not affect blocking?** Because it would flag nearly every message.
* **Small versus large model?** Small is faster and lighter; large is more accurate.

---

## 2.7 Embeddings, cosine similarity and sentence-transformers

**What they are.** An *embedding* turns text into a list of numbers (a vector) so that similar meanings are close together. `all-MiniLM-L6-v2` is a small model that produces 384 numbers per sentence. *Cosine similarity* measures how close two vectors are by the angle between them, from -1 to 1.

**Why here.** To judge the *meaning* of a message even when no pattern matches: compare it with example "dangerous" and "safe" prompts and see which it resembles more.

**How it works here.** Embed the text, take the highest similarity to the dangerous examples and to the safe examples, and turn the ratio into a 0 to 1 score. It then labels the intent (PII leak, IP leak, safe, ambiguous). With the shipped configuration its weight is 0, so it only sets the label.

**Formula to remember:** `cosine(a, b) = (a · b) / (|a| |b|)`.

**Interview questions**
* **What is an embedding?** A numeric vector representing meaning.
* **Why cosine and not Euclidean distance?** It compares direction, not length, which suits text vectors.
* **Downsides?** Needs a model download and CPU time; quality depends on the example sentences.

---

## 2.8 Machine-learning ideas used by the scanner

You do not need deep ML for this project, but you should explain these four ideas.

**Entropy.** A measure of unpredictability: `H = -Σ p(c) log2 p(c)`. Random keys have high entropy; English words have low entropy.

**Language model (trigram).** Learns which three-letter sequences are common in real words. `xyzwudguwd` has very unlikely sequences, so it looks random.

**Logistic regression.** A simple classifier. It multiplies each feature by a weight, adds them, and squashes the result to a probability between 0 and 1: `p = 1 / (1 + e^-(w·x + b))`. It is fast, small and explainable. The project trained it on synthetic examples, not real leaked data.

**Evaluation.**
* Precision = TP / (TP + FP): of the alerts raised, how many were right.
* Recall = TP / (TP + FN): of the real problems, how many were caught.
* F1 is the harmonic mean of the two.
* TP, FP, TN and FN are true and false positives and negatives.

The scanner's own report (synthetic data): recall 98.6 percent, precision 99.0 percent, about 1 percent false alarms. Human-style passwords like `Summer2024!` were caught only about 84 percent of the time.

**Other terms.** Noisy-OR (combine independent evidence: `1 - Π(1 - p)`), train/test split, overfitting, synthetic data, parity test (two implementations must agree).

**Interview questions**
* **Precision versus recall, which matters here?** Both: a missed secret is costly, but too many false alarms make users ignore the tool.
* **Why logistic regression and not a neural network?** Small data, need for speed and explainability, runs in the browser.
* **What is overfitting?** Learning the training data too closely so it fails on new data.

---

## 2.9 Local LLMs with Ollama

**What it is.** Ollama runs large language models on your own machine. `phi3:mini` is a small model (about 3.8 billion parameters).

**Why here.** For each WARN or BLOCK, it writes a three-paragraph story of how an attacker could misuse that kind of data. Running it locally means no data goes to a cloud service, and the prompt contains only type names and counts.

**Concepts.** *Prompt* (the instruction), *temperature* (randomness; the project uses 0.7), *tokens* (pieces of text; limit 300 here), *hallucination* (confident but wrong output), *fallback* (if Ollama is missing, a fixed text is used).

**Interview questions**
* **Why local and not the OpenAI API?** Sending data to a cloud LLM would be the leak you are preventing.
* **Can the LLM change the decision?** No, it only writes educational text after the decision.
* **What are the limits of small LLMs?** Less accurate, slower on CPU, can hallucinate.
