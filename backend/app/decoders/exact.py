from app.codes.registry import CodeFixture
from app.core.decoding import CSSDecodeResult, decode_css_error
from app.core.injection import InjectionPattern
from app.decoders.base import DecoderMetadata


class ExactCSSDecoder:
    metadata = DecoderMetadata(
        id="exact-css-min-weight-v1",
        name="Exact minimum-weight CSS decoder",
        method=(
            "Searches X and Z corrections in increasing weight and selects the lightest ones. "
            "If several choices have the same weight, it always uses the same choice."
        ),
        scaling_note=(
            "Exact search is a reference method for the current 13-qubit code. "
            "It is not intended for large qLDPC codes."
        ),
        settings={"method": "independent minimum-weight X/Z search", "tie_break": "lexicographic support"},
    )

    def decode(
        self, code: CodeFixture, error: InjectionPattern, *, physical_error_probability: float = 0.05,
    ) -> CSSDecodeResult:
        return decode_css_error(code.h_x, code.h_z, error.error_x, error.error_z)
