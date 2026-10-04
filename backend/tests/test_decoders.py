import asyncio

import httpx

from app.codes.registry import HGP_REP3
from app.core.decoding import decode_css_error, minimum_weight_correction
from app.core.gf2 import syndrome
from app.core.injection import pattern_from_paulis
from app.main import app


async def post(payload: dict[str, object]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/decoders", json=payload)


def test_every_single_qubit_pauli_error_is_corrected_exactly() -> None:
    for qubit in range(HGP_REP3.n):
        for pauli in ("X", "Y", "Z"):
            values = ["I"] * HGP_REP3.n
            values[qubit] = pauli
            pattern = pattern_from_paulis(values)
            result = decode_css_error(
                HGP_REP3.h_x,
                HGP_REP3.h_z,
                pattern.error_x,
                pattern.error_z,
            )

            assert result.success
            assert not any(result.residual_x)
            assert not any(result.residual_z)
            assert not any(result.residual_x_check_syndrome)
            assert not any(result.residual_z_check_syndrome)


def test_decoder_accepts_a_nonzero_stabilizer_residual_as_success() -> None:
    error_x = tuple(int(index in (0, 3)) for index in range(HGP_REP3.n))
    result = decode_css_error(HGP_REP3.h_x, HGP_REP3.h_z, error_x, (0,) * HGP_REP3.n)

    assert tuple(index + 1 for index, value in enumerate(result.x_component.correction) if value) == (10,)
    assert tuple(index + 1 for index, value in enumerate(result.residual_x) if value) == (1, 4, 10)
    assert result.residual_x_classification == "stabilizer"
    assert result.success


def test_decoder_identifies_a_silent_logical_failure() -> None:
    error_x = tuple(int(index in (0, 1)) for index in range(HGP_REP3.n))
    result = decode_css_error(HGP_REP3.h_x, HGP_REP3.h_z, error_x, (0,) * HGP_REP3.n)

    assert tuple(index + 1 for index, value in enumerate(result.x_component.correction) if value) == (3,)
    assert tuple(index + 1 for index, value in enumerate(result.residual_x) if value) == (1, 2, 3)
    assert not any(syndrome(HGP_REP3.h_z, result.residual_x))
    assert result.residual_x_classification == "logical"
    assert not result.success


def test_minimum_weight_ties_are_counted_and_resolved_deterministically() -> None:
    target = (0, 0, 0, 1, 1, 0)
    first = minimum_weight_correction(HGP_REP3.h_z, target)
    second = minimum_weight_correction(HGP_REP3.h_z, target)

    assert first == second
    assert first.weight == 2
    assert first.minimum_candidate_count == 3
    assert tuple(index + 1 for index, value in enumerate(first.correction) if value) == (5, 12)


def test_decoder_api_explains_logical_failure_and_cleared_syndrome() -> None:
    qubits = ["I"] * HGP_REP3.n
    qubits[0] = "X"
    qubits[1] = "X"
    response = asyncio.run(
        post(
            {
                "code_id": HGP_REP3.id,
                "code_version": HGP_REP3.version,
                "qubits": qubits,
            }
        )
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "logical_failure"
    assert not payload["success"]
    assert payload["correction"]["qubits"][2] == "X"
    assert payload["residual"]["weight"] == 3
    assert payload["residual"]["x_classification"] == "logical"
    assert payload["residual"]["x_check_syndrome"] == [0, 0, 0, 0, 0, 0]
    assert payload["residual"]["z_check_syndrome"] == [0, 0, 0, 0, 0, 0]


def test_decoder_api_rejects_stale_or_incomplete_inputs() -> None:
    stale = asyncio.run(
        post(
            {
                "code_id": HGP_REP3.id,
                "code_version": "old-version",
                "qubits": ["I"] * HGP_REP3.n,
            }
        )
    )
    incomplete = asyncio.run(
        post(
            {
                "code_id": HGP_REP3.id,
                "code_version": HGP_REP3.version,
                "qubits": ["I"] * 12,
            }
        )
    )

    assert stale.status_code == 409
    assert incomplete.status_code == 422
    assert incomplete.json()["detail"] == "The error must contain exactly 13 qubits."
