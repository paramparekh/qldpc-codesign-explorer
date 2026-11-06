from importlib.metadata import version

import numpy as np
from ldpc import BpOsdDecoder

from app.codes.registry import CodeFixture
from app.core.decoding import ComponentCorrection, CSSDecodeResult, evaluate_css_correction
from app.core.gf2 import Matrix, Vector, syndrome
from app.core.injection import InjectionPattern
from app.decoders.base import DecoderMetadata


class BPOSDCSSDecoder:
    metadata = DecoderMetadata(
        id="bp-osd-css-v1",
        name="BP+OSD CSS decoder",
        method=(
            "Belief propagation estimates likely errors from the syndrome. "
            "Ordered statistics decoding supplies a syndrome-consistent correction if BP does not converge."
        ),
        scaling_note=(
            "A practical qLDPC decoding method, demonstrated here on 13 qubits. "
            "It does not guarantee minimum weight or optimal logical performance."
        ),
        settings={
            "library": "ldpc", "library_version": version("ldpc"),
            "numpy_version": version("numpy"), "scipy_version": version("scipy"),
            "bp_method": "minimum_sum", "ms_scaling_factor": 1.0,
            "max_iter": 30, "schedule": "parallel", "omp_thread_count": 1,
            "osd_method": "OSD_CS", "osd_order": 2,
            "component_prior": "2p/3 for independent X/Z decoding; floor 1e-12 at p=0",
        },
    )

    def decode(
        self, code: CodeFixture, error: InjectionPattern, *, physical_error_probability: float = 0.05,
    ) -> CSSDecodeResult:
        if not 0 <= physical_error_probability <= 0.5:
            raise ValueError("The decoder error probability must be between 0 and 0.5.")
        # Each CSS component occurs for two of the three equiprobable Paulis.
        prior = max(2 * physical_error_probability / 3, 1e-12)

        def component(matrix: Matrix, errors: Vector) -> ComponentCorrection:
            target = syndrome(matrix, errors)
            # Instances are local: the library decoder mutates during decoding.
            decoder = BpOsdDecoder(
                np.array(matrix, dtype=np.uint8), error_rate=prior,
                bp_method="minimum_sum", ms_scaling_factor=1.0, max_iter=30,
                schedule="parallel", omp_thread_count=1,
                osd_method="OSD_CS", osd_order=2,
            )
            correction = tuple(int(value) for value in decoder.decode(np.array(target, dtype=np.uint8)))
            if syndrome(matrix, correction) != target:
                raise RuntimeError("BP+OSD returned a correction that does not match the syndrome.")
            return ComponentCorrection(target, correction, sum(correction), None)

        return evaluate_css_correction(
            code.h_x, code.h_z, error.error_x, error.error_z,
            component(code.h_z, error.error_x), component(code.h_x, error.error_z),
        )
