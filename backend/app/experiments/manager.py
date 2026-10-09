import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Event, Lock
from typing import Any
from uuid import uuid4

from app.codes.registry import get_fixture
from app.decoders import get_decoder
from app.experiments.runner import SimulationConfig, run_simulation
from app.experiments.storage import ExperimentStore, TERMINAL_STATUSES


@dataclass(frozen=True)
class ExperimentSpec:
    code_id: str
    code_version: str
    decoder_id: str
    simulation: SimulationConfig

    def as_dict(self) -> dict[str, Any]:
        return {
            "code_id": self.code_id,
            "code_version": self.code_version,
            "decoder_id": self.decoder_id,
            **asdict(self.simulation),
        }


def default_database_path() -> Path:
    configured = os.getenv("QLDPC_EXPERIMENT_DB")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "data" / "experiments.sqlite3"


class ExperimentManager:
    def __init__(self, store: ExperimentStore, max_workers: int = 1):
        self.store = store
        self.store.recover_interrupted()
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="qldpc-experiment")
        self._cancel_events: dict[str, Event] = {}
        self._lock = Lock()

    def create(self, spec: ExperimentSpec) -> dict[str, Any]:
        experiment_id = str(uuid4())
        total_trials = len(spec.simulation.probabilities) * spec.simulation.trials_per_probability
        self.store.create(experiment_id, spec.as_dict(), total_trials)
        event = Event()
        with self._lock:
            self._cancel_events[experiment_id] = event
        self.executor.submit(self._execute, experiment_id, spec, event)
        record = self.store.get(experiment_id)
        if record is None:
            raise RuntimeError("The experiment could not be stored.")
        return record

    def cancel(self, experiment_id: str) -> dict[str, Any] | None:
        record = self.store.get(experiment_id)
        if record is None:
            return None
        if record["status"] in TERMINAL_STATUSES:
            return record
        self.store.request_cancel(experiment_id)
        with self._lock:
            event = self._cancel_events.get(experiment_id)
        if event:
            event.set()
        return self.store.get(experiment_id)

    def _execute(self, experiment_id: str, spec: ExperimentSpec, cancel_event: Event) -> None:
        try:
            self.store.start(experiment_id)
            code = get_fixture(spec.code_id)
            decoder = get_decoder(spec.decoder_id)
            if code is None:
                raise ValueError("The selected qLDPC code is no longer available.")
            if code.version != spec.code_version:
                raise ValueError("The selected qLDPC code version has changed.")
            if decoder is None:
                raise ValueError("The selected decoder is no longer available.")

            total = len(spec.simulation.probabilities) * spec.simulation.trials_per_probability
            update_interval = max(1, total // 100)

            def update_progress(
                completed: int,
                _total: int,
                probability: float,
                point_completed: int,
            ) -> None:
                if completed % update_interval == 0 or completed == total:
                    self.store.update_progress(
                        experiment_id,
                        completed,
                        probability,
                        point_completed,
                    )

            result = run_simulation(
                code,
                decoder,
                spec.simulation,
                should_cancel=cancel_event.is_set,
                on_progress=update_progress,
            )
            self.store.finish(
                experiment_id,
                "cancelled" if result.cancelled else "completed",
                result.as_dict(),
            )
        except Exception as error:  # The failure is stored for API inspection.
            self.store.fail(experiment_id, str(error) or "The experiment failed.")
        finally:
            with self._lock:
                self._cancel_events.pop(experiment_id, None)


experiment_manager = ExperimentManager(ExperimentStore(default_database_path()))
