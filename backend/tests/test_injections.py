import asyncio

import httpx
import pytest

from app.core.injection import manual_pauli_pattern, seeded_code_capacity_pattern
from app.main import app


async def post(payload: dict[str, object]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/injections", json=payload)


def test_manual_pattern_preserves_pauli_components_and_one_based_qubits() -> None:
    pattern = manual_pauli_pattern(13, ((1, "X"), (5, "Y"), (13, "Z")))

    assert pattern.paulis == (
        "X", "I", "I", "I", "Y", "I", "I", "I", "I", "I", "I", "I", "Z"
    )
    assert pattern.error_x == (1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0)
    assert pattern.error_z == (0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1)
    assert (pattern.weight, pattern.x_count, pattern.y_count, pattern.z_count) == (3, 1, 1, 1)


def test_manual_pattern_rejects_ambiguous_or_invalid_assignments() -> None:
    with pytest.raises(ValueError, match="assigned more than once"):
        manual_pauli_pattern(13, ((2, "X"), (2, "Z")))
    with pytest.raises(ValueError, match="between 1 and 13"):
        manual_pauli_pattern(13, ((14, "X"),))


def test_seeded_pattern_has_a_stable_golden_result() -> None:
    first = seeded_code_capacity_pattern(13, 0.5, 42)
    second = seeded_code_capacity_pattern(13, 0.5, 42)

    assert first == second
    assert first.paulis == ("I", "X", "Y", "I", "Z", "Z", "Y", "I", "I", "I", "Z", "X", "I")
    assert first.weight == 7
    assert (first.x_count, first.y_count, first.z_count) == (2, 2, 3)


def test_manual_injection_api_returns_a_validated_error_vector() -> None:
    response = asyncio.run(
        post(
            {
                "code_id": "hgp_rep3_v1",
                "mode": "manual_pauli",
                "errors": [
                    {"qubit": 1, "pauli": "X"},
                    {"qubit": 5, "pauli": "Y"},
                    {"qubit": 13, "pauli": "Z"},
                ],
            }
        )
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code_id"] == "hgp_rep3_v1"
    assert payload["code_version"] == "1.0.0"
    assert payload["weight"] == 3
    assert payload["counts"] == {"x": 1, "y": 1, "z": 1}
    assert payload["qubits"][4] == "Y"
    assert payload["error_x"][4] == 1
    assert payload["error_z"][4] == 1
    assert payload["reproducibility"] == {
        "probability": None,
        "seed": None,
        "generator_version": None,
    }


def test_seeded_injection_api_is_reproducible_and_versioned() -> None:
    request = {
        "code_id": "hgp_rep3_v1",
        "mode": "seeded_code_capacity",
        "probability": 0.5,
        "seed": 42,
    }
    first = asyncio.run(post(request))
    second = asyncio.run(post(request))

    assert first.status_code == 200
    assert first.json() == second.json()
    assert first.json()["qubits"] == ["I", "X", "Y", "I", "Z", "Z", "Y", "I", "I", "I", "Z", "X", "I"]
    assert first.json()["reproducibility"] == {
        "probability": 0.5,
        "seed": 42,
        "generator_version": "splitmix64-v1",
    }


def test_injection_api_rejects_invalid_or_mixed_inputs() -> None:
    invalid_probability = asyncio.run(
        post(
            {
                "code_id": "hgp_rep3_v1",
                "mode": "seeded_code_capacity",
                "probability": 0.75,
                "seed": 2,
            }
        )
    )
    mixed_mode = asyncio.run(
        post(
            {
                "code_id": "hgp_rep3_v1",
                "mode": "manual_pauli",
                "errors": [{"qubit": 1, "pauli": "X"}],
                "seed": 2,
            }
        )
    )

    assert invalid_probability.status_code == 422
    assert invalid_probability.json()["detail"] == "Error probability must be between 0 and 0.5."
    assert mixed_mode.status_code == 422
    assert mixed_mode.json()["detail"] == "Manual errors do not use a probability or random seed."
