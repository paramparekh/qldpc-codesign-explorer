import asyncio
from itertools import product

from app.codes.registry import HGP_REP3
from app.core.gf2 import row_space_contains, syndrome
from app.core.injection import pattern_from_components, pattern_from_paulis, seeded_code_capacity_pattern
from app.decoders import get_decoder
from app.experiments.runner import SimulationConfig, derive_trial_seed, run_simulation
from test_decoders import post


def test_bposd_corrects_every_single_qubit_pauli_and_the_empty_error() -> None:
    decoder = get_decoder("bp-osd-css-v1")
    assert decoder is not None
    for probability in (0.0, 0.05, 0.5):
        for qubit in range(HGP_REP3.n):
            for pauli in ("I", "X", "Y", "Z"):
                values = ["I"] * HGP_REP3.n
                values[qubit] = pauli
                decoded = decoder.decode(HGP_REP3, pattern_from_paulis(values), physical_error_probability=probability)
                assert decoded.success, (probability, qubit, pauli)
                assert not any(decoded.residual_x_check_syndrome + decoded.residual_z_check_syndrome)
                assert decoded.x_component.minimum_candidate_count is None


def test_bposd_matches_every_possible_css_syndrome_and_checks_logical_class() -> None:
    decoder = get_decoder("bp-osd-css-v1")
    assert decoder is not None
    for matrix in (HGP_REP3.h_x, HGP_REP3.h_z):
        representatives = {}
        for vector in product((0, 1), repeat=HGP_REP3.n):
            representatives.setdefault(syndrome(matrix, vector), vector)
            if len(representatives) == 64:
                break
        assert len(representatives) == 64
        for target, vector in representatives.items():
            is_x = matrix == HGP_REP3.h_z
            error = pattern_from_components(vector if is_x else (0,) * 13, (0,) * 13 if is_x else vector)
            decoded = decoder.decode(HGP_REP3, error)
            component = decoded.x_component if is_x else decoded.z_component
            assert syndrome(matrix, component.correction) == target
            assert decoded.success == (
                row_space_contains(HGP_REP3.h_x, decoded.residual_x)
                and row_space_contains(HGP_REP3.h_z, decoded.residual_z)
            )


def test_decode_api_selects_bposd_and_reports_settings_without_minimum_weight_claim() -> None:
    payload = {"code_id": HGP_REP3.id, "code_version": HGP_REP3.version,
               "qubits": ["X"] + ["I"] * 12, "decoder_id": "bp-osd-css-v1", "physical_error_probability": 0.1}
    response = asyncio.run(post(payload))
    assert response.status_code == 200
    data = response.json()
    assert data["success"]
    assert data["decoder"]["settings"]["library_version"] == "2.4.1"
    assert data["decoder"]["settings"]["physical_error_probability"] == 0.1
    assert data["x_component"]["minimum_candidate_count"] is None
    assert asyncio.run(post({**payload, "decoder_id": "missing"})).status_code == 404
    assert asyncio.run(post({**payload, "physical_error_probability": 0.6})).status_code == 422


def test_paired_simulation_uses_identical_errors_and_replays_outcome_disagreements() -> None:
    primary, comparison = get_decoder("exact-css-min-weight-v1"), get_decoder("bp-osd-css-v1")
    assert primary is not None and comparison is not None

    class Recorder:
        def __init__(self, decoder):
            self.decoder, self.metadata, self.inputs = decoder, decoder.metadata, []

        def decode(self, code, error, *, physical_error_probability=0.05):
            self.inputs.append((error.paulis, physical_error_probability))
            return self.decoder.decode(code, error, physical_error_probability=physical_error_probability)

    first, second = Recorder(primary), Recorder(comparison)
    config = SimulationConfig((0.0, 0.1, 0.3), 60, 42)
    result = run_simulation(HGP_REP3, first, config, comparison_decoder=second)
    repeat = run_simulation(HGP_REP3, primary, config, comparison_decoder=comparison)
    assert first.inputs == second.inputs
    assert result.comparison is not None
    assert [p.logical_failures for p in result.comparison.points] == [p.logical_failures for p in repeat.comparison.points]
    assert result.paired_outcomes == repeat.paired_outcomes
    assert result.disagreements == repeat.disagreements
    assert result.disagreements
    for primary_point, secondary_point, paired in zip(result.points, result.comparison.points, result.paired_outcomes, strict=True):
        assert paired.both_succeed + paired.primary_only_succeeds == primary_point.successes
        assert paired.both_succeed + paired.comparison_only_succeeds == secondary_point.successes
        assert paired.both_fail + paired.comparison_only_succeeds == primary_point.logical_failures
        assert sum((paired.both_succeed, paired.primary_only_succeeds, paired.comparison_only_succeeds, paired.both_fail)) == 60
        assert primary_point.average_error_weight == secondary_point.average_error_weight
    for sample in result.disagreements:
        probability_index = config.probabilities.index(sample.probability)
        assert sample.trial_seed == derive_trial_seed(config.seed, probability_index, sample.trial_number - 1)
        error = seeded_code_capacity_pattern(13, sample.probability, sample.trial_seed)
        assert error.paulis == sample.error
        assert primary.decode(HGP_REP3, error, physical_error_probability=sample.probability).success == sample.primary_success
        assert comparison.decode(HGP_REP3, error, physical_error_probability=sample.probability).success == sample.comparison_success
        assert sample.primary_success != sample.comparison_success


def test_cancelled_comparison_preserves_complete_pairs() -> None:
    primary, comparison = get_decoder("exact-css-min-weight-v1"), get_decoder("bp-osd-css-v1")
    completed = 0

    def progress(count, *_):
        nonlocal completed
        completed = count

    result = run_simulation(HGP_REP3, primary, SimulationConfig((0.1, 0.2), 100, 42),
                            comparison_decoder=comparison, should_cancel=lambda: completed >= 3, on_progress=progress)
    assert result.cancelled and result.total_trials_completed == 3
    assert result.comparison is not None and result.comparison.total_trials_completed == 3
    assert result.paired_outcomes[0].trials_completed == 3
