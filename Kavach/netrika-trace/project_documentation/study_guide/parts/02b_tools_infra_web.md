
---

## 2.10 Proxies, TLS and mitmproxy

**What they are.** A *proxy* is a middleman that forwards your traffic. *TLS* (the "S" in HTTPS) encrypts traffic between browser and website. *mitmproxy* is a scriptable proxy that can read HTTPS by acting as a "man in the middle".

**Why here.** The browser extension cannot see desktop apps or scripts. A proxy on port 8080 sees everything that is sent through it, so it covers those gaps.

**How it works.**
1. The client trusts mitmproxy's own **certificate authority (CA)**.
2. For each HTTPS site, mitmproxy presents a certificate signed by that CA, decrypts the request, lets the addon inspect it, then re-encrypts it to the real server.
3. The project's addon checks the hostname against a list of AI services, extracts the prompt text from the JSON body, runs the pipeline, and either redirects (BLOCK), injects a banner (WARN) or does nothing (ALLOW).

**Concepts.** Certificate, CA, handshake, transparent versus explicit proxy, why TLS interception needs consent and company-managed devices.

**Alternatives.** A commercial secure web gateway; DNS or SNI filtering (can block domains but cannot read content); an endpoint agent.

**Interview questions**
* **How can a proxy read HTTPS?** By terminating TLS with its own CA that the client trusts, then opening a second TLS connection to the real server.
* **Is that ethical or safe?** Only on managed devices with a clear policy; it can read sensitive traffic, so protect the CA key.
* **What is a fail-open versus fail-closed design?** Fail-open allows traffic if the checker breaks; fail-closed blocks it. Kavach's scanner fails closed; the proxy fails open unless `PROXY_FAIL_CLOSED=1`.

---

## 2.11 Chrome extensions (Manifest V3)

**What it is.** A small program that runs inside Chrome. *Manifest V3* is the current extension platform.

**Why here.** The extension sees text and files inside the page *before* they are encrypted and sent, and can show friendly overlays.

**The parts to know.**

| Part | Role |
|---|---|
| `manifest.json` | Declares permissions, scripts and where they run |
| **Content script** | JavaScript injected into web pages |
| **Isolated world vs MAIN world** | By default a content script sees the page's DOM but not the page's JavaScript variables. A script declared with `"world": "MAIN"` runs inside the page's own context, so it can wrap `window.fetch` before the site does |
| **Service worker** (`background.js`) | Event-driven background script; holds settings and makes the call to the backend |
| `postMessage` / `chrome.runtime.sendMessage` | How these pieces talk to each other |

**How Kavach uses it.** A MAIN-world script wraps `fetch`, `XMLHttpRequest`, file inputs, drag and drop and paste. It asks the content script to scan; the content script asks the service worker; the service worker calls the backend; the answer decides whether the upload continues.

**Limits.** MV3 restricts the old network-blocking API, so patching in the page is the practical route; a determined user can disable the extension, which is why the proxy is a second layer. Real-site behaviour was not tested in this project review.

**Interview questions**
* **What changed in Manifest V3?** Service workers replace persistent background pages; remote code is not allowed; network request blocking is limited.
* **Why a MAIN-world script?** To intercept the page's own `fetch` calls.
* **Why call the backend from the service worker?** It has host permission, which avoids page CSP and CORS limits.

---

## 2.12 Databases: SQL, SQLAlchemy, SQLite and PostgreSQL

**What they are.** A *relational database* stores data in tables with rows and columns, linked by keys. *SQL* is the language to query it. *SQLAlchemy* is a Python library (an *ORM*, object-relational mapper) that lets you work with tables as Python classes. SQLite is a database in a single file; PostgreSQL is a full database server.

**Why here.** Incidents, users, organisations and devices are related records. The project defaults to SQLite (no setup, good for demos) and uses PostgreSQL in Docker (many users at once, robust).

