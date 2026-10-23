"""Train the bare-token classifier (logistic regression, numpy only).

    python -m scanner.train_lexicon   # once, builds rules/lexicon.json
    python -m scanner.train_model     # writes rules/model.json

Positives are synthetic random-looking secrets (no label, no prefix). Hard
negatives are words, identifiers, UUIDs, hashes, CSS classes, filenames,
versions, code symbols and structured references. Trained on 75% of the
dictionary words; the evaluation harness uses the other 25%.
"""

from __future__ import annotations

import json
import pathlib
import random

import numpy as np

from scanner import statistical as st
from scanner.synth import NEGATIVES, POSITIVES, Words, sample  # noqa: F401

OUT = pathlib.Path(__file__).parent / "rules" / "model.json"


def build(n_pos: int, n_neg: int, seed: int, train: bool):
    rng = random.Random(seed)
    W = Words(train=train)
    X, y, kinds = [], [], []
    for label, n in ((1, n_pos), (0, n_neg)):
        for _ in range(n):
            tok, kind, alone, small = sample(rng, W, bool(label))
            X.append(st.features(tok, alone, small))
            y.append(label)
            kinds.append(kind)
    return np.array(X, dtype=float), np.array(y, dtype=float), kinds


def fit(X: np.ndarray, y: np.ndarray, l2: float = 1.0, iters: int = 60):
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    mean[0], std[0] = 0.0, 1.0
    std[std < 1e-9] = 1.0
    Z = (X - mean) / std
    Z[:, 0] = 1.0
    w = np.zeros(Z.shape[1])
    reg = np.eye(Z.shape[1]) * l2
    reg[0, 0] = 0.0
    for _ in range(iters):  # IRLS / Newton
        p = 1 / (1 + np.exp(-np.clip(Z @ w, -30, 30)))
        g = Z.T @ (p - y) + reg @ w
        H = (Z.T * (p * (1 - p))) @ Z + reg + np.eye(Z.shape[1]) * 1e-6
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-7:
            break
    return w, mean, std


def main() -> None:
    Xtr, ytr, _ = build(14000, 20000, seed=7, train=True)
    w, mean, std = fit(Xtr, ytr)
    OUT.write_text(
        json.dumps({"features": st.FEATURE_NAMES, "w": w.tolist(), "mean": mean.tolist(), "std": std.tolist()}, separators=(",", ":")),
        encoding="utf-8",
    )
    st.model.cache_clear()
    # Quick held-out sanity check (the full evaluation lives in scanner/eval).
    Xte, yte, kinds = build(4000, 6000, seed=99, train=False)
    Z = (Xte - mean) / std
    Z[:, 0] = 1.0
    p = 1 / (1 + np.exp(-np.clip(Z @ w, -30, 30)))
    pred = p >= 0.5
    tp = int(((pred == 1) & (yte == 1)).sum())
    fp = int(((pred == 1) & (yte == 0)).sum())
    fn = int(((pred == 0) & (yte == 1)).sum())
    print(f"held-out: precision={tp / max(1, tp + fp):.4f} recall={tp / max(1, tp + fn):.4f} fp={fp} fn={fn}")
    for token in ["xyzwudguwd", "hello", "Rajeshwari", "kubernetes", "userName", "a8Fk29QzLmP3vX7c", "Summer2024!"]:
        pr, _ = st.probability(token, alone_in_line=True, msg_small=True)
        print(f"  {token:20s} p={pr:.3f}")


if __name__ == "__main__":
    main()
