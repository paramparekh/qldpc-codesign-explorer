"""Request-bounded experiments with immutable checkpoints in private Vercel Blob.

A revision is created once, never overwritten. Concurrent requests compete for
the same next revision; only the winning write becomes visible. Immutable URLs
also avoid serving stale overwritten checkpoints from a CDN cache.
"""

import json
import os
from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from vercel.blob import sync as blob
from vercel.blob.errors import BlobError

from app.codes.registry import get_fixture
from app.decoders import get_decoder
from app.experiments.chunks import merge_results
from app.experiments.runner import SimulationConfig, run_simulation
from app.experiments.storage import TERMINAL_STATUSES, utc_now


class BlobJournalStore:
    def __init__(self, client: Any = None, prefix: str | None = None):
        self.client = client or blob
        self.prefix = prefix or f"qldpc/v1/{os.getenv('VERCEL_ENV', 'development')}/"

    def _put(self, pathname: str, record: dict[str, Any]) -> bool:
        try:
            self.client.put_blob(
                pathname, json.dumps(record, separators=(",", ":")).encode(),
                access="private", content_type="application/json",
                add_random_suffix=False, allow_overwrite=False,
            )
            return True
        except BlobError as error:
            if (error.code in ("blob_already_exists", "already_exists") or
                    (error.status_code in (400, 409) and "already exists" in str(error).lower())):
                return False
            raise

    def append(self, experiment_id: str, revision: int, record: dict[str, Any]) -> bool:
        return self._put(f"{self.prefix}runs/{experiment_id}/{revision:010d}.json", record)

    def load(self, experiment_id: str) -> tuple[dict[str, Any], int] | None:
        try:
            if str(UUID(experiment_id)) != experiment_id:
                return None
        except ValueError:
            return None
        entries = list(self.client.query_blobs(prefix=f"{self.prefix}runs/{experiment_id}/"))
        if not entries:
            return None
        latest = max(entries, key=lambda entry: entry.pathname)
        record = json.loads(self.client.get_blob(latest.url, access="private").body)
        return record, int(latest.pathname.rsplit("/", 1)[1].removesuffix(".json"))

    def get(self, experiment_id: str) -> dict[str, Any] | None:
        loaded = self.load(experiment_id)
        return loaded[0] if loaded else None

    def create(self, record: dict[str, Any]) -> None:
        if not self.append(record["id"], 0, record):
            raise RuntimeError("The experiment identifier already exists.")
        self._put(f"{self.prefix}catalog/{record['id']}.json", {"id": record["id"]})

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        entries = sorted(
            self.client.query_blobs(prefix=f"{self.prefix}catalog/"),
            key=lambda entry: entry.uploaded_at, reverse=True,
        )
        records = [self.get(entry.pathname.rsplit("/", 1)[1].removesuffix(".json"))
                   for entry in entries[:limit]]
        return [record for record in records if record is not None]


class ServerlessExperimentManager:
    def __init__(self, store: BlobJournalStore | None = None, batch_size: int = 1000):
        self.store = store or BlobJournalStore()
        self.batch_size = batch_size

    def create(self, spec: Any) -> dict[str, Any]:
        total = len(spec.simulation.probabilities) * spec.simulation.trials_per_probability
        record = {
            "id": str(uuid4()), "status": "queued", "execution_mode": "request_chunks",
            "created_at": utc_now(), "started_at": None, "finished_at": None,
            "config": json.loads(json.dumps(spec.as_dict())), "result": None, "error_message": None,
            "progress": {"completed_trials": 0, "total_trials": total, "fraction": 0.0,
                         "current_probability": None, "current_point_trials": 0},
        }
        self.store.create(record)
        return record

    def _batch(self, record: dict[str, Any], max_trials: int) -> dict[str, Any]:
        settings = record["config"]
        code = get_fixture(settings["code_id"])
        decoder = get_decoder(settings["decoder_id"])
        comparison = get_decoder(settings["comparison_decoder_id"]) if settings["comparison_decoder_id"] else None
        if code is None or code.version != settings["code_version"] or decoder is None:
            raise ValueError("The saved code or decoder version is no longer available.")
        if settings["comparison_decoder_id"] and comparison is None:
            raise ValueError("The saved comparison decoder is no longer available.")
        config = SimulationConfig(
            tuple(settings["probabilities"]), settings["trials_per_probability"], int(settings["seed"]),
            settings["confidence_level"], settings["saved_failure_limit"],
        )
        result = run_simulation(
            code, decoder, config, comparison_decoder=comparison,
            start_trial=record["progress"]["completed_trials"],
            max_trials=max_trials, max_seconds=2.5,
        ).as_dict()
        return json.loads(json.dumps(result))

    def advance(self, experiment_id: str) -> dict[str, Any] | None:
        loaded = self.store.load(experiment_id)
        if loaded is None:
            return None
        record, revision = loaded
        if record["status"] in TERMINAL_STATUSES:
            return record
        updated = deepcopy(record)
        updated["started_at"] = record["started_at"] or utc_now()
        try:
            result = merge_results(record["result"], self._batch(record, self.batch_size),
                                   record["config"]["saved_failure_limit"])
            completed = result["total_trials_completed"]
            total = record["progress"]["total_trials"]
            updated["result"] = result
            updated["status"] = "completed" if completed == total else "running"
            trials = record["config"]["trials_per_probability"]
            index = min(completed // trials, len(record["config"]["probabilities"]) - 1)
            updated["progress"] = {
                "completed_trials": completed, "total_trials": total, "fraction": completed / total,
                "current_probability": None if completed == total else record["config"]["probabilities"][index],
                "current_point_trials": 0 if completed == total else completed % trials,
            }
            if completed == total:
                updated["finished_at"] = utc_now()
        except Exception as error:
            updated.update(status="failed", finished_at=utc_now(), error_message=str(error))
        if self.store.append(experiment_id, revision + 1, updated):
            return updated
        # A cancellation or another advance won. Never overwrite its progress.
        return self.store.get(experiment_id)

    def cancel(self, experiment_id: str) -> dict[str, Any] | None:
        for _ in range(5):
            loaded = self.store.load(experiment_id)
            if loaded is None:
                return None
            record, revision = loaded
            if record["status"] in TERMINAL_STATUSES:
                return record
            updated = deepcopy(record)
            result = updated["result"] or self._batch(record, 0)
            result["cancelled"] = True
            if result["comparison"] is not None:
                result["comparison"]["cancelled"] = True
            updated.update(status="cancelled", result=result, finished_at=utc_now())
            if self.store.append(experiment_id, revision + 1, updated):
                return updated
        raise HTTPException(status_code=409, detail="The run changed while stopping. Please retry.")
