"""Shared encoder registry for document generators."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from binary import BinaryVeblenEncoder
from buchholz_1 import Buchholz1OrdinalEncoder
from buchholz import BuchholzOrdinalEncoder
from cantor import CantorOrdinalEncoder
from ebocf import EBOCFOrdinalEncoder
from finitary import FinitaryVeblenEncoder
from latex_document import PrimeTableEncoder
from ordinal_order import (
    OrdinalOrder, binary_order, cantor_order, collapsing_order,
    finitary_order, transfinitary_order,
)
from transfinitary import TransfinitaryVeblenEncoder


@dataclass(frozen=True)
class EncoderSpec:
    name: str
    factory: Callable[[], PrimeTableEncoder]
    ordinal_order: OrdinalOrder
    pdf_help: str

    @property
    def tex_filename(self) -> str:
        return f"{self.name}.tex"

    @property
    def bundle_filename(self) -> str:
        return f"{self.name}.bin.gz"


ENCODER_SPECS: dict[str, EncoderSpec] = {
    "cantor": EncoderSpec(
        "cantor",
        CantorOrdinalEncoder,
        cantor_order,
        "Generate a Cantor normal-form table.",
    ),
    "binary": EncoderSpec(
        "binary",
        BinaryVeblenEncoder,
        binary_order,
        "Generate a binary Veblen table.",
    ),
    "finitary": EncoderSpec(
        "finitary",
        FinitaryVeblenEncoder,
        finitary_order,
        "Generate a finitary Veblen table.",
    ),
    "transfinitary": EncoderSpec(
        "transfinitary",
        TransfinitaryVeblenEncoder,
        transfinitary_order,
        "Generate a transfinitary Veblen table.",
    ),
    "buchholz_1": EncoderSpec(
        "buchholz_1",
        Buchholz1OrdinalEncoder,
        collapsing_order,
        "Generate a Buchholz_1 table.",
    ),
    "buchholz": EncoderSpec(
        "buchholz",
        BuchholzOrdinalEncoder,
        collapsing_order,
        "Generate a Buchholz table.",
    ),
    "ebocf": EncoderSpec(
        "ebocf",
        EBOCFOrdinalEncoder,
        collapsing_order,
        "Generate an EBOCF table.",
    ),
}


def create_table_encoder(spec: EncoderSpec, limit: int) -> PrimeTableEncoder:
    encoder = spec.factory()
    prepare_prime_table = getattr(encoder, "prepare_prime_table", None)
    if prepare_prime_table is not None:
        prepare_prime_table(limit)
    return encoder
