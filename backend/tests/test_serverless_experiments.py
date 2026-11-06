import asyncio
import json
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from vercel.blob.errors import BlobError

from app.api import experiments as api
from app.codes.registry import HGP_REP3
from app.decoders import get_decoder
from app.experiments.manager import ExperimentSpec
from app.experiments.runner import SimulationConfig, run_simulation
from app.experiments.serverless import BlobJournalStore, ServerlessExperimentManager
from test_experiments import request


class MemoryBlob:
    def __init__(self):
        self.objects = {}
        self.before_write = None

    def put_blob(self, pathname, body, **options):
        assert options["access"] == "private"
        assert options["allow_overwrite"] is False
        if self.before_write:
            callback, self.before_write = self.before_write, None
            callback()
        if pathname in self.objects:
            raise BlobError("This blob already exists", status_code=400)
        self.objects[pathname] = (body, datetime.now(UTC))

    def query_blobs(self, *, prefix):
        # Reverse order to ensure storage does not depend on API sorting.
        return [SimpleNamespace(pathname=key, url=key, uploaded_at=value[1])
                for key, value in reversed(list(self.objects.items())) if key.startswith(prefix)]

    def get_blob(self, url, *, access):
        assert access == "private"
        return SimpleNamespace(body=self.objects[url][0])


def spec(comparison="bp-osd-css-v1"):
    return ExperimentSpec(
        HGP_REP3.id, HGP_REP3.version, "exact-css-min-weight-v1",
        SimulationConfig((0.0, 0.15, 0.3), 13, (1 << 63) - 1, saved_failure_limit=4), comparison,
    )


def scientific_values(value):
    if isinstance(value, dict):
        return {key: scientific_values(item) for key, item in value.items()
                if key not in ("runtime_seconds", "average_decode_time_ms")}
    if isinstance(value, (list, tuple)):
        return [scientific_values(item) for item in value]
    return value


@pytest.mark.parametrize("comparison", [None, "bp-osd-css-v1"])
def test_resumed_batches_match_one_uninterrupted_simulation(comparison):
    memory = MemoryBlob()
    store = BlobJournalStore(memory, "test/")
    manager = ServerlessExperimentManager(store, batch_size=7)
    settings = spec(comparison)
    record = manager.create(settings)
    assert record["status"] == "queued"
    assert store.get(record["id"])["progress"]["completed_trials"] == 0
    while record["status"] not in ("completed", "failed"):
        # Each invocation has a fresh manager, as on different Vercel instances.
        manager = ServerlessExperimentManager(BlobJournalStore(memory, "test/"), batch_size=7)
        record = manager.advance(record["id"])
    assert record["status"] == "completed", record["error_message"]
    expected = run_simulation(
        HGP_REP3, get_decoder(settings.decoder_id), settings.simulation,
        comparison_decoder=get_decoder(comparison) if comparison else None,
    ).as_dict()
    assert scientific_values(record["result"]) == scientific_values(expected)
    assert manager.store.list()[0]["id"] == record["id"]
    before = len(memory.objects)
    assert manager.advance(record["id"]) == record
    assert len(memory.objects) == before


@pytest.mark.parametrize("advance_first", [False, True])
def test_cancelled_runs_preserve_complete_pairs_and_can_be_reopened(advance_first):
    manager = ServerlessExperimentManager(BlobJournalStore(MemoryBlob(), "test/"), batch_size=7)
    record = manager.create(spec())
    if advance_first:
        record = manager.advance(record["id"])
    cancelled = manager.cancel(record["id"])
    assert cancelled["status"] == "cancelled"
    assert cancelled["result"]["cancelled"]
    assert cancelled["result"]["comparison"]["cancelled"]
    count = 7 if advance_first else 0
    assert cancelled["result"]["total_trials_completed"] == count
    assert cancelled["result"]["comparison"]["total_trials_completed"] == count
    assert manager.store.get(record["id"]) == cancelled
    assert manager.advance(record["id"]) == cancelled


def test_cancellation_wins_over_a_concurrent_computing_request():
    memory = MemoryBlob()
    manager = ServerlessExperimentManager(BlobJournalStore(memory, "test/"), batch_size=7)
    record = manager.create(spec())
    record = manager.advance(record["id"])
    memory.before_write = lambda: manager.cancel(record["id"])
    raced = manager.advance(record["id"])
    assert raced["status"] == "cancelled"
    assert raced["progress"]["completed_trials"] == 7
    assert manager.store.get(record["id"]) == raced


def test_lost_checkpoint_write_keeps_previous_batch_recoverable():
    memory = MemoryBlob()
    manager = ServerlessExperimentManager(BlobJournalStore(memory, "test/"), batch_size=7)
    record = manager.create(spec())

    def unavailable():
        raise BlobError("unavailable", status_code=503)

    memory.before_write = unavailable
    with pytest.raises(BlobError):
        manager.advance(record["id"])
    assert manager.store.get(record["id"])["progress"]["completed_trials"] == 0
    assert manager.advance(record["id"])["progress"]["completed_trials"] == 7
    assert manager.store.get("../other") is None


def test_http_polling_is_read_only_and_explicit_advances_are_exportable(monkeypatch):
    manager = ServerlessExperimentManager(BlobJournalStore(MemoryBlob(), "test/"), batch_size=20)
    monkeypatch.setattr(api, "experiment_manager", manager)
    settings = spec()
    created = asyncio.run(request("POST", "/api/experiments", settings.as_dict()))
    assert created.status_code == 202
    initial = created.json()
    experiment_id = initial["id"]
    assert initial["execution_mode"] == "request_chunks"
    read = asyncio.run(request("GET", f"/api/experiments/{experiment_id}")).json()
    assert read["progress"]["completed_trials"] == 0
    assert read["config"]["seed"] == str((1 << 63) - 1)
    for _ in range(2):
        advanced = asyncio.run(request("POST", f"/api/experiments/{experiment_id}/advance"))
        assert advanced.status_code == 200
    assert advanced.json()["status"] == "completed"
    exported = asyncio.run(request("GET", f"/api/experiments/{experiment_id}/export"))
    assert exported.status_code == 200
    assert exported.json()["result"]["total_trials_completed"] == 39
    csv = asyncio.run(request("GET", f"/api/experiments/{experiment_id}/export?format=csv"))
    assert csv.status_code == 200
    assert "bp-osd-css-v1" in csv.text
