from app.codes.hgp import hypergraph_product, repetition_check
from app.codes.registry import HGP_REP3, fixture_sparsity
from app.core.gf2 import css_distance_exact, matmul, rank, shape, syndrome, transpose


def test_repetition_three_hgp_has_verified_parameters() -> None:
    seed = repetition_check(3)
    h_x, h_z = hypergraph_product(seed, seed)

    assert shape(h_x) == (6, 13)
    assert shape(h_z) == (6, 13)
    assert rank(h_x) == 6
    assert rank(h_z) == 6
    assert 13 - rank(h_x) - rank(h_z) == 1
    assert not any(value for row in matmul(h_x, transpose(h_z)) for value in row)
    assert css_distance_exact(h_x, h_z) == (3, 3)


def test_fixture_sparsity_matches_qldpc_claims() -> None:
    sparsity = fixture_sparsity(HGP_REP3)

    assert set(sparsity["x_check_weights"]) == {3, 4}
    assert set(sparsity["z_check_weights"]) == {3, 4}
    assert sparsity["max_check_weight"] == 4
    assert sparsity["max_column_weight"] == 2
    assert sparsity["max_total_qubit_degree"] == 4


def test_fixture_reproduces_golden_single_qubit_syndromes() -> None:
    error = tuple(int(index == 4) for index in range(HGP_REP3.n))

    assert syndrome(HGP_REP3.h_z, error) == (0, 0, 1, 1, 0, 0)
    assert syndrome(HGP_REP3.h_x, error) == (0, 1, 0, 0, 1, 0)
