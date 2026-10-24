<div align="center">

# 🛡️ Kavach

**Stop sensitive data from leaking into LLMs, before it ever leaves your machine.**

Kavach scans everything typed, pasted, or uploaded into an LLM input, detects secrets and personal data (even a bare string with no label like `xyzwudguwd`), and blocks, redacts, or tokenizes it in real time.

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active%20development-peach.svg)](#roadmap)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-mint.svg)](CONTRIBUTING.md)

[Features](#-features) · [How it works](#-how-it-works) · [Quick start](#-quick-start) · [Usage](#-usage) · [Configuration](#-configuration) · [Roadmap](#-roadmap) · [Contributing](#-contributing)

</div>

---

> **Kavach** (कवच) means *armor* or *shield* in Sanskrit.

<!-- TODO: Add a demo GIF or screenshot of the scanner UI here -->
<!-- ![Kavach demo](docs/assets/demo.gif) -->

## 🚨 The problem

People paste API keys, passwords, customer data, and internal code into AI chats every day. Most "secret scanners" only catch obvious patterns like `api_key = "sk-..."`. They miss:

- a **bare token** pasted on its own (`xyzwudguwd`) with no `key:` or `password:` label
- secrets that are **encoded, spaced out, or split** across lines or messages
- **personal and financial data** (IDs, card numbers, health info)
- leaks through **file uploads, images, and the model's own output**

And UI-only checks can be bypassed by calling the API directly.

## ✨ Features

- **Context-free detection.** A statistical detector flags random-looking tokens even with no surrounding keywords.
- **Exact-match fingerprints.** Your real secrets (from `.env`, config, or a vault) are stored only as salted HMAC fingerprints and caught with near-certainty, even as a bare string.
- **150+ known formats** with validators (cloud keys, tokens, JWTs, private keys, DB URLs, cards via Luhn, IBAN, Aadhaar, PAN, and more).
- **PII / PHI / financial data** detection, plus custom rules for internal hostnames and project codenames.
- **Obfuscation-resistant.** Unicode normalization, homoglyph folding, and recursive decoding (URL, base64, hex, reversed, leetspeak).
- **Every channel.** Typed text, paste events (scanned *before* text lands in the box), code blocks, file uploads, images (local OCR), RAG documents, tool-call arguments, and LLM output.
- **Multiple actions.** `BLOCK`, `REDACT`, `TOKENIZE`, `WARN`, or `ALLOW`, driven by strict / balanced / relaxed policies.
- **Reversible tokenization.** Secrets become placeholders like `[SECRET_1]` before reaching the model and are restored locally in the response.
- **Server-side enforcement.** A gateway/middleware means the check can't be skipped by bypassing the frontend.
- **Privacy first.** All scanning runs locally. Logs store metadata and fingerprints, never raw secrets.
- **Delightful UI.** An animated scanner panel with friendly characters (see below).

## 🧠 How it works

Every input passes through a layered pipeline. Each layer feeds one calibrated risk score.

| Layer | What it does |
|------:|--------------|
| **0** | **Normalize:** Unicode NFKC, strip zero-width characters, fold homoglyphs, decode nested encodings |
| **1** | **Known formats:** provider signatures plus checksum validators |
| **2** | **Statistical detector:** entropy, character n-gram plausibility, dictionary checks, isolation signal, local classifier |
| **3** | **Context signals:** nearby words, assignment syntax, `.env`/JSON/YAML shapes, auth headers (boosts score, never required) |
| **4** | **Fingerprints:** exact-match of your real secrets via salted HMAC; canary/honeytoken support |
| **5** | **PII/PHI/financial:** NER plus configurable business rules |
| **6** | **Channels:** text, paste, files, images, multi-turn history, RAG, tool calls, model output |
| **7** | **Decision engine:** risk score → `BLOCK` / `REDACT` / `TOKENIZE` / `WARN` / `ALLOW` |
| **8** | **Verification:** labelled corpus, adversarial tests, CI gates on precision/recall |

**Fail-closed by design:** ambiguous opaque tokens are blocked pending a one-click "Yes, it's safe" confirmation.

```
 User input ──► Kavach Scanner ──► Decision Engine ──► LLM
 (type/paste/     (layers 0–6)       BLOCK / REDACT /     │
  file/image)                        TOKENIZE / WARN      ▼
                                                      LLM output ──► Kavach (output scan) ──► User
```

## 🎨 The scanner UI

A polished, animated panel attached to the LLM input box:

| Character | Role |
|-----------|------|
| 🤖 **Sentinel** | Guard robot with a scanner visor. Sweeps a scan beam, reacts to findings, stamps `BLOCKED`, gives a thumbs-up when safe |
| 🏦 **Vault** | Swallows redacted secrets (they pixelate and fly in) |
| 🔍 **Lens** | Detective that explains *why* a token was flagged |

**States:** Idle → Scanning → Found → Blocked / Safe, with file-upload "conveyor belt" inspection and instant paste scanning.
Accessible (aria-live, keyboard support, `prefers-reduced-motion`) and responsive.

## 🚀 Quick start

> ⚠️ **TODO:** Replace the commands below with your project's actual stack and scripts.

```bash
# 1. Clone
git clone https://github.com/<your-username>/kavach.git
cd kavach

# 2. Install dependencies
npm install          # or: pip install -r requirements.txt

# 3. Configure
cp .env.example .env

# 4. Run
npm run dev          # or your start command
```

## 💡 Usage

### As a library

```ts
import { scan } from "kavach";

const result = await scan("xyzwudguwd");

console.log(result.action);   // "BLOCK"
console.log(result.findings); // [{ type: "suspicious_token", confidence: 0.93, ... }]
```

### As a gateway / middleware

```ts
import express from "express";
import { kavachMiddleware } from "kavach/server";

const app = express();
app.use(express.json());
app.use("/api/chat", kavachMiddleware({ policy: "strict" }));
```

### Fingerprinting your real secrets

```bash
# Build salted HMAC fingerprints from your env files (raw values are never stored)
npx kavach fingerprint --from .env --out .kavach/fingerprints.json
```

> ⚠️ **TODO:** Adjust the API names above to match your real implementation.

## ⚙️ Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `policy` | `strict`, `balanced`, or `relaxed` | `balanced` |
| `failClosed` | Block ambiguous tokens pending confirmation | `true` |
| `scanOutput` | Also scan LLM responses | `true` |
| `tokenize` | Replace secrets with reversible placeholders | `true` |
| `allowlist` | Hash-based list of values marked safe | `[]` |
| `customPatterns` | Your own regex/rules (hostnames, codenames, etc.) | `[]` |
| `fingerprintSources` | `.env`, config files, or vault exports | `[".env"]` |

## 🧪 Testing and evaluation

```bash
npm test                 # unit and integration tests
npm run eval             # precision/recall report on the labelled corpus
```

The evaluation harness covers 150+ secret formats, PII samples, and hard negatives (real words, UUIDs, git SHAs, hashes, identifiers), plus adversarial cases: bare tokens, base64-wrapped, spaced-out, split across messages, leetspeak, homoglyphs, secrets in code/JSON/files/images. CI fails if recall or false-positive thresholds regress.

> 📊 **TODO:** Publish your measured precision/recall numbers here once the eval harness runs.

## ⚠️ Honest limitations

No detector can guarantee 100% on every possible string. A short random token on its own is genuinely ambiguous. Kavach reduces this risk with layered detection, exact-match fingerprints, and fail-closed defaults, but:

- A secret you never registered, in a format never seen before, may be flagged only by the statistical layer.
- Heavily custom obfuscation may evade detection.
- Detection quality depends on your policy and allowlist tuning.

Treat Kavach as a strong safety net, not a substitute for good secret hygiene (rotating keys, least privilege, vaults).

## 🗺️ Roadmap

- [x] Layered detection engine
- [x] Animated scanner UI with characters
- [ ] Browser extension for third-party chat UIs
- [ ] Vault integrations (HashiCorp Vault, AWS Secrets Manager)
- [ ] Team policies and dashboards
- [ ] More locale-specific ID formats
- [ ] Plugin API for custom detectors

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repo and create a branch (`git checkout -b feature/my-feature`)
2. Add tests for new detectors (include **hard negatives**, not just positives)
3. Run `npm test` and `npm run eval`
4. Open a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 🔐 Security

Found a vulnerability or a bypass? Please **do not** open a public issue. Email **<your-email@example.com>** or use GitHub's private security advisories. See [SECURITY.md](SECURITY.md).

## 📄 License

Released under the [MIT License](LICENSE).

---

<div align="center">

Built with care to keep your secrets *yours*. 🛡️

</div>
