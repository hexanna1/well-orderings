"""Shared encoder registry for document generators."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from binary import BinaryVeblenEncoder, _cmp_ordinal as compare_binary_ordinals
from buchholz_1 import Buchholz1OrdinalEncoder, _cmp_ordinal as compare_buchholz_1_ordinals
from buchholz import BuchholzOrdinalEncoder, _cmp_ordinal as compare_buchholz_ordinals
from cantor import CantorOrdinalEncoder, _cmp_ordinal as compare_cantor_ordinals
from ebocf import EBOCFOrdinalEncoder, _cmp_ordinal as compare_ebocf_ordinals
from finitary import FinitaryVeblenEncoder, _cmp_ordinal as compare_finitary_ordinals
from latex_document import PrimeTableEncoder
from transfinitary import TransfinitaryVeblenEncoder, _cmp_ordinal as compare_transfinitary_ordinals


@dataclass(frozen=True)
class EncoderSpec:
    name: str
    factory: Callable[[], PrimeTableEncoder]
    compare_ordinals: Callable[[object, object], int]
    pdf_help: str

    @property
    def tex_filename(self) -> str:
        return f"{self.name}.tex"


ENCODER_SPECS: dict[str, EncoderSpec] = {
    "cantor": EncoderSpec(
        "cantor",
        CantorOrdinalEncoder,
        compare_cantor_ordinals,
        "Generate a Cantor normal-form table.",
    ),
    "binary": EncoderSpec(
        "binary",
        BinaryVeblenEncoder,
        compare_binary_ordinals,
        "Generate a binary Veblen table.",
    ),
    "finitary": EncoderSpec(
        "finitary",
        FinitaryVeblenEncoder,
        compare_finitary_ordinals,
        "Generate a finitary Veblen table.",
    ),
    "transfinitary": EncoderSpec(
        "transfinitary",
        TransfinitaryVeblenEncoder,
        compare_transfinitary_ordinals,
        "Generate a transfinitary Veblen table.",
    ),
    "buchholz_1": EncoderSpec(
        "buchholz_1",
        Buchholz1OrdinalEncoder,
        compare_buchholz_1_ordinals,
        "Generate a Buchholz_1 table.",
    ),
    "buchholz": EncoderSpec(
        "buchholz",
        BuchholzOrdinalEncoder,
        compare_buchholz_ordinals,
        "Generate a Buchholz table.",
    ),
    "ebocf": EncoderSpec(
        "ebocf",
        EBOCFOrdinalEncoder,
        compare_ebocf_ordinals,
        "Generate an EBOCF table.",
    ),
}
