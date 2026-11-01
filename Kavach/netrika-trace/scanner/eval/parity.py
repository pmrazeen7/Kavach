"""Dump the Python engine's answers so the TypeScript engine can be checked against them.

    python -m scanner.eval.parity       # writes scanner/eval/parity.json

The vitest suite (frontend/src/scanner/parity.test.ts) replays the same inputs and
fails if the two engines drift apart.
"""

from __future__ import annotations

import json
import os
import pathlib
import random

os.environ.setdefault("SCANNER_HMAC_KEY", "eval-only-key")

from scanner import statistical as st  # noqa: E402
from scanner import synth  # noqa: E402
from scanner.engine import Scanner  # noqa: E402
from scanner.eval import corpus  # noqa: E402
from scanner.settings import Store  # noqa: E402

OUT = pathlib.Path(__file__).with_name("parity.json")


def tokens(n: int = 700) -> list[dict]:
    rng = random.Random(4242)
    out = []
    for train in (True, False):
        W = synth.Words(train=train)
        for _ in range(n // 2):
            tok, kind, alone, small = synth.sample(rng, W, rng.random() < 0.5)
            p, x = st.probability(tok, alone, small)
            out.append({"token": tok, "alone": alone, "small": small, "p": p, "x": x})
    for tok in ["xyzwudguwd", "Summer2024!", "aiohttp.WSMsgType.ERROR", "okhdfcbank", "120_000", "a8Fk29QzLmP3vX7c", "user_name", "Rajeshwari", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"]:
        p, x = st.probability(tok, True, True)
        out.append({"token": tok, "alone": True, "small": True, "p": p, "x": x})
    return out


def samples() -> list[dict]:
    scanner = Scanner(Store())  # no fingerprints: the browser engine does not have layer 4
    out = []
    for s in corpus.build():
        r = scanner.scan(s["text"], history=s.get("history", []), policy="balanced")
        out.append({"id": s["id"], "action": r.action, "types": sorted({f.type for f in r.findings})})
    return out


if __name__ == "__main__":
    data = {"tokens": tokens(), "samples": samples()}
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(data['tokens'])} tokens, {len(data['samples'])} samples")
