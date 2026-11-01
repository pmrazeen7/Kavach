"""CI gate: the labelled evaluation corpus must stay above the recall / false-alarm thresholds."""

import os

os.environ.setdefault("SCANNER_HMAC_KEY", "eval-only-key")

from scanner.eval import corpus, run


def test_eval_thresholds_hold():
    scanner, fp_samples = run.make_scanner()
    samples = corpus.build() + fp_samples + corpus.real_code_samples()
    summary = run.summarize(run.evaluate(samples, scanner))
    failures = run.gate(summary)
    assert not failures, "\n".join(failures)
    assert summary["n"] > 3000


def test_corpus_is_deterministic_and_labelled():
    a, b = corpus.build(), corpus.build()
    assert [s["text"] for s in a] == [s["text"] for s in b]
    cats = {s["category"].split(":")[0] for s in a}
    assert {"format", "pii", "evasion", "bare", "context", "adversarial", "neg"} <= cats
    assert sum(1 for s in a if s["category"].startswith("format:")) >= 60 * 5  # 70+ provider formats x 6 samples
    assert all(s["kind"] in ("pos", "neg") for s in a)
