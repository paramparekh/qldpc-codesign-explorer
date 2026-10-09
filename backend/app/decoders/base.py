from dataclasses import dataclass
from typing import Protocol

from app.codes.registry import CodeFixture
from app.core.decoding import CSSDecodeResult
from app.core.injection import InjectionPattern


@dataclass(frozen=True)
class DecoderMetadata:
    id: str
    name: str
    method: str
    scaling_note: str


class Decoder(Protocol):
    metadata: DecoderMetadata

    def decode(self, code: CodeFixture, error: InjectionPattern) -> CSSDecodeResult: ...
