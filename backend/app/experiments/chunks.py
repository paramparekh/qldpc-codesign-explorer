"""Combine contiguous deterministic trial batches without averaging proportions."""

from copy import deepcopy
from typing import Any

from app.experiments.statistics import wilson_interval


def merge_results(previous: dict[str, Any] | None, chunk: dict[str, Any], failure_limit: int) -> dict[str, Any]:
    if previous is None:
        return deepcopy(chunk)
    merged = deepcopy(previous)
    merged["total_trials_completed"] += chunk["total_trials_completed"]
    merged["runtime_seconds"] += chunk["runtime_seconds"]
    merged["cancelled"] = chunk["cancelled"]
    points = {point["probability"]: deepcopy(point) for point in previous["points"]}
    for point in chunk["points"]:
        probability = point["probability"]
        if probability not in points:
            points[probability] = deepcopy(point)
            continue
        old = points[probability]
        before, added = old["trials_completed"], point["trials_completed"]
        total = before + added
        for field in ("average_error_weight", "average_correction_weight", "average_residual_weight"):
            old[field] = (round(old[field] * before) + round(point[field] * added)) / total
        old["average_decode_time_ms"] = (
            old["average_decode_time_ms"] * before + point["average_decode_time_ms"] * added
        ) / total
        for field in ("trials_completed", "successes", "logical_failures", "exact_matches", "stabilizer_successes"):
            old[field] += point[field]
        old["runtime_seconds"] += point["runtime_seconds"]
        old["logical_error_rate"] = old["logical_failures"] / total
        old["confidence_interval"] = list(wilson_interval(old["logical_failures"], total, old["confidence_level"]))
    merged["points"] = sorted(points.values(), key=lambda point: point["probability"])
    for field in ("saved_failures", "disagreements"):
        merged[field] = (list(previous[field]) + list(chunk[field]))[:failure_limit]
    paired = {point["probability"]: deepcopy(point) for point in previous["paired_outcomes"]}
    for point in chunk["paired_outcomes"]:
        if point["probability"] not in paired:
            paired[point["probability"]] = deepcopy(point)
        else:
            for key in point:
                if key != "probability":
                    paired[point["probability"]][key] += point[key]
    merged["paired_outcomes"] = sorted(paired.values(), key=lambda point: point["probability"])
    if chunk["comparison"] is not None:
        merged["comparison"] = merge_results(previous["comparison"], chunk["comparison"], failure_limit)
    return merged
