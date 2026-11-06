import asyncio
import csv
import io

import pytest

from app.api import experiments as api
from app.codes.registry import HGP_REP3
from app.core.injection import seeded_code_capacity_pattern
from app.experiments.manager import ExperimentManager
from app.experiments.storage import ExperimentStore
from test_experiments import request, wait_for_terminal


@pytest.fixture
def isolated_manager(tmp_path, monkeypatch):
    manager = ExperimentManager(ExperimentStore(tmp_path / "experiments.sqlite3"))
    monkeypatch.setattr(api, "experiment_manager", manager)
    yield manager
    manager.executor.shutdown(wait=True)


def spec(**overrides):
    return {"code_id": HGP_REP3.id, "code_version": HGP_REP3.version,
            "decoder_id": "exact-css-min-weight-v1", "comparison_decoder_id": "bp-osd-css-v1",
            "probabilities": [0.0, 0.1, 0.3], "trials_per_probability": 60,
            "seed": 42, **overrides}


def test_comparison_api_exports_both_decoders_metadata_and_exact_replay_seeds(isolated_manager):
    created = asyncio.run(request("POST", "/api/experiments", spec()))
    assert created.status_code == 202
    experiment_id = created.json()["id"]
    finished = asyncio.run(wait_for_terminal(experiment_id))
    assert finished["status"] == "completed", finished["error_message"]
    result = finished["result"]
    assert result["comparison"]["decoder_settings"]["osd_order"] == 2
    assert result["comparison"]["total_trials_completed"] == result["total_trials_completed"] == 180
    raw = isolated_manager.store.get(experiment_id)["result"]
    for wire_sample, stored_sample in zip(result["saved_failures"], raw["saved_failures"], strict=True):
        assert wire_sample["trial_seed"] == str(stored_sample["trial_seed"])
        assert seeded_code_capacity_pattern(13, wire_sample["probability"], int(wire_sample["trial_seed"])).paulis == tuple(wire_sample["error"])

    exported = asyncio.run(request("GET", f"/api/experiments/{experiment_id}/export?format=json"))
    assert exported.status_code == 200
    assert exported.json() == finished
    assert ".json" in exported.headers["content-disposition"]
    csv_response = asyncio.run(request("GET", f"/api/experiments/{experiment_id}/export?format=csv"))
    assert csv_response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(csv_response.text)))
    assert len(rows) == 6
    assert {row["decoder_id"] for row in rows} == {"exact-css-min-weight-v1", "bp-osd-css-v1"}
    for row in rows:
        assert row["code_version"] == HGP_REP3.version
        assert row["batch_seed"] == "42"
        assert row["batch_generator_version"] == "blake2b-trial-seeds-v1"
        assert row["measurement_model"] == "perfect syndrome measurement"
        assert int(row["trials_completed"]) == 60
        assert float(row["confidence_upper"]) > 0
        assert sum(int(row[key]) for key in ("both_succeed", "primary_only_succeeds", "comparison_only_succeeds", "both_fail")) == 60


def test_exports_reject_missing_or_unfinished_runs_and_invalid_comparisons(isolated_manager):
    assert asyncio.run(request("GET", "/api/experiments/missing/export")).status_code == 404
    isolated_manager.store.create("pending", spec(), 180)
    assert asyncio.run(request("GET", "/api/experiments/pending/export")).status_code == 409
    for comparison, expected in (("missing", 404), ("exact-css-min-weight-v1", 422)):
        assert asyncio.run(request("POST", "/api/experiments", spec(comparison_decoder_id=comparison))).status_code == expected


def test_cancelled_comparison_can_be_exported_with_partial_counts(isolated_manager):
    created = asyncio.run(request("POST", "/api/experiments", spec(trials_per_probability=100_000)))
    experiment_id = created.json()["id"]
    asyncio.run(request("POST", f"/api/experiments/{experiment_id}/cancel"))
    finished = asyncio.run(wait_for_terminal(experiment_id))
    assert finished["status"] == "cancelled"
    result = finished["result"]
    assert result["comparison"]["total_trials_completed"] == result["total_trials_completed"]
    assert asyncio.run(request("GET", f"/api/experiments/{experiment_id}/export?format=json")).json()["result"]["cancelled"]


def test_large_batch_seeds_are_returned_as_exact_decimal_strings(isolated_manager):
    seed = (1 << 63) - 1
    created = asyncio.run(request("POST", "/api/experiments", spec(seed=seed, probabilities=[0.0], trials_per_probability=1)))
    finished = asyncio.run(wait_for_terminal(created.json()["id"]))
    assert finished["status"] == "completed"
    assert finished["config"]["seed"] == str(seed)
    assert finished["result"]["batch_seed"] == str(seed)


def test_old_single_decoder_results_remain_exportable(isolated_manager):
    created = asyncio.run(request("POST", "/api/experiments", spec(comparison_decoder_id=None, trials_per_probability=1)))
    experiment_id = created.json()["id"]
    asyncio.run(wait_for_terminal(experiment_id))
    legacy = isolated_manager.store.get(experiment_id)["result"]
    for key in ("decoder_settings", "comparison", "paired_outcomes", "disagreements"):
        legacy.pop(key)
    legacy["schema_version"] = 1
    isolated_manager.store.finish(experiment_id, "completed", legacy)
    exported = asyncio.run(request("GET", f"/api/experiments/{experiment_id}/export?format=json"))
    assert exported.status_code == 200
    assert exported.json()["result"]["comparison"] is None
    assert exported.json()["result"]["schema_version"] == 1
