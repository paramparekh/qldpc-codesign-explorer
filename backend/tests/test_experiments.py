import asyncio

import httpx
import pytest

from app.codes.registry import HGP_REP3
from app.decoders import get_decoder
from app.experiments.runner import SimulationConfig, derive_trial_seed, run_simulation
from app.experiments.statistics import wilson_interval
from app.main import app


async def request(method: str, path: str, payload: dict[str, object] | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, json=payload)


async def wait_for_terminal(experiment_id: str) -> dict[str, object]:
    for _ in range(200):
        response = await request("GET", f"/api/experiments/{experiment_id}")
        payload = response.json()
        if payload["status"] in ("completed", "cancelled", "failed"):
            return payload
        await asyncio.sleep(0.01)
    raise AssertionError("The experiment did not reach a terminal state.")


def test_wilson_interval_handles_zero_and_observed_failures() -> None:
    zero_lower, zero_upper = wilson_interval(0, 100)
    observed_lower, observed_upper = wilson_interval(15, 100)

    assert zero_lower == 0
    assert zero_upper == pytest.approx(0.0369934982)
    assert observed_lower == pytest.approx(0.0930598528)
    assert observed_upper == pytest.approx(0.2328355959)


def test_trial_seed_derivation_is_stable() -> None:
    assert [derive_trial_seed(42, 0, index) for index in range(3)] == [
        7040799266656314811,
        562512473874468686,
        8198769723789147932,
    ]
    assert derive_trial_seed(42, 1, 0) != derive_trial_seed(42, 0, 0)


def test_batch_simulation_is_reproducible_and_reports_logical_failures() -> None:
    decoder = get_decoder("exact-css-min-weight-v1")
    assert decoder is not None
    config = SimulationConfig((0.0, 0.1, 0.2), 100, 42, saved_failure_limit=3)
    first = run_simulation(HGP_REP3, decoder, config)
    second = run_simulation(HGP_REP3, decoder, config)

    first_data = first.as_dict()
    second_data = second.as_dict()
    first_data.pop("runtime_seconds")
    second_data.pop("runtime_seconds")
    for point in first_data["points"]:
        point.pop("runtime_seconds")
        point.pop("average_decode_time_ms")
    for point in second_data["points"]:
        point.pop("runtime_seconds")
        point.pop("average_decode_time_ms")
    assert first_data == second_data

    assert first.points[0].logical_failures == 0
    assert first.points[0].confidence_interval[1] > 0
    assert first.points[1].logical_failures == 15
    assert first.points[1].confidence_method == "Wilson score"
    assert first.points[2].logical_failures == 47
    assert len(first.saved_failures) == 3
    assert all(
        sample.x_classification == "logical" or sample.z_classification == "logical"
        for sample in first.saved_failures
    )


def test_batch_simulation_returns_a_valid_partial_result_when_cancelled() -> None:
    decoder = get_decoder("exact-css-min-weight-v1")
    assert decoder is not None
    cancel = False

    def on_progress(completed: int, _total: int, _probability: float, _point: int) -> None:
        nonlocal cancel
        cancel = completed == 3

    result = run_simulation(
        HGP_REP3,
        decoder,
        SimulationConfig((0.1, 0.2), 100, 9),
        should_cancel=lambda: cancel,
        on_progress=on_progress,
    )

    assert result.cancelled
    assert result.total_trials_completed == 3
    assert len(result.points) == 1
    assert result.points[0].trials_completed == 3


def test_experiment_api_runs_stores_and_lists_a_reproducible_batch() -> None:
    created = asyncio.run(
        request(
            "POST",
            "/api/experiments",
            {
                "code_id": HGP_REP3.id,
                "code_version": HGP_REP3.version,
                "decoder_id": "exact-css-min-weight-v1",
                "probabilities": [0.0, 0.1],
                "trials_per_probability": 25,
                "seed": 42,
                "confidence_level": 0.95,
                "saved_failure_limit": 2,
            },
        )
    )

    assert created.status_code == 202
    experiment_id = created.json()["id"]
    finished = asyncio.run(wait_for_terminal(experiment_id))
    assert finished["status"] == "completed"
    assert finished["progress"]["fraction"] == 1
    assert finished["result"]["total_trials_completed"] == 50
    assert finished["result"]["points"][0]["logical_error_rate"] == 0
    assert finished["result"]["batch_generator_version"] == "blake2b-trial-seeds-v1"

    listed = asyncio.run(request("GET", "/api/experiments?limit=100"))
    assert listed.status_code == 200
    assert experiment_id in {item["id"] for item in listed.json()}


def test_experiment_api_cancels_work_and_validates_inputs() -> None:
    invalid = asyncio.run(
        request(
            "POST",
            "/api/experiments",
            {
                "code_id": HGP_REP3.id,
                "code_version": HGP_REP3.version,
                "probabilities": [0.2, 0.1],
                "trials_per_probability": 10,
                "seed": 1,
            },
        )
    )
    assert invalid.status_code == 422

    created = asyncio.run(
        request(
            "POST",
            "/api/experiments",
            {
                "code_id": HGP_REP3.id,
                "code_version": HGP_REP3.version,
                "probabilities": [0.3],
                "trials_per_probability": 100_000,
                "seed": 7,
            },
        )
    )
    experiment_id = created.json()["id"]
    cancelled = asyncio.run(request("POST", f"/api/experiments/{experiment_id}/cancel"))
    assert cancelled.status_code == 202
    finished = asyncio.run(wait_for_terminal(experiment_id))
    assert finished["status"] == "cancelled"
    assert finished["result"]["cancelled"]
    assert finished["progress"]["completed_trials"] < 100_000


def test_decoder_registry_is_visible_to_future_experiment_ui() -> None:
    response = asyncio.run(request("GET", "/api/decoders"))

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["id"] == "exact-css-min-weight-v1"
    assert "not intended for large qLDPC codes" in payload[0]["scaling_note"]
