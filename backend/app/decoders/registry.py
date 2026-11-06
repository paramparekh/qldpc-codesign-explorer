from app.decoders.base import Decoder
from app.decoders.exact import ExactCSSDecoder
from app.decoders.bposd import BPOSDCSSDecoder


_DECODERS: dict[str, Decoder] = {
    ExactCSSDecoder.metadata.id: ExactCSSDecoder(),
    BPOSDCSSDecoder.metadata.id: BPOSDCSSDecoder(),
}


def get_decoder(decoder_id: str) -> Decoder | None:
    return _DECODERS.get(decoder_id)


def list_decoders() -> tuple[Decoder, ...]:
    return tuple(_DECODERS.values())
