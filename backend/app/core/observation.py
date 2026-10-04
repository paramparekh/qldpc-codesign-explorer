from dataclasses import dataclass

from app.core.gf2 import Matrix, Vector, shape, syndrome


@dataclass(frozen=True)
class CheckResult:
    number: int
    result: int
    support: tuple[int, ...]
    error_qubits: tuple[int, ...]


@dataclass(frozen=True)
class CSSObservation:
    x_check_syndrome: Vector
    z_check_syndrome: Vector
    x_checks: tuple[CheckResult, ...]
    z_checks: tuple[CheckResult, ...]


def _check_results(matrix: Matrix, error_component: Vector) -> tuple[CheckResult, ...]:
    values = syndrome(matrix, error_component)
    return tuple(
        CheckResult(
            number=index + 1,
            result=values[index],
            support=tuple(column + 1 for column, value in enumerate(row) if value),
            error_qubits=tuple(
                column + 1
                for column, value in enumerate(row)
                if value and error_component[column]
            ),
        )
        for index, row in enumerate(matrix)
    )


def observe_css_error(
    h_x: Matrix,
    h_z: Matrix,
    error_x: Vector,
    error_z: Vector,
) -> CSSObservation:
    """Calculate CSS check results for a Pauli error.

    X-type checks detect the Z component, while Z-type checks detect the X
    component. A Y error contributes to both binary components.
    """

    qubit_count = shape(h_x)[1]
    if shape(h_z)[1] != qubit_count:
        raise ValueError("The X-type and Z-type check matrices must use the same qubits.")
    if len(error_x) != qubit_count or len(error_z) != qubit_count:
        raise ValueError(f"The error must contain exactly {qubit_count} qubits.")

    x_checks = _check_results(h_x, error_z)
    z_checks = _check_results(h_z, error_x)
    return CSSObservation(
        x_check_syndrome=tuple(check.result for check in x_checks),
        z_check_syndrome=tuple(check.result for check in z_checks),
        x_checks=x_checks,
        z_checks=z_checks,
    )
