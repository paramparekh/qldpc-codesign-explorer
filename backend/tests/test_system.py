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
    assert statuses["code-registry"] == "planned"
    assert statuses["syndrome-service"] == "planned"
    assert statuses["decoder-service"] == "planned"
    assert len(payload["model_boundaries"]) == 3