**Concepts to know.**
* **Primary key:** uniquely identifies a row. **Foreign key:** points to a row in another table, such as an incident's `org_id`.
* **Index:** speeds up lookups at the cost of extra storage and slower writes.
* **JOIN:** combines rows from two tables. **GROUP BY:** groups rows to count or sum.
* **ORM trade-off:** less SQL to write, but you must watch the queries it generates.
* **Migrations** (for example Alembic) change the schema safely over time. This project does not use them; it creates tables with `create_all`.
* **Multi-tenancy:** several organisations in one database, separated by an `org_id` column.

**The main tables in plain words.** Organisations own users and devices. Every blocked or warned attempt becomes an **incident**; each incident can have several **entity detections** (what kinds of sensitive data were found). An **audit log** records actions like logins.

**A query to be able to write.**
```sql
SELECT decision, COUNT(*) AS total
FROM incidents
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY decision;
```

**Alternatives.** MongoDB (flexible documents; poor fit for related data), raw SQL (more control, more code).

**Interview questions**
* **SQL versus NoSQL?** SQL for structured, related data with constraints; NoSQL for flexible or massive unstructured data.
* **What is an index and when would you not add one?** A lookup structure; skip it on columns rarely queried or tables with heavy writes.
* **What is an ORM?** A layer that maps tables to classes so you write Python instead of SQL.
* **What is ACID?** Atomicity, Consistency, Isolation, Durability: guarantees that transactions are reliable.

---

## 2.13 Redis and publish/subscribe

**What it is.** Redis is an in-memory data store: very fast because it keeps data in RAM. *Pub/sub* lets a program publish a message to a named channel and any subscriber receives it instantly. Redis pub/sub does not store messages, so a subscriber that is offline misses them.

**Why here.** After saving an incident, the logger publishes a small event to the channel `netrika:incidents`, so other parts (such as the WebSocket server) can react without the logger knowing about them. That is **loose coupling**: the sender does not depend on who listens.

**Other uses to know.** Caching, rate limiting, expiring keys with a TTL (time to live), job queues.

**Alternatives.** Kafka (durable event log, for huge volumes), RabbitMQ (message broker with delivery guarantees).

**Interview questions**
* **What is pub/sub?** A messaging pattern where publishers and subscribers communicate through channels.
* **Redis versus a database?** Redis is fast and temporary; a database is durable and queryable.
* **Does Redis pub/sub guarantee delivery?** No.

---

## 2.14 Celery and background jobs

**What it is.** Celery runs tasks in separate worker processes, taking them from a queue (here, Redis). A *scheduler* decides when a task runs; a *worker* executes it.

**Why it matters.** Slow work such as generating PDFs or sending webhooks should not make the user wait.

**Be honest.** The project defines two Celery tasks (PDF generation, webhook alert) but the application does not currently call them. You can explain the concept and say it is prepared, not active.

**Interview questions**
* **Why use a queue?** To separate producing work from doing it, smooth spikes and retry failures.
* **How do you scale workers?** Run more worker processes or containers reading the same queue.

---

## 2.15 Authentication, hashing and roles

**Key ideas.**
* **Hashing** turns data into a fixed-size fingerprint; it is one-way. **SHA-256** is a standard hash; the project uses it to fingerprint payloads so it never stores them.
* **Password hashing** must be slow and salted. The project uses **PBKDF2-HMAC-SHA256** with a random salt and 100,000 rounds. Stronger choices today are bcrypt, scrypt or argon2.
* **HMAC** is a hash that uses a secret key. The scanner uses HMAC to fingerprint real company secrets so a stolen database cannot be brute-forced offline.
* **JWT (JSON Web Token):** a signed token with three parts, header, claims and signature. After login the server returns one; the client sends it in the `Authorization: Bearer ...` header; the server verifies the signature and expiry.
* **RBAC (role-based access control):** permissions belong to roles. Kavach has SUPER_ADMIN, ORG_ADMIN, ANALYST and EMPLOYEE.
* **Authentication** proves who you are; **authorization** decides what you may do.

**Be honest about gaps (good interview material).** The JWT code is hand-written rather than using a library, there is a fallback default secret, and several endpoints are open. Say you know these should be hardened.

