"""Model Evaluation & Threshold Tuning Engine."""

import math
from typing import Any


def evaluate_model_predictions(
    y_true: list[int],
    y_scores: list[float],
    threshold: float = 0.67,
) -> dict[str, Any]:
    """Compute detailed evaluation metrics, confusion matrix, and ROC curve points."""
    y_pred = [1 if score >= threshold else 0 for score in y_scores]

    tp = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 1 and pred == 1)
    fp = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 0 and pred == 1)
    tn = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 0 and pred == 0)
    fn = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 1 and pred == 0)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    # Generate ROC curve coordinates across thresholds [0.0..1.0]
    roc_points = []
    for t_step in range(0, 101, 10):
        t = t_step / 100.0
        p_temp = [1 if s >= t else 0 for s in y_scores]
        tp_t = sum(1 for gt, pred in zip(y_true, p_temp) if gt == 1 and pred == 1)
        fp_t = sum(1 for gt, pred in zip(y_true, p_temp) if gt == 0 and pred == 1)
        fn_t = sum(1 for gt, pred in zip(y_true, p_temp) if gt == 1 and pred == 0)
        tn_t = sum(1 for gt, pred in zip(y_true, p_temp) if gt == 0 and pred == 0)

        tpr = tp_t / (tp_t + fn_t) if (tp_t + fn_t) > 0 else 0.0
        fpr = fp_t / (fp_t + tn_t) if (fp_t + tn_t) > 0 else 0.0
        roc_points.append({"threshold": t, "FPR": round(fpr, 3), "TPR": round(tpr, 3)})

    return {
        "threshold": threshold,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "confusion_matrix": {"TP": tp, "FP": fp, "TN": tn, "FN": fn},
        "roc_curve": roc_points,
    }
