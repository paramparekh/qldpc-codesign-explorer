from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.codes.registry import get_fixture
from app.core.injection import (
    GENERATOR_VERSION,
    InjectionPattern,
    manual_pauli_pattern,
    seeded_code_capacity_pattern,
)


router = APIRouter(prefix="/injections", tags=["injections"])

ErrorMode = Literal["manual_pauli", "seeded_code_capacity"]
Pauli = Literal["I", "X", "Y", "Z"]


class ManualAssignment(BaseModel):
    qubit: int = Field(ge=1, description="One-based data-qubit number.")
    pauli: Literal["X", "Y", "Z"]


class InjectionRequest(BaseModel):
    code_id: str
    mode: ErrorMode
    errors: tuple[ManualAssignment, ...] = ()
    probability: float | None = None
    seed: int | None = None


class ErrorCounts(BaseModel):
    x: int
    y: int
    z: int


class ReproducibilityMetadata(BaseModel):
    probability: float | None
    seed: int | None
    generator_version: str | None


class InjectionResponse(BaseModel):
    schema_version: int
    code_id: str
    code_version: str
    mode: ErrorMode
    qubits: tuple[Pauli, ...]
    error_x: tuple[int, ...]
    error_z: tuple[int, ...]
    weight: int
    counts: ErrorCounts
    reproducibility: ReproducibilityMetadata


def _response(
    request: InjectionRequest,
    code_version: str,
    pattern: InjectionPattern,
) -> InjectionResponse:
    seeded = request.mode == "seeded_code_capacity"
    return InjectionResponse(
        schema_version=1,
        code_id=request.code_id,
        code_version=code_version,
        mode=request.mode,
        qubits=pattern.paulis,
        error_x=pattern.error_x,
        error_z=pattern.error_z,
        weight=pattern.weight,
        counts=ErrorCounts(x=pattern.x_count, y=pattern.y_count, z=pattern.z_count),
        reproducibility=ReproducibilityMetadata(
            probability=request.probability if seeded else None,
            seed=request.seed if seeded else None,
            generator_version=GENERATOR_VERSION if seeded else None,
        ),
    )


@router.post("", response_model=InjectionResponse)
def create_injection(request: InjectionRequest) -> InjectionResponse:
    fixture = get_fixture(request.code_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="The requested qLDPC code was not found.")

    try:
        if request.mode == "manual_pauli":
            if request.probability is not None or request.seed is not None:
                raise ValueError("Manual errors do not use a probability or random seed.")
            pattern = manual_pauli_pattern(
                fixture.n,
                ((assignment.qubit, assignment.pauli) for assignment in request.errors),
            )
        else:
            if request.errors:
                raise ValueError("Seeded noise does not accept manual qubit assignments.")
            if request.probability is None or request.seed is None:
                raise ValueError("Seeded noise requires a probability and random seed.")
            pattern = seeded_code_capacity_pattern(
                fixture.n,
                request.probability,
                request.seed,
            )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return _response(request, fixture.version, pattern)
