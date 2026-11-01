# Layered sensitive-data scanner

A local, offline scanner that decides whether text may leave for an AI service. It catches labelled
secrets (`api_key = ...`), provider-format secrets, personal and financial IDs, **and unlabelled random
strings** such as `xyzwudguwd`, then maps the evidence to an action: `BLOCK`, `REDACT`, `TOKENIZE`
(reversible placeholders), `WARN` or `ALLOW`.

Nothing here calls a network service. The engine exists twice, from one shared rule pack:

| | Python (`scanner/`) | TypeScript (`frontend/src/scanner/`) |
|---|---|---|
| Runs | on the server: authoritative, enforces | in a Web Worker in the browser and in the extension |
| Layers | 0, 1, 2, 3, **4**, 5 (+ Presidio/spaCy "deep" mode) | 0, 1, 2, 3, 5 |
| Shared | `scanner/rules/formats.json`, `lexicon.json`, `model.json` | the same files |
| Drift guard | `scanner/eval/parity.py` dumps answers | `parity.test.ts` replays them |

Layer 4 (fingerprints of your own secrets) is server-only on purpose: shipping them to a browser would let
anyone with the page guess low-entropy secrets offline.

## Layers

0. **Normalize** (`normalize.py`): NFKC, strip zero-width/bidi characters, fold Cyrillic/Greek look-alikes,
   collapse spaced-out secrets (`s k - 1 2 3`), join wrapped lines, then depth-limited decoding of base64,
   hex, URL-encoding, HTML entities and reversed strings. Every decoded view is scanned too, and findings map
   back to the original text span.
1. **Known formats + validators** (`rules/formats_src.py`, `validators.py`): 85 rules. Cloud and CI tokens, payment and
   messaging keys, AI-provider keys, JWT (structure verified), PEM/SSH keys, DB URLs, credentials in URLs; plus
   Luhn, Verhoeff (Aadhaar), PAN, GSTIN, IFSC, IBAN mod-97, SSN and passport shape checks.
2. **Context-free statistics** (`statistical.py`): per token, length, Shannon entropy, character mix, vowel and
   consonant runs, a trigram language model over ~52k words, dictionary coverage, "is it a UUID / hash / CSS
   class / path / identifier / SVG path", and whether it stands alone. A small logistic regression turns that
   into a probability. Ambiguous opaque tokens **block by default** and ask the user to confirm.
3. **Context** (`context.py`): label words in about 25 languages (leetspeak folded), `.env`/YAML/JSON/`export`
   shapes, curl headers and CLI flags. Context raises confidence; it is never required.
4. **Fingerprints** (`fingerprints.py`): keyed HMAC-SHA256 of the secrets in your `.env`/JSON files, matched
   against every token and substring (a keyed 4-character anchor avoids hashing every window). Canary tripwires
   alert on any sighting. Only hashes are stored.
5. **Business rules**: configured internal hostnames, codenames, custom regexes; optional Presidio/spaCy
   names/locations and source-code detection (`deep=true`).
7. **Decision** (`decision.py`): noisy-OR risk score and a per-profile (`strict`, `balanced`, `relaxed`) action per
   finding. Known-format secrets and fingerprints can never be "confirmed safe".

Layer 6 (channels): typed text, paste (browser and extension), code blocks, `.txt/.csv/.json/.docx/.pdf/.zip`
uploads (`files.py`), images via local OCR (`frontend/src/scanner/ocr.ts`), multi-turn history, the model's
reply (`/api/chat` and the proxy), and any text via `POST /api/v1/scanner/scan` (use it for RAG chunks and
tool-call arguments).

## API

```python
from scanner import scan
r = scan("deploy with ghp_...", history=["earlier message"], policy="balanced", deep=False)
r.action        # "BLOCK"
r.score         # 0..100
r.findings[0]   # type, label, category, start, end, confidence, reasons, view, masked, fp, action
r.to_dict()     # JSON-safe: masked previews and keyed fingerprints only, never the value
```

HTTP (all require sign-in; settings changes need `edit_policies`):

| Route | Purpose |
|---|---|
| `POST /api/v1/scanner/scan` | `{text, history?, policy?, confirmed?, deep?}` |
| `GET/PATCH /api/v1/scanner/settings` | profile, tokenize, scan_output, hosts, codenames, custom patterns |
| `POST /api/v1/scanner/allow`, `DELETE /api/v1/scanner/allow/{fp}` | mark one token safe / remove |
| `POST /api/v1/scanner/fingerprints/ingest` | fingerprint `.env`/JSON files (inside the project root only) |
| `POST /api/v1/scanner/canaries` | plant a tripwire; a generated value is returned once |

**Server enforcement** is `backend/scanner_gate.py`, an aiohttp middleware on `/api/chat*`: it requires a signed-in
user, scans every message server-side (with conversation history), refuses a `BLOCK` with HTTP 422 before the
model is called, rewrites `REDACT`/`TOKENIZE`, and the chat handler scans the reply. The UI scanner is a helper.
The analyze gateway and the proxy reach the same engine through `agents/forensic_node.py`, which **fails closed**
if the scanner errors.

## Privacy rules the code follows

* Results carry a masked preview and a keyed fingerprint, never the value.
* Logs, incident rows, the WebSocket feed and pipeline state hold metadata only (tests assert this).
* Fingerprints and the allowlist are stored in the existing policy key/value table; the HMAC key comes from
  `SCANNER_HMAC_KEY` or a generated `data/scanner/hmac.key` (git-ignored). **Back that key up**: without it the
  stored fingerprints stop matching.
* Reversible placeholders live in the user's browser memory only.

## Retrain, rebuild, evaluate

```bash
python -m scanner.rules.build        # formats_src.py -> formats.json
python -m scanner.train_lexicon      # lexicon.json from local text (no downloads)
python -m scanner.train_model        # model.json
python -m scanner.eval.run --check   # report + CI gate (writes scanner/eval/REPORT.md)
python -m scanner.eval.corpus && python -m scanner.eval.parity   # generate corpus.json and parity.json (git-ignored), then: cd frontend && npm test
```

If you change a feature or a rule, change it in **both** `statistical.py`/`engine.py` and
`frontend/src/scanner/*`; `npm test` fails if they drift.

## Limitations (what this cannot guarantee)

See `scanner/CHANGELOG.md`, section "Honest limitations".
