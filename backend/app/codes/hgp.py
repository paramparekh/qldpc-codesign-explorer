from app.core.gf2 import Matrix, as_matrix, horizontal_stack, identity, kronecker, shape, transpose


def repetition_check(length: int) -> Matrix:
    if length < 2:
        raise ValueError("A repetition check requires a length of at least two.")
    return as_matrix(
        tuple(int(column in (row, row + 1)) for column in range(length))
        for row in range(length - 1)
    )


def hypergraph_product(h_1: Matrix, h_2: Matrix) -> tuple[Matrix, Matrix]:
    m_1, n_1 = shape(h_1)
    m_2, n_2 = shape(h_2)

    h_x = horizontal_stack(
        kronecker(h_1, identity(n_2)),
        kronecker(identity(m_1), transpose(h_2)),
    )
    h_z = horizontal_stack(
        kronecker(identity(n_1), h_2),
        kronecker(transpose(h_1), identity(m_2)),
    )
    return h_x, h_z

