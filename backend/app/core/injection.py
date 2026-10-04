from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal, cast

from app.core.gf2 import Vector


Pauli = Literal["I", "X", "Y", "Z"]
NonIdentityPauli = Literal["X", "Y", "Z"]

PAULIS: tuple[Pauli, ...] = ("I", "X", "Y", "Z")
NON_IDENTITY_PAULIS: tuple[NonIdentityPauli, ...] = ("X", "Y", "Z")
GENERATOR_VERSION = "splitmix64-v1"
_MASK_64 = (1 << 64) - 1
_UINT64_SCALE = float(1 << 64)


@dataclass(frozen=True)
class InjectionPattern:
    paulis: tuple[Pauli, ...]
    error_x: Vector
    error_z: Vector
    weight: int
    x_count: int
    y_count: int
    z_count: int


def pattern_from_paulis(paulis: Iterable[str]) -> InjectionPattern:
    untyped_values = tuple(paulis)
    if any(pauli not in PAULIS for pauli in untyped_values):
        raise ValueError("An error pattern may contain only I, X, Y, or Z.")
    values = cast(tuple[Pauli, ...], untyped_values)

    error_x = tuple(int(pauli in ("X", "Y")) for pauli in values)
    error_z = tuple(int(pauli in ("Z", "Y")) for pauli in values)
    return InjectionPattern(
        paulis=values,
        error_x=error_x,
        error_z=error_z,
        weight=sum(pauli != "I" for pauli in values),
        x_count=values.count("X"),
        y_count=values.count("Y"),
        z_count=values.count("Z"),
    )


def pattern_from_components(error_x: Sequence[int], error_z: Sequence[int]) -> InjectionPattern:
    if len(error_x) != len(error_z):
        raise ValueError("The X and Z error components must have the same length.")
    if any(value not in (0, 1) for value in (*error_x, *error_z)):
        raise ValueError("Error components may contain only 0 and 1.")
    labels = {
        (0, 0): "I",
        (1, 0): "X",
        (0, 1): "Z",
        (1, 1): "Y",
    }
    return pattern_from_paulis(
        labels[(x_value, z_value)]
        for x_value, z_value in zip(error_x, error_z, strict=True)
    )


def manual_pauli_pattern(
    qubit_count: int,
    assignments: Iterable[tuple[int, NonIdentityPauli]],
) -> InjectionPattern:
    """Build a pattern from one-based user-facing qubit numbers."""

    if qubit_count <= 0:
        raise ValueError("A code must contain at least one data qubit.")

    paulis: list[Pauli] = ["I"] * qubit_count
    seen: set[int] = set()
    for qubit, pauli in assignments:
        if not 1 <= qubit <= qubit_count:
            raise ValueError(f"Qubit numbers must be between 1 and {qubit_count}.")
        if qubit in seen:
            raise ValueError(f"Qubit {qubit} was assigned more than once.")
        if pauli not in NON_IDENTITY_PAULIS:
            raise ValueError("Manual assignments may contain only X, Y, or Z.")
        seen.add(qubit)
        paulis[qubit - 1] = pauli
    return pattern_from_paulis(paulis)


def _splitmix64(state: int) -> tuple[int, int]:
    state = (state + 0x9E3779B97F4A7C15) & _MASK_64
    value = state
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & _MASK_64
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & _MASK_64
    return state, (value ^ (value >> 31)) & _MASK_64


def seeded_code_capacity_pattern(
    qubit_count: int,
    probability: float,
    seed: int,
) -> InjectionPattern:
    """Generate a stable independent depolarizing pattern.

    Each qubit has total non-identity probability ``probability``. Conditional on
    an error, X, Y, and Z are selected as evenly as the 64-bit draw permits.
    """

    if qubit_count <= 0:
        raise ValueError("A code must contain at least one data qubit.")
    if not 0 <= probability <= 0.5:
        raise ValueError("Error probability must be between 0 and 0.5.")
    if not 0 <= seed <= (1 << 63) - 1:
        raise ValueError("The random seed must be a non-negative 63-bit integer.")

    state = seed & _MASK_64
    paulis: list[Pauli] = []
    for _ in range(qubit_count):
        state, event_draw = _splitmix64(state)
        if event_draw / _UINT64_SCALE >= probability:
            paulis.append("I")
            continue
        state, pauli_draw = _splitmix64(state)
        paulis.append(NON_IDENTITY_PAULIS[pauli_draw % 3])
    return pattern_from_paulis(paulis)
