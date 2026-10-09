from app.codes.registry import CodeFixture
from app.core.decoding import CSSDecodeResult, decode_css_error
from app.core.injection import InjectionPattern
from app.decoders.base import DecoderMetadata


class ExactCSSDecoder:
    metadata = DecoderMetadata(
        id="exact-css-min-weight-v1",
        name="Exact minimum-weight CSS decoder",
        method=(
            "Checks every X and Z correction for this code and selects the lightest ones. "
            "If several choices have the same weight, it always uses the same choice."
        ),
        scaling_note=(
            "Exact search is a reference method for the current 13-qubit code. "
            "It is not intended for large qLDPC codes."
        ),
    )

    def decode(self, code: CodeFixture, error: InjectionPattern) -> CSSDecodeResult:
        return decode_css_error(code.h_x, code.h_z, error.error_x, error.error_z)
