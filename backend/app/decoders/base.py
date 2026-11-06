from dataclasses import dataclass, field
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
    settings: dict[str, str | int | float] = field(default_factory=dict)


class Decoder(Protocol):
    metadata: DecoderMetadata

    def decode(
        self, code: CodeFixture, error: InjectionPattern, *, physical_error_probability: float = 0.05,
    ) -> CSSDecodeResult: ...
