from dataclasses import dataclass
from itertools import combinations
from typing import Literal

from app.core.gf2 import Matrix, Vector, row_space_contains, shape, syndrome


ComponentClass = Literal["none", "stabilizer", "logical"]


@dataclass(frozen=True)
class ComponentCorrection:
    syndrome: Vector
    correction: Vector
    weight: int
    minimum_candidate_count: int


@dataclass(frozen=True)
class CSSDecodeResult:
    x_component: ComponentCorrection
    z_component: ComponentCorrection
    residual_x: Vector
    residual_z: Vector
    residual_x_check_syndrome: Vector
    residual_z_check_syndrome: Vector
    residual_x_classification: ComponentClass
    residual_z_classification: ComponentClass
    success: bool


def minimum_weight_correction(matrix: Matrix, target: Vector) -> ComponentCorrection:
    """Return a deterministic minimum-weight vector with the requested syndrome."""

    rows, qubit_count = shape(matrix)
    if len(target) != rows or any(value not in (0, 1) for value in target):
        raise ValueError("The syndrome must be a binary vector with one value per check.")

    for weight in range(qubit_count + 1):
        candidates: list[Vector] = []
        for support in combinations(range(qubit_count), weight):
            support_set = set(support)
            vector = tuple(int(index in support_set) for index in range(qubit_count))
            if syndrome(matrix, vector) == target:
                candidates.append(vector)
        if candidates:
            return ComponentCorrection(
                syndrome=target,
                correction=candidates[0],
                weight=weight,
                minimum_candidate_count=len(candidates),
            )

    raise ValueError("No correction matches the supplied syndrome.")


def _classify_residual(residual: Vector, stabilizer_matrix: Matrix) -> ComponentClass:
    if not any(residual):
        return "none"
    if row_space_contains(stabilizer_matrix, residual):
        return "stabilizer"
    return "logical"


def decode_css_error(
    h_x: Matrix,
    h_z: Matrix,
    error_x: Vector,
    error_z: Vector,
) -> CSSDecodeResult:
    """Decode X and Z error components and verify their logical effect.

    The X component is decoded from the Z-type checks, and the Z component is
    decoded from the X-type checks. Corrections are selected by exact
    minimum-weight search with deterministic tie-breaking.
    """

    qubit_count = shape(h_x)[1]
    if shape(h_z)[1] != qubit_count:
        raise ValueError("The X-type and Z-type check matrices must use the same qubits.")
    if len(error_x) != qubit_count or len(error_z) != qubit_count:
        raise ValueError(f"The error must contain exactly {qubit_count} qubits.")

    x_component = minimum_weight_correction(h_z, syndrome(h_z, error_x))
    z_component = minimum_weight_correction(h_x, syndrome(h_x, error_z))
    residual_x = tuple(a ^ b for a, b in zip(error_x, x_component.correction, strict=True))
    residual_z = tuple(a ^ b for a, b in zip(error_z, z_component.correction, strict=True))
    residual_x_check_syndrome = syndrome(h_x, residual_z)
    residual_z_check_syndrome = syndrome(h_z, residual_x)

    if any(residual_x_check_syndrome) or any(residual_z_check_syndrome):
        raise RuntimeError("The selected correction did not clear the syndrome.")

    residual_x_classification = _classify_residual(residual_x, h_x)
    residual_z_classification = _classify_residual(residual_z, h_z)
    success = residual_x_classification != "logical" and residual_z_classification != "logical"
    return CSSDecodeResult(
        x_component=x_component,
        z_component=z_component,
        residual_x=residual_x,
        residual_z=residual_z,
        residual_x_check_syndrome=residual_x_check_syndrome,
        residual_z_check_syndrome=residual_z_check_syndrome,
        residual_x_classification=residual_x_classification,
        residual_z_classification=residual_z_classification,
        success=success,
    )
