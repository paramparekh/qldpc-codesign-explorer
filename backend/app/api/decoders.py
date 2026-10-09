from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.codes.registry import get_fixture
from app.core.decoding import ComponentCorrection
from app.core.injection import InjectionPattern, Pauli, pattern_from_components, pattern_from_paulis
from app.decoders import get_decoder, list_decoders


router = APIRouter(prefix="/decoders", tags=["decoders"])


class DecodeRequest(BaseModel):
    code_id: str
    code_version: str
    qubits: tuple[Pauli, ...]


class PauliPatternResponse(BaseModel):
    qubits: tuple[Pauli, ...]
    error_x: tuple[int, ...]
    error_z: tuple[int, ...]
    weight: int
    counts: dict[str, int]


class ComponentDecodeResponse(BaseModel):
    component: Literal["X", "Z"]
    syndrome_source: str
    syndrome: tuple[int, ...]
    correction_support: tuple[int, ...]
    correction_weight: int
    minimum_candidate_count: int


class ResidualResponse(PauliPatternResponse):
    x_check_syndrome: tuple[int, ...]
    z_check_syndrome: tuple[int, ...]
    x_classification: Literal["none", "stabilizer", "logical"]
    z_classification: Literal["none", "stabilizer", "logical"]


class DecoderMetadata(BaseModel):
    id: str
    name: str
    method: str
    scaling_note: str


class DecodeResponse(BaseModel):
    schema_version: int
    code_id: str
    code_version: str
    decoder: DecoderMetadata
    status: Literal["corrected", "logical_failure"]
    success: bool
    message: str
    original: PauliPatternResponse
    correction: PauliPatternResponse
    residual: ResidualResponse
    x_component: ComponentDecodeResponse
    z_component: ComponentDecodeResponse


def _pattern(pattern: InjectionPattern) -> PauliPatternResponse:
    return PauliPatternResponse(
        qubits=pattern.paulis,
        error_x=pattern.error_x,
        error_z=pattern.error_z,
        weight=pattern.weight,
        counts={"x": pattern.x_count, "y": pattern.y_count, "z": pattern.z_count},
    )


def _component(
    label: Literal["X", "Z"],
    source: str,
    result: ComponentCorrection,
) -> ComponentDecodeResponse:
    return ComponentDecodeResponse(
        component=label,
        syndrome_source=source,
        syndrome=result.syndrome,
        correction_support=tuple(index + 1 for index, value in enumerate(result.correction) if value),
        correction_weight=result.weight,
        minimum_candidate_count=result.minimum_candidate_count,
    )


@router.post("", response_model=DecodeResponse)
def decode_error(request: DecodeRequest) -> DecodeResponse:
    code = get_fixture(request.code_id)
    if code is None:
        raise HTTPException(status_code=404, detail="The requested qLDPC code was not found.")
    if request.code_version != code.version:
        raise HTTPException(
            status_code=409,
            detail="The saved code version does not match the current code. Return to Configure and try again.",
        )

    decoder = get_decoder("exact-css-min-weight-v1")
    if decoder is None:
        raise HTTPException(status_code=503, detail="The exact decoder is not available.")

    try:
        if len(request.qubits) != code.n:
            raise ValueError(f"The error must contain exactly {code.n} qubits.")
        original = pattern_from_paulis(request.qubits)
        result = decoder.decode(code, original)
        correction = pattern_from_components(
            result.x_component.correction,
            result.z_component.correction,
        )
        residual = pattern_from_components(result.residual_x, result.residual_z)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    exact_match = residual.weight == 0
    if result.success:
        message = (
            "The correction exactly matches the error, so no residual operation remains."
            if exact_match
            else "The residual is a stabilizer, so the logical information is preserved."
        )
    else:
        message = (
            "The checks are quiet, but the residual acts as a logical operation. "
            "The encoded information has changed."
        )

    return DecodeResponse(
        schema_version=1,
        code_id=code.id,
        code_version=code.version,
        decoder=DecoderMetadata(
            id=decoder.metadata.id,
            name=decoder.metadata.name,
            method=decoder.metadata.method,
            scaling_note=decoder.metadata.scaling_note,
        ),
        status="corrected" if result.success else "logical_failure",
        success=result.success,
        message=message,
        original=_pattern(original),
        correction=_pattern(correction),
        residual=ResidualResponse(
            **_pattern(residual).model_dump(),
            x_check_syndrome=result.residual_x_check_syndrome,
            z_check_syndrome=result.residual_z_check_syndrome,
            x_classification=result.residual_x_classification,
            z_classification=result.residual_z_classification,
        ),
        x_component=_component("X", "Z-type checks", result.x_component),
        z_component=_component("Z", "X-type checks", result.z_component),
    )


@router.get("", response_model=tuple[DecoderMetadata, ...])
def read_decoders() -> tuple[DecoderMetadata, ...]:
    return tuple(
        DecoderMetadata(
            id=decoder.metadata.id,
            name=decoder.metadata.name,
            method=decoder.metadata.method,
            scaling_note=decoder.metadata.scaling_note,
        )
        for decoder in list_decoders()
    )
