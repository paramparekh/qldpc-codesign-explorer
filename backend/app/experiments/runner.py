from collections.abc import Callable
from dataclasses import asdict, dataclass
from hashlib import blake2b
from struct import pack
from time import perf_counter

from app.codes.registry import CodeFixture
from app.core.injection import (
    GENERATOR_VERSION,
    Pauli,
    pattern_from_components,
    seeded_code_capacity_pattern,
)
from app.decoders.base import Decoder
from app.experiments.statistics import wilson_interval


BATCH_GENERATOR_VERSION = "blake2b-trial-seeds-v1"


@dataclass(frozen=True)
class SimulationConfig:
    probabilities: tuple[float, ...]
    trials_per_probability: int
    seed: int
    confidence_level: float = 0.95
    saved_failure_limit: int = 10


@dataclass(frozen=True)
class FailureSample:
    probability: float
    trial_number: int
    trial_seed: int
    error: tuple[Pauli, ...]
    correction: tuple[Pauli, ...]
    residual: tuple[Pauli, ...]
    x_classification: str
    z_classification: str


@dataclass(frozen=True)
class ProbabilityResult:
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


@dataclass(frozen=True)
class SimulationResult:
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
    points: tuple[ProbabilityResult, ...]
    saved_failures: tuple[FailureSample, ...]

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


ProgressCallback = Callable[[int, int, float, int], None]
CancelCheck = Callable[[], bool]


def derive_trial_seed(batch_seed: int, probability_index: int, trial_index: int) -> int:
    """Derive a stable 63-bit seed for one trial."""

    digest = blake2b(
        pack(">QQQ", batch_seed, probability_index, trial_index),
        digest_size=8,
        person=b"qldpc-batch-v1",
    ).digest()
    return int.from_bytes(digest, "big") & ((1 << 63) - 1)


def _validate(config: SimulationConfig) -> None:
    if not config.probabilities:
        raise ValueError("Choose at least one error probability.")
    if any(not 0 <= probability <= 0.5 for probability in config.probabilities):
        raise ValueError("Every error probability must be between 0 and 0.5.")
    if any(left >= right for left, right in zip(config.probabilities, config.probabilities[1:])):
        raise ValueError("Error probabilities must be unique and in increasing order.")
    if config.trials_per_probability <= 0:
        raise ValueError("Trials per probability must be positive.")
    if not 0 <= config.seed <= (1 << 63) - 1:
        raise ValueError("The batch seed must be a non-negative 63-bit integer.")
    if not 0.8 <= config.confidence_level <= 0.999:
        raise ValueError("The confidence level must be between 0.8 and 0.999.")
    if config.saved_failure_limit < 0:
        raise ValueError("The saved failure limit cannot be negative.")


def run_simulation(
    code: CodeFixture,
    decoder: Decoder,
    config: SimulationConfig,
    *,
    should_cancel: CancelCheck | None = None,
    on_progress: ProgressCallback | None = None,
) -> SimulationResult:
    _validate(config)
    cancel_check = should_cancel or (lambda: False)
    total_planned = len(config.probabilities) * config.trials_per_probability
    total_completed = 0
    points: list[ProbabilityResult] = []
    saved_failures: list[FailureSample] = []
    cancelled = False
    simulation_started = perf_counter()

    for probability_index, probability in enumerate(config.probabilities):
        point_started = perf_counter()
        completed = successes = failures = exact_matches = stabilizer_successes = 0
        error_weight_sum = correction_weight_sum = residual_weight_sum = 0
        decode_time_sum = 0.0

        for trial_index in range(config.trials_per_probability):
            if cancel_check():
                cancelled = True
                break

            trial_seed = derive_trial_seed(config.seed, probability_index, trial_index)
            error = seeded_code_capacity_pattern(code.n, probability, trial_seed)
            decode_started = perf_counter()
            decoded = decoder.decode(code, error)
            decode_time_sum += perf_counter() - decode_started
            correction = pattern_from_components(
                decoded.x_component.correction,
                decoded.z_component.correction,
            )
            residual = pattern_from_components(decoded.residual_x, decoded.residual_z)

            completed += 1
            total_completed += 1
            error_weight_sum += error.weight
            correction_weight_sum += correction.weight
            residual_weight_sum += residual.weight

            if decoded.success:
                successes += 1
                if residual.weight == 0:
                    exact_matches += 1
                else:
                    stabilizer_successes += 1
            else:
                failures += 1
                if len(saved_failures) < config.saved_failure_limit:
                    saved_failures.append(
                        FailureSample(
                            probability=probability,
                            trial_number=trial_index + 1,
                            trial_seed=trial_seed,
                            error=error.paulis,
                            correction=correction.paulis,
                            residual=residual.paulis,
                            x_classification=decoded.residual_x_classification,
                            z_classification=decoded.residual_z_classification,
                        )
                    )

            if on_progress:
                on_progress(total_completed, total_planned, probability, completed)

        if completed:
            lower, upper = wilson_interval(failures, completed, config.confidence_level)
            points.append(
                ProbabilityResult(
                    probability=probability,
                    trials_planned=config.trials_per_probability,
                    trials_completed=completed,
                    successes=successes,
                    logical_failures=failures,
                    exact_matches=exact_matches,
                    stabilizer_successes=stabilizer_successes,
                    logical_error_rate=failures / completed,
                    confidence_level=config.confidence_level,
                    confidence_method="Wilson score",
                    confidence_interval=(lower, upper),
                    average_error_weight=error_weight_sum / completed,
                    average_correction_weight=correction_weight_sum / completed,
                    average_residual_weight=residual_weight_sum / completed,
                    average_decode_time_ms=decode_time_sum * 1000 / completed,
                    runtime_seconds=perf_counter() - point_started,
                )
            )
        if cancelled:
            break

    return SimulationResult(
        schema_version=1,
        decoder_id=decoder.metadata.id,
        decoder_name=decoder.metadata.name,
        code_id=code.id,
        code_version=code.version,
        batch_seed=config.seed,
        batch_generator_version=BATCH_GENERATOR_VERSION,
        error_generator_version=GENERATOR_VERSION,
        error_model="independent depolarizing data-qubit errors",
        measurement_model="perfect syndrome measurement",
        success_criterion="residual is empty or a stabilizer",
        total_trials_planned=total_planned,
        total_trials_completed=total_completed,
        cancelled=cancelled,
        runtime_seconds=perf_counter() - simulation_started,
        points=tuple(points),
        saved_failures=tuple(saved_failures),
    )
