"""Evaluation harness: precision and recall per layer and per category.

    python -m scanner.eval.run            # print + write scanner/eval/REPORT.md and corpus.json
    python -m scanner.eval.run --check    # exit 1 if a threshold in THRESHOLDS is missed (CI gate)

The corpus is synthetic and deterministic (see corpus.py); the numbers measure
the engine against it, not against all of real-world traffic.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import statistics
import sys
import time
from collections import defaultdict

os.environ.setdefault("SCANNER_HMAC_KEY", "eval-only-key")

from scanner.engine import Scanner  # noqa: E402
from scanner.eval import corpus  # noqa: E402
from scanner.fingerprints import FingerprintStore  # noqa: E402
from scanner.result import ACTION_RANK  # noqa: E402
from scanner.settings import Store  # noqa: E402

HERE = pathlib.Path(__file__).parent

# Gate for CI. Chosen from measured results with a small safety margin (see REPORT.md).
THRESHOLDS = {
    "recall:formats": 0.99,
    "recall:pii": 0.97,
    "recall:evasions": 0.95,
    "recall:bare-random": 0.95,
    "recall:context": 0.97,
    "recall:fingerprints": 1.0,
    "recall:adversarial": 1.0,
    "false_alarm_rate": 0.03,
    "real_code_false_alarm_rate": 0.04,
    "p95_ms": 50.0,
}

GROUPS = {
    "formats": lambda c: c.startswith("format:"),
    "pii": lambda c: c.startswith("pii:"),
    "evasions": lambda c: c.startswith("evasion:"),
    "bare-random": lambda c: c == "bare:random",
    "bare-human-password": lambda c: c == "bare:human_password",
    "context": lambda c: c.startswith("context:"),
    "fingerprints": lambda c: c.startswith("fingerprint:"),
    "adversarial": lambda c: c.startswith("adversarial:"),
}


def make_scanner() -> tuple[Scanner, list[dict]]:
    store = Store()
    fps = FingerprintStore()
    values, fp_samples = corpus.fingerprint_samples()
    for value, canary in values:
        fps.add(value, "canary:eval" if canary else "env:eval", canary=canary)
    store.save_fingerprints(fps)
    return Scanner(store), fp_samples


def evaluate(samples: list[dict], scanner: Scanner) -> dict:
    rows = []
    times = []
    for s in samples:
        t = time.perf_counter()
        res = scanner.scan(s["text"], history=s.get("history", []), policy="balanced", deep=False)
        times.append((time.perf_counter() - t) * 1000)
        top = max(res.findings, key=lambda f: (ACTION_RANK[f.action], f.confidence), default=None)
        if s["kind"] == "pos":
            ok = ACTION_RANK[res.action] >= ACTION_RANK[s["expect"]]
        else:
            ok = ACTION_RANK[res.action] < ACTION_RANK["TOKENIZE"]
        rows.append({**s, "action": res.action, "ok": ok, "top_layer": top.layer if top else None, "top_type": top.type if top else None, "warn": res.action == "WARN", "ms": times[-1]})
    return {"rows": rows, "times": times}


def summarize(data: dict) -> dict:
    rows = data["rows"]
    pos = [r for r in rows if r["kind"] == "pos"]
    neg = [r for r in rows if r["kind"] == "neg"]
    tp = sum(r["ok"] for r in pos)
    fa = sum(not r["ok"] for r in neg)
    out: dict = {
        "n": len(rows), "n_pos": len(pos), "n_neg": len(neg),
        "overall_recall": tp / len(pos), "overall_precision": tp / max(1, tp + fa),
        "false_alarm_rate": fa / len(neg), "warn_rate_on_negatives": sum(r["warn"] for r in neg) / len(neg),
        "groups": {}, "categories": {}, "layers": {}, "false_alarms_by_layer": {}, "false_alarms_by_category": {}, "misses": [],
    }
    for name, pred in GROUPS.items():
        g = [r for r in pos if pred(r["category"])]
        if g:
            out["groups"][name] = {"n": len(g), "caught": sum(r["ok"] for r in g), "recall": sum(r["ok"] for r in g) / len(g)}
    cats: dict[str, list] = defaultdict(list)
    for r in rows:
        cats[r["category"]].append(r)
    for c, rs in sorted(cats.items()):
        if rs[0]["kind"] == "pos":
            out["categories"][c] = {"kind": "pos", "n": len(rs), "recall": sum(r["ok"] for r in rs) / len(rs)}
        else:
            out["categories"][c] = {"kind": "neg", "n": len(rs), "false_alarm_rate": sum(not r["ok"] for r in rs) / len(rs)}
    layers: dict[int, list] = defaultdict(list)
    for r in pos:
        layers[r["layer"]].append(r)
    for lyr, rs in sorted(layers.items()):
        caught = [r for r in rs if r["ok"]]
        by_top: dict = defaultdict(int)
        for r in caught:
            by_top[str(r["top_layer"])] += 1
        out["layers"][str(lyr)] = {"n": len(rs), "recall": len(caught) / len(rs), "caught_by_layer": dict(by_top)}
    for r in neg:
        if not r["ok"]:
            out["false_alarms_by_layer"][str(r["top_layer"])] = out["false_alarms_by_layer"].get(str(r["top_layer"]), 0) + 1
            out["false_alarms_by_category"][r["category"]] = out["false_alarms_by_category"].get(r["category"], 0) + 1
    out["misses"] = [{"id": r["id"], "category": r["category"], "action": r["action"], "tags": r["tags"]} for r in pos if not r["ok"]][:40]
    out["false_alarms"] = [{"id": r["id"], "category": r["category"], "action": r["action"], "type": r["top_type"], "text": r["text"][:80]} for r in neg if not r["ok"]][:40]
    t = sorted(data["times"])
    out["latency_ms"] = {"p50": statistics.median(t), "p95": t[int(len(t) * 0.95)], "p99": t[int(len(t) * 0.99)], "max": t[-1]}
    return out


def gate(summary: dict) -> list[str]:
    failures = []
    for key, minimum in THRESHOLDS.items():
        if key.startswith("recall:"):
            g = summary["groups"].get(key.split(":", 1)[1])
            if g and g["recall"] < minimum:
                failures.append(f"{key} = {g['recall']:.4f} < {minimum}")
        elif key == "real_code_false_alarm_rate":
            c = summary["categories"].get("neg:real-code")
            if c and c["false_alarm_rate"] > minimum:
                failures.append(f"real_code_false_alarm_rate = {c['false_alarm_rate']:.4f} > {minimum}")
        elif key == "false_alarm_rate" and summary["false_alarm_rate"] > minimum:
            failures.append(f"false_alarm_rate = {summary['false_alarm_rate']:.4f} > {minimum}")
        elif key == "p95_ms" and summary["latency_ms"]["p95"] > minimum:
            failures.append(f"p95 latency = {summary['latency_ms']['p95']:.1f} ms > {minimum}")
    return failures


def report_md(s: dict, failures: list[str]) -> str:
    L = ["# Scanner evaluation report", "", "Generated by `python -m scanner.eval.run` on a synthetic, seeded corpus (see `scanner/eval/corpus.py`).", "Policy profile: **balanced**. A positive counts as caught when the scanner takes at least the expected action (BLOCK for secrets and card/bank numbers, TOKENIZE for Aadhaar/PAN/SSN, WARN for email/phone/IP). A negative is a false alarm when the scanner would interrupt the user (TOKENIZE, REDACT or BLOCK); a WARN is tolerated and reported separately.", ""]
    L += [f"- Samples: **{s['n']}** ({s['n_pos']} positive, {s['n_neg']} negative)", f"- Overall recall: **{s['overall_recall']:.2%}**", f"- Overall precision: **{s['overall_precision']:.2%}**",
          f"- False-alarm rate on hard negatives: **{s['false_alarm_rate']:.2%}** (plus {s['warn_rate_on_negatives']:.2%} that only warn)",
          f"- Latency per scan: p50 {s['latency_ms']['p50']:.2f} ms, p95 {s['latency_ms']['p95']:.2f} ms, p99 {s['latency_ms']['p99']:.2f} ms", ""]
    L += ["## Recall by group", "", "| Group | Samples | Caught | Recall | CI gate |", "|---|---:|---:|---:|---:|"]
    for name, g in s["groups"].items():
        gate_v = THRESHOLDS.get(f"recall:{name}")
        L.append(f"| {name} | {g['n']} | {g['caught']} | {g['recall']:.2%} | {f'{gate_v:.0%}' if gate_v else '-'} |")
    L += ["", "## Recall by layer (positives only)", "", "| Layer | Samples | Recall | Top finding came from layer |", "|---|---:|---:|---|"]
    names = {"0": "0 normalize / evasion", "1": "1 known formats", "2": "2 bare-token statistics", "3": "3 context", "4": "4 fingerprints"}
    for lyr, v in s["layers"].items():
        L.append(f"| {names.get(lyr, lyr)} | {v['n']} | {v['recall']:.2%} | {v['caught_by_layer']} |")
    L += ["", "## False alarms by category (hard negatives)", "", "| Category | Samples | False-alarm rate |", "|---|---:|---:|"]
    for c, v in s["categories"].items():
        if v["kind"] == "neg":
            L.append(f"| {c} | {v['n']} | {v['false_alarm_rate']:.2%} |")
    L += ["", f"False alarms by the layer that raised them: `{s['false_alarms_by_layer']}`", ""]
    if s["false_alarms"]:
        L += ["### Sample false alarms", ""] + [f"- `{f['category']}`: `{f['text']}` -> {f['action']} ({f['type']})" for f in s["false_alarms"][:15]] + [""]
    if s["misses"]:
        L += ["### Sample misses", ""] + [f"- `{m['category']}` {m['tags']} -> {m['action']}" for m in s["misses"][:20]] + [""]
    L += ["## Per-category recall", "", "| Category | Samples | Recall |", "|---|---:|---:|"]
    for c, v in s["categories"].items():
        if v["kind"] == "pos":
            L.append(f"| {c} | {v['n']} | {v['recall']:.0%} |")
    L += ["", "## CI gate", "", "PASS" if not failures else "FAIL:\n" + "\n".join(f"- {f}" for f in failures), ""]
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    scanner, fp_samples = make_scanner()
    samples = corpus.build() + fp_samples + corpus.real_code_samples()
    data = evaluate(samples, scanner)
    summary = summarize(data)
    failures = gate(summary)
    (HERE / "REPORT.md").write_text(report_md(summary, failures), encoding="utf-8")
    (HERE / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    corpus.export()
    print(report_md(summary, failures))
    if args.check and failures:
        print("EVAL GATE FAILED", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
