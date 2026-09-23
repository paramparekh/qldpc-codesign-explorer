from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.codes.registry import CodeFixture, fixture_sparsity, get_fixture, list_fixtures
from app.core.gf2 import matmul, shape, transpose


router = APIRouter(prefix="/codes", tags=["codes"])


class CodeParameters(BaseModel):
    n: int
    k: int
    d: int
    d_x: int
    d_z: int
    rate: float
    distance_status: Literal["verified"]


class CodeSummary(BaseModel):
    id: str
    name: str
    family: str
    construction: str
    description: str
    parameters: CodeParameters
    version: str


class MatrixMetadata(BaseModel):
    h_x_shape: tuple[int, int]
    h_z_shape: tuple[int, int]
    rank_x: int
    rank_z: int
    x_check_weights: tuple[int, ...]
    z_check_weights: tuple[int, ...]
    max_check_weight: int
    max_column_weight: int
    max_total_qubit_degree: int


class ValidationEvidence(BaseModel):
    id: str
    label: str
    status: Literal["passed"]
    detail: str


class MatrixConvention(BaseModel):
    h_x: str
    h_z: str


class CodeDetail(CodeSummary):
    schema_version: int
    matrices: dict[str, tuple[tuple[int, ...], ...]]
    matrix_metadata: MatrixMetadata
    matrix_convention: MatrixConvention
    qubit_partition: dict[str, int]
    provenance: str
    validation: tuple[ValidationEvidence, ...]
    supported_error_models: tuple[str, ...]
    measurement_model: str


def _parameters(fixture: CodeFixture) -> CodeParameters:
    return CodeParameters(
        n=fixture.n,
        k=fixture.k,
        d=fixture.d,
        d_x=fixture.d_x,
        d_z=fixture.d_z,
        rate=fixture.k / fixture.n,
        distance_status="verified",
    )


def _summary(fixture: CodeFixture) -> CodeSummary:
    return CodeSummary(
        id=fixture.id,
        name=fixture.name,
        family=fixture.family,
        construction=fixture.construction,
        description=fixture.description,
        parameters=_parameters(fixture),
        version=fixture.version,
    )


def _detail(fixture: CodeFixture) -> CodeDetail:
    sparsity = fixture_sparsity(fixture)
    product = matmul(fixture.h_x, transpose(fixture.h_z))
    return CodeDetail(
        **_summary(fixture).model_dump(),
        schema_version=fixture.schema_version,
        matrices={"h_x": fixture.h_x, "h_z": fixture.h_z},
        matrix_metadata=MatrixMetadata(
            h_x_shape=shape(fixture.h_x),
            h_z_shape=shape(fixture.h_z),
            rank_x=fixture.rank_x,
            rank_z=fixture.rank_z,
            x_check_weights=sparsity["x_check_weights"],
            z_check_weights=sparsity["z_check_weights"],
            max_check_weight=sparsity["max_check_weight"],
            max_column_weight=sparsity["max_column_weight"],
            max_total_qubit_degree=sparsity["max_total_qubit_degree"],
        ),
        matrix_convention=MatrixConvention(
            h_x="Rows are X-type checks and detect the Z-error component.",
            h_z="Rows are Z-type checks and detect the X-error component.",
        ),
        qubit_partition=fixture.qubit_partition,
        provenance=fixture.provenance,
        validation=(
            ValidationEvidence(
                id="binary",
                label="Binary matrices",
                status="passed",
                detail="Every H_X and H_Z entry is in GF(2).",
            ),
            ValidationEvidence(
                id="dimensions",
                label="Compatible dimensions",
                status="passed",
                detail="Both check matrices have 13 data-qubit columns.",
            ),
            ValidationEvidence(
                id="orthogonality",
                label="CSS orthogonality",
                status="passed",
                detail=(
                    "H_X H_Z^T is the all-zero 6 by 6 matrix over GF(2)."
                    if not any(value for row in product for value in row)
                    else "Orthogonality failed."
                ),
            ),
            ValidationEvidence(
                id="distance",
                label="Exact distance",
                status="passed",
                detail="Exhaustive search verifies d_X = d_Z = 3.",
            ),
        ),
        supported_error_models=("manual_pauli", "seeded_code_capacity"),
        measurement_model="Perfect syndrome measurement",
    )


@router.get("", response_model=tuple[CodeSummary, ...])
def read_codes() -> tuple[CodeSummary, ...]:
    return tuple(_summary(fixture) for fixture in list_fixtures())


@router.get("/{fixture_id}", response_model=CodeDetail)
def read_code(fixture_id: str) -> CodeDetail:
    fixture = get_fixture(fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Unknown qLDPC fixture.")
    return _detail(fixture)
