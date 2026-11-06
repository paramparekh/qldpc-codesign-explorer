"""Keep test experiments separate from the user's saved research runs."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest


_database_directory = TemporaryDirectory(prefix="qldpc-tests-")
os.environ["QLDPC_EXPERIMENT_DB"] = str(Path(_database_directory.name) / "experiments.sqlite3")


@pytest.fixture(scope="session", autouse=True)
def close_experiment_workers():
    yield
    from app.experiments.manager import experiment_manager

    experiment_manager.executor.shutdown(wait=True)
    _database_directory.cleanup()
