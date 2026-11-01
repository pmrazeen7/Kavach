# Scanner changelog

## What was added

* **Engine** (`scanner/`): layers 0 to 5 and 7, a server-only fingerprint layer, 85 provider/PII rules, a trained
  bare-token model, 12 evasion decoders, multi-turn scanning, file extraction (`txt/csv/json/docx/pdf/zip`).
* **Browser engine** (`frontend/src/scanner/`): the same logic in TypeScript, running in a Web Worker, with a parity
  test against the Python engine; an extension bundle (`extension/kavach-scanner.js`) and a paste guard
  (`extension/paste_guard.js`).
* **Enforcement**: `backend/scanner_gate.py` (auth + server-side scan of every chat message, HTTP 422 on BLOCK,
  rewrite on REDACT/TOKENIZE), model-reply scanning in the chat API and the proxy, fail-closed in the pipeline.
* **UI**: composer with live scanning, scan beam, flagged-token underline/mask, BLOCKED stamp, paste inspection,
  findings drawer (Redact, Placeholder, Allow once, Mark as safe, Learn more, Redact all, Fix all and send),
  reversible placeholders restored on the user's device, image OCR, conveyor-belt upload animation, characters
  Sentinel, Vault and Lens, and a **Detection > Scanner** settings tab.
* **Verification**: 4,045-sample labelled corpus, per-layer/per-category report, CI gate, parity tests, adversarial,
  backtracking, privacy (log) and fail-closed tests, GitHub Actions workflow.

## Measured results (balanced profile, `scanner/eval/REPORT.md`)

| | Result |
|---|---|
| Known provider formats (438) | 100% caught |
| PII / financial IDs (132) | 100% |
| Evasions: spaced, base64, base64url, hex, URL, double-encoded, reversed, homoglyph, zero-width, HTML entities, line-split, split across messages (168) | 100% |
| Labelled / context secrets, 20 label words incl. non-English and leetspeak (200) | 100% |
| **Bare random strings with no keyword (818)** | **98.2%** (e.g. `xyzwudguwd` is blocked) |
| Human-style passwords with no label, such as `Summer2024!` (82) | **84.2%** |
| Your registered secrets and canaries (175) | 100% |
| Adversarial instructions aimed at the scanner (40) | 100% |
| False alarms on hard negatives (prose, code, UUIDs, hashes, CSS, paths, identifiers, unfamiliar names, placeholders, and 592 chunks of this repo's own source) | **1.0%** overall, **3.0%** on the real-code chunks alone |
| Latency per scan | p50 0.5 ms, p95 about 20 ms (30-line code chunks); normal prompts about 1 ms |

These numbers come from a synthetic corpus and this repository's code; they measure the engine, not all of real
traffic. The corpus was written by the same people who wrote the detectors, which flatters the result.

## Honest limitations

1. **No scanner can guarantee that nothing leaks.** Someone determined can paraphrase a secret ("the key starts with
   a seven and ends with a nine"), retype it from memory, or encode it in a way not on the decoder list.
2. **Unlabelled secrets are a statistical call.** Short or word-like values (a human password like `Summer2024!`,
   a passphrase of ordinary words) are caught much less reliably than random keys; 16% of the synthetic
   human-style passwords were missed. Ordinary but unfamiliar single words (a rare surname, a brand) can be
   blocked until confirmed; about 2% of the unfamiliar-name samples were.
3. **The model is small and trained on synthetic data.** No leaked-credential dataset was used on purpose, so real
   secrets with unusual shapes may behave differently.
4. **Layer 4 only knows secrets you registered**, from files inside the project root; a secret that lives only in a
   vault or someone's head is invisible to it. Losing `SCANNER_HMAC_KEY` silently disables it.
5. **Layer 4 is not in the browser or extension** (by design); the browser relies on the server check for it and on
   its own layers when the server is unreachable (it then says so and stays locked on local BLOCKs).
6. **Coverage by channel.** Streamed (SSE) model replies are not masked by the proxy. Images are read with OCR in
   the chat sandbox only (clean screenshots; photos and handwriting are unreliable, and OCR makes mistakes). Scanned
   PDFs have no text layer and need OCR that is not wired in. The extension guards text pastes, not typing, and
   was verified with a simulated paste on localhost, not on the real AI sites. RAG chunks and tool-call arguments
   are covered only if the caller sends them through `POST /api/v1/scanner/scan`.
7. **Multi-turn scanning** covers the last 6 user messages of a session.
8. **Not every decoder is covered**: ROT13, custom ciphers, secrets inside images, archives deeper than two levels
   and BIP-39 seed phrases are not recognised.
9. **Language coverage**: label words exist for about 25 languages; the dictionary is English plus a curated list of
   transliterated Hindi and Indian names. Other languages' ordinary words look "random" to Layer 2.
10. **The legacy proxy still lets traffic through if the whole analysis pipeline crashes**, unless
    `PROXY_FAIL_CLOSED=1` is set. The scanner layer itself fails closed.
11. **Existing weaknesses outside this work**: `JWT_SECRET` falls back to a hard-coded default, and the default admin
    password is seeded in source. Change both before any real deployment.
12. **One pre-existing test fails**: `test_code_detector.py::test_detects_env_variables` (the old regex detector).
13. **Chat endpoints now require sign-in** (they were open). The extension keeps using `/api/v1/analyze`, unchanged.
