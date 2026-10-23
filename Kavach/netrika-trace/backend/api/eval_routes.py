"""Model Evaluation & Benchmark API Routes (v1)."""

import logging
import json
from aiohttp import web
from backend.auth.rbac import get_current_user_from_request, require_permission
from database.crud import get_latest_model_evaluations, save_model_evaluation

logger = logging.getLogger(__name__)


def calculate_metrics(y_true: list[int], y_pred: list[int]) -> dict:
    """Calculate Precision, Recall, F1 score, and Confusion Matrix."""
    tp = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 1 and pred == 1)
    fp = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 0 and pred == 1)
    tn = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 0 and pred == 0)
    fn = sum(1 for gt, pred in zip(y_true, y_pred) if gt == 1 and pred == 0)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "confusion_matrix": {"TP": tp, "FP": fp, "TN": tn, "FN": fn},
    }


@require_permission("view_analytics")
async def api_run_evaluation(request: web.Request) -> web.Response:
    """POST /api/v1/eval/evaluate — Run evaluation suite on test predictions."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user else None

        body = await request.json()
        model_version = body.get("model_version")
        dataset_name = body.get("dataset_name")
        y_true = body.get("y_true")
        y_pred = body.get("y_pred")
        if not isinstance(body, dict) or (
            not isinstance(model_version, str) or not model_version.strip()
            or not isinstance(dataset_name, str) or not dataset_name.strip()
            or not isinstance(y_true, list) or not isinstance(y_pred, list)
            or not y_true or len(y_true) != len(y_pred) or len(y_true) > 100_000
            or any(type(value) is not int or value not in (0, 1) for value in y_true + y_pred)
        ):
            return web.json_response(
                {"error": "Provide model_version, dataset_name, and matching non-empty binary y_true/y_pred arrays (max 100000)."},
                status=400,
            )

        metrics = calculate_metrics(y_true, y_pred)

        eval_record = save_model_evaluation(
            model_version=model_version,
            dataset_name=dataset_name,
            precision=metrics["precision"],
            recall=metrics["recall"],
            f1_score=metrics["f1_score"],
            confusion_matrix=metrics["confusion_matrix"],
            org_id=org_id,
        )

        return web.json_response({
            "id": eval_record.id,
            "model_version": eval_record.model_version,
            "dataset_name": eval_record.dataset_name,
            "precision": eval_record.precision,
            "recall": eval_record.recall,
            "f1_score": eval_record.f1_score,
            "confusion_matrix": metrics["confusion_matrix"],
            "timestamp": eval_record.timestamp.isoformat(),
        })
    except Exception as e:
        logger.exception("[EVALUATE] Failed to run evaluation")
        return web.json_response({"error": "Unable to run evaluation"}, status=500)


@require_permission("view_analytics")
async def api_get_evaluations(request: web.Request) -> web.Response:
    """GET /api/v1/eval/latest — Fetch latest evaluation benchmarks."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None
        evals = get_latest_model_evaluations(limit=10, org_id=org_id)
        data = [
            {
                "id": e.id,
                "model_version": e.model_version,
                "dataset_name": e.dataset_name,
                "precision": e.precision,
                "recall": e.recall,
                "f1_score": e.f1_score,
                "confusion_matrix": json.loads(e.confusion_matrix_json or "{}"),
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            }
            for e in evals
        ]
        return web.json_response(data)
    except Exception as e:
        logger.exception("[EVALUATION-LATEST] Failed to load evaluations")
        return web.json_response({"error": "Unable to load evaluations"}, status=500)
