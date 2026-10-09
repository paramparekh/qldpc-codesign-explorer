import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


ACTIVE_STATUSES = ("queued", "running", "cancel_requested")
TERMINAL_STATUSES = ("completed", "cancelled", "failed")


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class ExperimentStore:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS experiments (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    config_json TEXT NOT NULL,
                    completed_trials INTEGER NOT NULL,
                    total_trials INTEGER NOT NULL,
                    current_probability REAL,
                    current_point_trials INTEGER NOT NULL,
                    result_json TEXT,
                    error_message TEXT
                )
                """
            )

    def recover_interrupted(self) -> None:
        placeholders = ",".join("?" for _ in ACTIVE_STATUSES)
        with self._connect() as connection:
            connection.execute(
                f"""
                UPDATE experiments
                SET status = 'failed', finished_at = ?,
                    error_message = 'The server stopped before this experiment finished.'
                WHERE status IN ({placeholders})
                """,
                (utc_now(), *ACTIVE_STATUSES),
            )

    def create(self, experiment_id: str, config: dict[str, Any], total_trials: int) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO experiments (
                    id, status, created_at, config_json, completed_trials,
                    total_trials, current_point_trials
                ) VALUES (?, 'queued', ?, ?, 0, ?, 0)
                """,
                (experiment_id, utc_now(), json.dumps(config, sort_keys=True), total_trials),
            )

    def start(self, experiment_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE experiments SET status = 'running', started_at = ? WHERE id = ?",
                (utc_now(), experiment_id),
            )

    def update_progress(
        self,
        experiment_id: str,
        completed_trials: int,
        current_probability: float,
        current_point_trials: int,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE experiments
                SET completed_trials = ?, current_probability = ?, current_point_trials = ?
                WHERE id = ?
                """,
                (completed_trials, current_probability, current_point_trials, experiment_id),
            )

    def request_cancel(self, experiment_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE experiments SET status = 'cancel_requested'
                WHERE id = ? AND status IN ('queued', 'running')
                """,
                (experiment_id,),
            )
            return cursor.rowcount > 0

    def finish(self, experiment_id: str, status: str, result: dict[str, Any]) -> None:
        if status not in ("completed", "cancelled"):
            raise ValueError("A finished experiment must be completed or cancelled.")
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE experiments
                SET status = ?, finished_at = ?, completed_trials = ?,
                    result_json = ?, current_probability = NULL, current_point_trials = 0
                WHERE id = ?
                """,
                (
                    status,
                    utc_now(),
                    result["total_trials_completed"],
                    json.dumps(result, sort_keys=True),
                    experiment_id,
                ),
            )

    def fail(self, experiment_id: str, message: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE experiments
                SET status = 'failed', finished_at = ?, error_message = ?
                WHERE id = ?
                """,
                (utc_now(), message, experiment_id),
            )

    def get(self, experiment_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM experiments WHERE id = ?",
                (experiment_id,),
            ).fetchone()
        return self._row_to_record(row) if row else None

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM experiments ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> dict[str, Any]:
        completed = row["completed_trials"]
        total = row["total_trials"]
        result = json.loads(row["result_json"]) if row["result_json"] else None
        if result is not None:
            # Results written by earlier development versions remain readable as
            # explanatory metadata is added to the public response contract.
            result.setdefault("error_model", "independent depolarizing data-qubit errors")
            result.setdefault("measurement_model", "perfect syndrome measurement")
            result.setdefault(
                "success_criterion",
                "the residual error is empty or a stabilizer",
            )
            for point in result.get("points", []):
                point.setdefault("confidence_method", "Wilson score")
        return {
            "id": row["id"],
            "status": row["status"],
            "created_at": row["created_at"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "config": json.loads(row["config_json"]),
            "progress": {
                "completed_trials": completed,
                "total_trials": total,
                "fraction": completed / total if total else 0.0,
                "current_probability": row["current_probability"],
                "current_point_trials": row["current_point_trials"],
            },
            "result": result,
            "error_message": row["error_message"],
        }
