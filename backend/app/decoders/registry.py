from app.decoders.base import Decoder
from app.decoders.exact import ExactCSSDecoder


_DECODERS: dict[str, Decoder] = {
    ExactCSSDecoder.metadata.id: ExactCSSDecoder(),
}


def get_decoder(decoder_id: str) -> Decoder | None:
    return _DECODERS.get(decoder_id)


def list_decoders() -> tuple[Decoder, ...]:
    return tuple(_DECODERS.values())