**Interview questions**
* **Hash versus encryption?** Hashing is one-way; encryption is reversible with a key.
* **Why salt passwords?** So identical passwords give different hashes and rainbow tables fail.
* **Where should a JWT be stored in a browser?** `localStorage` is simple but readable by injected scripts; an httpOnly cookie is safer against XSS.
* **What is CORS?** A browser rule about which websites may call an API; wide-open CORS is a risk.

---

## 2.16 The frontend: React, TypeScript, Vite, Tailwind and friends

| Tool | What it is | Why here |
|---|---|---|
| **React** | A JavaScript *library* for building UIs from reusable components | The dashboard has many live-updating parts |
| **TypeScript** | JavaScript with types | Catches wrong data shapes at build time |
| **Vite** | A fast build tool and dev server | Quick rebuilds, simple setup |
| **Tailwind CSS** | Utility classes for styling | One set of design tokens (colours, radii) in CSS variables, with light and dark themes |
| **React Router** | Client-side page routing | Dashboard, incidents, devices, reports, chat |
| **TanStack Query** | Fetching and caching server data | Loading and error states for free |
| **Zustand** | A tiny state store | Holds the live incident list |
| **Framer Motion** | Animation | The animated characters and transitions |
| **Recharts** | Charts | Dashboard graphs |
| **Web Worker** | Runs JavaScript on a background thread | The scanner runs without freezing typing |
| **tesseract.js** | OCR in the browser | Reads text from images |

**React concepts to know.**
* **Component:** a reusable piece of UI. **Props:** data passed from parent to child (read-only). **State:** data a component owns that can change; changing it re-renders the UI.
* **Hooks:** `useState`, `useEffect` (side effects such as fetching), custom hooks like `useWebSocket`.
* **Virtual DOM:** React compares a lightweight copy of the page to update only what changed.
* React is a *library*; routing, data fetching and state come from other libraries.

**Interview questions**
* **State versus props?** State is owned and mutable inside a component; props are inputs from the parent.
* **Why TypeScript?** Static types prevent a class of bugs and document data shapes.
* **How does the frontend talk to the backend?** REST requests with a bearer token, plus a WebSocket for live events.
* **Why a Web Worker?** To keep heavy work off the UI thread.

---

## 2.17 Docker and Docker Compose

**What they are.** *Docker* packages an application and everything it needs into an **image**; a running copy is a **container**. A *Dockerfile* lists the build steps. *Docker Compose* describes several containers together in one file.

**Why here.** The project needs PostgreSQL, Redis, the backend, the proxy, a worker and the frontend. Compose starts them all with one command and gives everyone the same environment.

**Concepts.** Image versus container, volume (data that survives a restart), port mapping (`8888:8888`), environment variables for configuration, health checks, `depends_on`. A container shares the host's kernel, which makes it lighter than a virtual machine. Horizontal scaling means running more containers; vertical scaling means a bigger machine.

**Interview questions**
* **Docker versus virtual machine?** A VM virtualises a whole OS; a container isolates a process and shares the host kernel.
* **Why environment variables for secrets?** They keep secrets out of source code, but a proper secrets manager is better in production.
* **What is a volume?** Storage that outlives a container.

---

## 2.18 Testing: pytest and vitest

* **pytest** (Python) and **vitest** (TypeScript) run automated tests.
* **Unit test:** one function. **Integration test:** several parts together. **Fixture / mock:** a prepared environment or a fake dependency.
* The project's interesting tests are about *properties*: a secret never reaches the model through the raw API, logs never contain the payload, the pipeline blocks if the scanner breaks, and the TypeScript scanner agrees with the Python one.
* Say what you know: most tests ran, a couple fail or are timing-sensitive, and real-world conditions (real AI sites, Docker, TLS interception) were not covered by automated tests.

**Interview questions**
* **What makes a good test?** Fast, repeatable, independent, and checks behaviour not implementation.
* **What is test coverage and its limit?** The share of code run by tests; high coverage does not prove correctness.
