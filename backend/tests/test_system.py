import asyncio

import httpx

from app.main import app


async def get(path: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def test_root_describes_service_entry_points() -> None:
    response = asyncio.run(get("/"))

    assert response.status_code == 200
    assert response.json()["status_endpoint"] == "/api/system/status"


def test_system_status_is_explicit_about_ready_and_planned_capabilities() -> None:
    response = asyncio.run(get("/api/system/status"))

    assert response.status_code == 200
    payload = response.json()
    statuses = {item["id"]: item["status"] for item in payload["capabilities"]}

    assert payload["status"] == "ready"
    assert statuses["workspace-shell"] == "ready"
    assert statuses["workflow-contract"] == "ready"
    assert statuses["code-registry"] == "ready"
    assert statuses["syndrome-service"] == "planned"
    assert statuses["decoder-service"] == "planned"
    assert len(payload["model_boundaries"]) == 3


def test_codes_api_lists_only_the_verified_qldpc_fixture() -> None:
    response = asyncio.run(get("/api/codes"))

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == "hgp_rep3_v1"
    assert payload[0]["family"] == "Quantum LDPC"
    assert payload[0]["parameters"] == {
        "n": 13,
        "k": 1,
        "d": 3,
        "d_x": 3,
        "d_z": 3,
        "rate": 1 / 13,
        "distance_status": "verified",
    }


def test_code_detail_exposes_validation_and_construction_evidence() -> None:
    response = asyncio.run(get("/api/codes/hgp_rep3_v1"))

    assert response.status_code == 200
    payload = response.json()
    assert payload["matrix_metadata"]["h_x_shape"] == [6, 13]
    assert payload["matrix_metadata"]["h_z_shape"] == [6, 13]
    assert payload["matrix_metadata"]["rank_x"] == 6
    assert payload["matrix_metadata"]["rank_z"] == 6
    assert payload["matrix_metadata"]["max_check_weight"] == 4
    assert payload["matrix_metadata"]["max_column_weight"] == 2
    assert payload["matrix_metadata"]["max_total_qubit_degree"] == 4
    assert all(item["status"] == "passed" for item in payload["validation"])
    assert payload["supported_error_models"] == ["manual_pauli", "seeded_code_capacity"]


def test_unknown_code_returns_a_specific_404() -> None:
    response = asyncio.run(get("/api/codes/not-a-fixture"))

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown qLDPC fixture."
