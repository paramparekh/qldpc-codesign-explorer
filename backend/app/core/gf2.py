from collections.abc import Iterable, Sequence
from itertools import combinations


Matrix = tuple[tuple[int, ...], ...]
Vector = tuple[int, ...]


def as_matrix(rows: Iterable[Iterable[int]]) -> Matrix:
    matrix = tuple(tuple(int(value) for value in row) for row in rows)
    if not matrix:
        raise ValueError("A matrix must contain at least one row.")
    width = len(matrix[0])
    if width == 0 or any(len(row) != width for row in matrix):
        raise ValueError("Matrix rows must have one consistent, non-zero width.")
    if any(value not in (0, 1) for row in matrix for value in row):
        raise ValueError("GF(2) matrices may contain only 0 and 1.")
    return matrix


def shape(matrix: Matrix) -> tuple[int, int]:
    return len(matrix), len(matrix[0])


def identity(size: int) -> Matrix:
    if size <= 0:
        raise ValueError("Identity size must be positive.")
    return tuple(tuple(int(row == column) for column in range(size)) for row in range(size))


def transpose(matrix: Matrix) -> Matrix:
    rows, columns = shape(matrix)
    return tuple(tuple(matrix[row][column] for row in range(rows)) for column in range(columns))


def kronecker(left: Matrix, right: Matrix) -> Matrix:
    left_rows, left_columns = shape(left)
    right_rows, right_columns = shape(right)
    return tuple(
        tuple(
            left[left_row][left_column] * right[right_row][right_column]
            for left_column in range(left_columns)
            for right_column in range(right_columns)
        )
        for left_row in range(left_rows)
        for right_row in range(right_rows)
    )


def horizontal_stack(left: Matrix, right: Matrix) -> Matrix:
    if len(left) != len(right):
        raise ValueError("Matrices must have equal row counts for horizontal stacking.")
    return tuple(left_row + right_row for left_row, right_row in zip(left, right, strict=True))


def matmul(left: Matrix, right: Matrix) -> Matrix:
    left_rows, shared = shape(left)
    right_rows, right_columns = shape(right)
    if shared != right_rows:
        raise ValueError("Matrix dimensions are incompatible for multiplication.")
    return tuple(
        tuple(
            sum(left[row][index] * right[index][column] for index in range(shared)) % 2
            for column in range(right_columns)
        )
        for row in range(left_rows)
    )


def syndrome(matrix: Matrix, vector: Sequence[int]) -> Vector:
    _, columns = shape(matrix)
    if len(vector) != columns or any(value not in (0, 1) for value in vector):
        raise ValueError("A binary vector must match the matrix column count.")
    return tuple(sum(row[index] * vector[index] for index in range(columns)) % 2 for row in matrix)


def rank(matrix: Matrix) -> int:
    work = [list(row) for row in matrix]
    rows, columns = shape(matrix)
    pivot_row = 0

    for column in range(columns):
        pivot = next((row for row in range(pivot_row, rows) if work[row][column]), None)
        if pivot is None:
            continue
        work[pivot_row], work[pivot] = work[pivot], work[pivot_row]
        for row in range(rows):
            if row != pivot_row and work[row][column]:
                work[row] = [a ^ b for a, b in zip(work[row], work[pivot_row], strict=True)]
        pivot_row += 1
        if pivot_row == rows:
            break

    return pivot_row


def row_space_contains(matrix: Matrix, vector: Vector) -> bool:
    if len(vector) != shape(matrix)[1]:
        return False
    return rank(matrix + (vector,)) == rank(matrix)


def css_distance_exact(h_x: Matrix, h_z: Matrix) -> tuple[int, int]:
    """Return exact X/Z distances by exhaustive search for a small CSS fixture."""

    n = shape(h_x)[1]
    if shape(h_z)[1] != n:
        raise ValueError("CSS matrices must have the same number of columns.")

    distance_x = 0
    distance_z = 0
    for weight in range(1, n + 1):
        for support in combinations(range(n), weight):
            vector = tuple(int(index in support) for index in range(n))
            if not distance_x and not any(syndrome(h_z, vector)) and not row_space_contains(h_x, vector):
                distance_x = weight
            if not distance_z and not any(syndrome(h_x, vector)) and not row_space_contains(h_z, vector):
                distance_z = weight
            if distance_x and distance_z:
                return distance_x, distance_z

    raise ValueError("No non-trivial logical operators were found.")


def row_weights(matrix: Matrix) -> tuple[int, ...]:
    return tuple(sum(row) for row in matrix)


def column_weights(matrix: Matrix) -> tuple[int, ...]:
    return row_weights(transpose(matrix))

