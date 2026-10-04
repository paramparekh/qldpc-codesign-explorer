from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.codes.registry import get_fixture
from app.core.injection import Pauli, pattern_from_paulis
from app.core.observation import CSSObservation, CheckResult, observe_css_error


router = APIRouter(prefix="/observations", tags=["observations"])


class ObservationRequest(BaseModel):
    code_id: str
    code_version: str
    qubits: tuple[Pauli, ...]


class CheckResultResponse(BaseModel):
    id: str
    number: int
    result: Literal[0, 1]
    support: tuple[int, ...]
    error_qubits: tuple[int, ...]


class CheckGroupResponse(BaseModel):
    matrix: str
    detects: str
    syndrome: tuple[int, ...]
    triggered_count: int
    checks: tuple[CheckResultResponse, ...]


class ObservationResponse(BaseModel):
    schema_version: int
    code_id: str
    code_version: str
    error_weight: int
    total_triggered: int
    x_checks: CheckGroupResponse
    z_checks: CheckGroupResponse


def _group(
    prefix: str,
    matrix: str,
    detects: str,
    values: tuple[int, ...],
    checks: tuple[CheckResult, ...],
) -> CheckGroupResponse:
    return CheckGroupResponse(
        matrix=matrix,
        detects=detects,
        syndrome=values,
        triggered_count=sum(values),
        checks=tuple(
            CheckResultResponse(
                id=f"{prefix}{check.number}",
                number=check.number,
                result=check.result,
                support=check.support,
                error_qubits=check.error_qubits,
            )
            for check in checks
        ),
    )


def _response(
    request: ObservationRequest,
    error_weight: int,
    observation: CSSObservation,
) -> ObservationResponse:
    x_checks = _group(
        "X",
        "H_X",
        "Z and Y errors",
        observation.x_check_syndrome,
        observation.x_checks,
    )
    z_checks = _group(
        "Z",
        "H_Z",
        "X and Y errors",
        observation.z_check_syndrome,
        observation.z_checks,
    )
    return ObservationResponse(
        schema_version=1,
        code_id=request.code_id,
        code_version=request.code_version,
        error_weight=error_weight,
        total_triggered=x_checks.triggered_count + z_checks.triggered_count,
        x_checks=x_checks,
        z_checks=z_checks,
    )


@router.post("", response_model=ObservationResponse)
def create_observation(request: ObservationRequest) -> ObservationResponse:
    code = get_fixture(request.code_id)
    if code is None:
        raise HTTPException(status_code=404, detail="The requested qLDPC code was not found.")
    if request.code_version != code.version:
        raise HTTPException(
            status_code=409,
            detail="The saved code version does not match the current code. Return to Configure and try again.",
        )

    try:
        if len(request.qubits) != code.n:
            raise ValueError(f"The error must contain exactly {code.n} qubits.")
        pattern = pattern_from_paulis(request.qubits)
        observation = observe_css_error(code.h_x, code.h_z, pattern.error_x, pattern.error_z)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return _response(request, pattern.weight, observation)
