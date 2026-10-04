import asyncio

import httpx

from app.codes.registry import HGP_REP3
from app.core.observation import observe_css_error
from app.main import app


async def post(payload: dict[str, object]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/observations", json=payload)


def unit_vector(position: int) -> tuple[int, ...]:
    return tuple(int(index == position - 1) for index in range(HGP_REP3.n))


def zero_vector() -> tuple[int, ...]:
    return (0,) * HGP_REP3.n


def test_x_error_is_detected_only_by_z_type_checks() -> None:
    result = observe_css_error(HGP_REP3.h_x, HGP_REP3.h_z, unit_vector(5), zero_vector())

    assert result.x_check_syndrome == (0, 0, 0, 0, 0, 0)
    assert result.z_check_syndrome == (0, 0, 1, 1, 0, 0)
    assert result.z_checks[2].support == (4, 5, 10, 12)
    assert result.z_checks[2].error_qubits == (5,)


def test_z_error_is_detected_only_by_x_type_checks() -> None:
    result = observe_css_error(HGP_REP3.h_x, HGP_REP3.h_z, zero_vector(), unit_vector(5))

    assert result.x_check_syndrome == (0, 1, 0, 0, 1, 0)
    assert result.z_check_syndrome == (0, 0, 0, 0, 0, 0)


def test_y_error_contributes_to_both_check_groups() -> None:
    result = observe_css_error(HGP_REP3.h_x, HGP_REP3.h_z, unit_vector(5), unit_vector(5))

    assert result.x_check_syndrome == (0, 1, 0, 0, 1, 0)
    assert result.z_check_syndrome == (0, 0, 1, 1, 0, 0)


def test_even_overlap_has_zero_parity() -> None:
    two_z_errors = tuple(int(index in (0, 3)) for index in range(HGP_REP3.n))
    result = observe_css_error(HGP_REP3.h_x, HGP_REP3.h_z, zero_vector(), two_z_errors)

    assert result.x_checks[0].support == (1, 4, 10)
    assert result.x_checks[0].error_qubits == (1, 4)
    assert result.x_checks[0].result == 0


def test_observation_api_returns_explainable_check_results() -> None:
    qubits = ["I"] * HGP_REP3.n
    qubits[4] = "Y"
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
    assert payload["error_weight"] == 1
    assert payload["total_triggered"] == 4
    assert payload["x_checks"]["syndrome"] == [0, 1, 0, 0, 1, 0]
    assert payload["z_checks"]["syndrome"] == [0, 0, 1, 1, 0, 0]
    assert payload["x_checks"]["checks"][1]["id"] == "X2"
    assert payload["x_checks"]["checks"][1]["error_qubits"] == [5]


def test_observation_api_rejects_stale_or_incomplete_inputs() -> None:
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
