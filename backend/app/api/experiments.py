from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from app.codes.registry import get_fixture
from app.core.injection import Pauli
from app.decoders import get_decoder
from app.experiments.manager import ExperimentSpec, experiment_manager
from app.experiments.runner import SimulationConfig


router = APIRouter(prefix="/experiments", tags=["experiments"])
ExperimentStatus = Literal[
    "queued",
    "running",
    "cancel_requested",
    "completed",
    "cancelled",
    "failed",
]


class ExperimentCreateRequest(BaseModel):
    code_id: str
    code_version: str
    decoder_id: str = "exact-css-min-weight-v1"
    probabilities: tuple[float, ...]
    trials_per_probability: int = Field(ge=1, le=100_000)
    seed: int = Field(ge=0, le=(1 << 63) - 1)
    confidence_level: float = Field(default=0.95, ge=0.8, le=0.999)
    saved_failure_limit: int = Field(default=10, ge=0, le=50)

    @field_validator("probabilities")
    @classmethod
    def validate_probabilities(cls, values: tuple[float, ...]) -> tuple[float, ...]:
        if not values:
            raise ValueError("Choose at least one error probability.")
        if len(values) > 25:
            raise ValueError("Use no more than 25 error probabilities in one experiment.")
        if any(not 0 <= value <= 0.5 for value in values):
            raise ValueError("Every error probability must be between 0 and 0.5.")
        if any(left >= right for left, right in zip(values, values[1:])):
            raise ValueError("Error probabilities must be unique and in increasing order.")
        return values


class ExperimentConfigResponse(BaseModel):
    code_id: str
    code_version: str
    decoder_id: str
    probabilities: tuple[float, ...]
    trials_per_probability: int
    seed: int
    confidence_level: float
    saved_failure_limit: int


class ExperimentProgressResponse(BaseModel):
    completed_trials: int
    total_trials: int
    fraction: float
    current_probability: float | None
    current_point_trials: int


class ProbabilityResultResponse(BaseModel):
    probability: float
    trials_planned: int
    trials_completed: int
    successes: int
    logical_failures: int
    exact_matches: int
    stabilizer_successes: int
    logical_error_rate: float
    confidence_level: float
    confidence_method: str
    confidence_interval: tuple[float, float]
    average_error_weight: float
    average_correction_weight: float
    average_residual_weight: float
    average_decode_time_ms: float
    runtime_seconds: float


class FailureSampleResponse(BaseModel):
    probability: float
    trial_number: int
    trial_seed: int
    error: tuple[Pauli, ...]
    correction: tuple[Pauli, ...]
    residual: tuple[Pauli, ...]
    x_classification: str
    z_classification: str


class SimulationResultResponse(BaseModel):
    schema_version: int
    decoder_id: str
    decoder_name: str
    code_id: str
    code_version: str
    batch_seed: int
    batch_generator_version: str
    error_generator_version: str
    error_model: str
    measurement_model: str
    success_criterion: str
    total_trials_planned: int
    total_trials_completed: int
    cancelled: bool
    runtime_seconds: float
    points: tuple[ProbabilityResultResponse, ...]
    saved_failures: tuple[FailureSampleResponse, ...]


class ExperimentResponse(BaseModel):
    id: str
    status: ExperimentStatus
    created_at: str
    started_at: str | None
    finished_at: str | None
    config: ExperimentConfigResponse
    progress: ExperimentProgressResponse
    result: SimulationResultResponse | None
    error_message: str | None


@router.post("", response_model=ExperimentResponse, status_code=status.HTTP_202_ACCEPTED)
def create_experiment(request: ExperimentCreateRequest) -> dict[str, object]:
    code = get_fixture(request.code_id)
    if code is None:
        raise HTTPException(status_code=404, detail="The requested qLDPC code was not found.")
    if code.version != request.code_version:
        raise HTTPException(
            status_code=409,
            detail="The saved code version does not match the current code. Return to Configure and try again.",
        )
    if get_decoder(request.decoder_id) is None:
        raise HTTPException(status_code=404, detail="The requested decoder was not found.")

    spec = ExperimentSpec(
        code_id=code.id,
        code_version=code.version,
        decoder_id=request.decoder_id,
        simulation=SimulationConfig(
            probabilities=request.probabilities,
            trials_per_probability=request.trials_per_probability,
            seed=request.seed,
            confidence_level=request.confidence_level,
            saved_failure_limit=request.saved_failure_limit,
        ),
    )
    return experiment_manager.create(spec)


@router.get("", response_model=tuple[ExperimentResponse, ...])
def list_experiments(limit: int = Query(default=50, ge=1, le=100)) -> tuple[dict[str, object], ...]:
    return tuple(experiment_manager.store.list(limit))


@router.get("/{experiment_id}", response_model=ExperimentResponse)
def read_experiment(experiment_id: str) -> dict[str, object]:
    record = experiment_manager.store.get(experiment_id)
    if record is None:
        raise HTTPException(status_code=404, detail="The requested experiment was not found.")
    return record


@router.post(
    "/{experiment_id}/cancel",
    response_model=ExperimentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def cancel_experiment(experiment_id: str) -> dict[str, object]:
    record = experiment_manager.cancel(experiment_id)
    if record is None:
        raise HTTPException(status_code=404, detail="The requested experiment was not found.")
    return record
