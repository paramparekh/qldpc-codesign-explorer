from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from hashlib import blake2b
from struct import pack
from time import perf_counter

from app.codes.registry import CodeFixture
from app.core.decoding import CSSDecodeResult
from app.core.injection import (
    GENERATOR_VERSION,
    Pauli,
    InjectionPattern,
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
    decoder_settings: dict[str, str | int | float] = field(default_factory=dict)
    comparison: SimulationResult | None = None
    paired_outcomes: tuple[PairedOutcome, ...] = ()
    disagreements: tuple[DisagreementSample, ...] = ()

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class PairedOutcome:
    probability: float
    trials_completed: int
    both_succeed: int
    primary_only_succeeds: int
    comparison_only_succeeds: int
    both_fail: int
    different_corrections: int


@dataclass(frozen=True)
class DisagreementSample:
    probability: float
    trial_number: int
    trial_seed: int
    error: tuple[Pauli, ...]
    primary_correction: tuple[Pauli, ...]
    comparison_correction: tuple[Pauli, ...]
    primary_success: bool
    comparison_success: bool


@dataclass
class _PointTotals:
    completed: int = 0
    successes: int = 0
    exact_matches: int = 0
    error_weight: int = 0
    correction_weight: int = 0
    residual_weight: int = 0
    decode_seconds: float = 0.0

    def record(
        self, decoded: CSSDecodeResult, error: InjectionPattern, elapsed: float,
        probability: float, trial_index: int, trial_seed: int,
        failures: list[FailureSample], failure_limit: int,
    ) -> tuple[Pauli, ...]:
        correction = pattern_from_components(decoded.x_component.correction, decoded.z_component.correction)
        residual = pattern_from_components(decoded.residual_x, decoded.residual_z)
        self.completed += 1
        self.successes += int(decoded.success)
        self.exact_matches += int(decoded.success and residual.weight == 0)
        self.error_weight += error.weight
        self.correction_weight += correction.weight
        self.residual_weight += residual.weight
        self.decode_seconds += elapsed
        if not decoded.success and len(failures) < failure_limit:
            failures.append(FailureSample(
                probability, trial_index + 1, trial_seed, error.paulis, correction.paulis,
                residual.paulis, decoded.residual_x_classification, decoded.residual_z_classification,
            ))
        return correction.paulis

    def result(self, probability: float, config: SimulationConfig, runtime: float) -> ProbabilityResult:
        failures = self.completed - self.successes
        return ProbabilityResult(
            probability=probability, trials_planned=config.trials_per_probability,
            trials_completed=self.completed, successes=self.successes, logical_failures=failures,
            exact_matches=self.exact_matches, stabilizer_successes=self.successes - self.exact_matches,
            logical_error_rate=failures / self.completed, confidence_level=config.confidence_level,
            confidence_method="Wilson score",
            confidence_interval=wilson_interval(failures, self.completed, config.confidence_level),
            average_error_weight=self.error_weight / self.completed,
            average_correction_weight=self.correction_weight / self.completed,
            average_residual_weight=self.residual_weight / self.completed,
            average_decode_time_ms=self.decode_seconds * 1000 / self.completed,
            runtime_seconds=runtime,
        )


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
    comparison_decoder: Decoder | None = None,
    start_trial: int = 0,
    max_trials: int | None = None,
    max_seconds: float | None = None,
) -> SimulationResult:
    _validate(config)
    if start_trial < 0 or (max_trials is not None and max_trials < 0):
        raise ValueError("Trial offsets and batch sizes cannot be negative.")
    cancel_check = should_cancel or (lambda: False)
    total_planned = len(config.probabilities) * config.trials_per_probability
    total_completed = 0
    points: list[ProbabilityResult] = []
    saved_failures: list[FailureSample] = []
    comparison_points: list[ProbabilityResult] = []
    comparison_failures: list[FailureSample] = []
    paired_outcomes: list[PairedOutcome] = []
    disagreements: list[DisagreementSample] = []
    cancelled = False
    simulation_started = perf_counter()
    batch_finished = False

    for probability_index, probability in enumerate(config.probabilities):
        point_started = perf_counter()
        primary_totals = _PointTotals()
        comparison_totals = _PointTotals()
        paired_counts = [0, 0, 0, 0]
        different_corrections = 0

        first_trial = max(0, start_trial - probability_index * config.trials_per_probability)
        for trial_index in range(first_trial, config.trials_per_probability):
            if ((max_trials is not None and total_completed >= max_trials)
                    or (max_seconds is not None and total_completed > 0
                        and perf_counter() - simulation_started >= max_seconds)):
                batch_finished = True
                break
            if cancel_check():
                cancelled = True
                break

            trial_seed = derive_trial_seed(config.seed, probability_index, trial_index)
            error = seeded_code_capacity_pattern(code.n, probability, trial_seed)
            decode_started = perf_counter()
            decoded = decoder.decode(code, error, physical_error_probability=probability)
            correction = primary_totals.record(
                decoded, error, perf_counter() - decode_started, probability, trial_index,
                trial_seed, saved_failures, config.saved_failure_limit,
            )
            if comparison_decoder is not None:
                compare_started = perf_counter()
                compared = comparison_decoder.decode(code, error, physical_error_probability=probability)
                compared_correction = comparison_totals.record(
                    compared, error, perf_counter() - compare_started, probability, trial_index,
                    trial_seed, comparison_failures, config.saved_failure_limit,
                )
                # 0: both succeed, 1: primary only, 2: comparison only, 3: both fail.
                paired_counts[(0 if decoded.success else 2) + (0 if compared.success else 1)] += 1
                different_corrections += int(correction != compared_correction)
                if decoded.success != compared.success and len(disagreements) < config.saved_failure_limit:
                    disagreements.append(DisagreementSample(
                        probability, trial_index + 1, trial_seed, error.paulis,
                        correction, compared_correction, decoded.success, compared.success,
                    ))

            total_completed += 1

            if on_progress:
                on_progress(total_completed, total_planned, probability, primary_totals.completed)

        if primary_totals.completed:
            runtime = perf_counter() - point_started
            points.append(primary_totals.result(probability, config, runtime))
            if comparison_decoder is not None:
                comparison_points.append(comparison_totals.result(probability, config, runtime))
                paired_outcomes.append(PairedOutcome(
                    probability, primary_totals.completed, *paired_counts, different_corrections,
                ))
        if cancelled or batch_finished:
            break

    common = dict(
        schema_version=2,
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
    )
    comparison = None
    if comparison_decoder is not None:
        comparison = SimulationResult(
            **common, decoder_id=comparison_decoder.metadata.id, decoder_name=comparison_decoder.metadata.name,
            decoder_settings=comparison_decoder.metadata.settings,
            points=tuple(comparison_points), saved_failures=tuple(comparison_failures),
        )
    return SimulationResult(
        **common, decoder_id=decoder.metadata.id, decoder_name=decoder.metadata.name,
        decoder_settings=decoder.metadata.settings, points=tuple(points), saved_failures=tuple(saved_failures),
        comparison=comparison, paired_outcomes=tuple(paired_outcomes), disagreements=tuple(disagreements),
    )
