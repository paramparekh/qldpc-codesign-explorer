from dataclasses import dataclass

from app.codes.hgp import hypergraph_product, repetition_check
from app.core.gf2 import (
    Matrix,
    column_weights,
    css_distance_exact,
    matmul,
    rank,
    row_weights,
    shape,
    transpose,
)


@dataclass(frozen=True)
class CodeFixture:
    schema_version: int
    id: str
    name: str
    family: str
    construction: str
    description: str
    h_x: Matrix
    h_z: Matrix
    n: int
    k: int
    d: int
    d_x: int
    d_z: int
    rank_x: int
    rank_z: int
    qubit_partition: dict[str, int]
    provenance: str
    version: str


def _build_hgp_rep3() -> CodeFixture:
    seed = repetition_check(3)
    h_x, h_z = hypergraph_product(seed, seed)
    n = shape(h_x)[1]
    rank_x = rank(h_x)
    rank_z = rank(h_z)
    d_x, d_z = css_distance_exact(h_x, h_z)

    fixture = CodeFixture(
        schema_version=1,
        id="hgp_rep3_v1",
        name="HGP repetition-3 teaching code",
        family="Quantum LDPC",
        construction="Hypergraph product",
        description=(
            "A small, fully verified qLDPC fixture constructed from two length-3 classical "
            "repetition-code parity checks."
        ),
        h_x=h_x,
        h_z=h_z,
        n=n,
        k=n - rank_x - rank_z,
        d=min(d_x, d_z),
        d_x=d_x,
        d_z=d_z,
        rank_x=rank_x,
        rank_z=rank_z,
        qubit_partition={"vertex_vertex": 9, "check_check": 4},
        provenance="HGP(H, H) with H=[[1,1,0],[0,1,1]].",
        version="1.0.0",
    )

    if shape(h_x) != (6, 13) or shape(h_z) != (6, 13):
        raise RuntimeError("The teaching fixture has an unexpected matrix shape.")
    if any(value for row in matmul(h_x, transpose(h_z)) for value in row):
        raise RuntimeError("The teaching fixture violates CSS orthogonality.")
    if (fixture.n, fixture.k, fixture.d) != (13, 1, 3):
        raise RuntimeError("The teaching fixture parameters failed verification.")
    return fixture


HGP_REP3 = _build_hgp_rep3()
FIXTURES = {HGP_REP3.id: HGP_REP3}


def list_fixtures() -> tuple[CodeFixture, ...]:
    return tuple(FIXTURES.values())


def get_fixture(fixture_id: str) -> CodeFixture | None:
    return FIXTURES.get(fixture_id)


def fixture_sparsity(fixture: CodeFixture) -> dict[str, object]:
    x_rows = row_weights(fixture.h_x)
    z_rows = row_weights(fixture.h_z)
    x_columns = column_weights(fixture.h_x)
    z_columns = column_weights(fixture.h_z)
    combined_columns = tuple(
        x + z for x, z in zip(x_columns, z_columns, strict=True)
    )
    return {
        "x_check_weights": x_rows,
        "z_check_weights": z_rows,
        "max_check_weight": max(x_rows + z_rows),
        "max_column_weight": max(x_columns + z_columns),
        "max_total_qubit_degree": max(combined_columns),
    }
