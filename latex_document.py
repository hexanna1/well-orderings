"""LaTeX document builder for ordinal mapping tables."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from ordinal_order import OrdinalOrder, TableOrdinal
from prime_index import PrimeIndexHelper


def build_document(
    rows: Iterable[tuple[int, str]],
) -> str:
    lines = [
        "\\documentclass{article}",
        "\\usepackage{amsmath}",
        "\\usepackage{multicol}",
        "\\usepackage[letterpaper,margin=0.25cm]{geometry}",
        "\\allowdisplaybreaks",
        "\\pagenumbering{gobble}",
        "\\begin{document}",
        "\\begin{multicols}{3}",
        "\\noindent",
        "\\begin{flalign*}",
    ]

    for number, latex in rows:
        lines.append(f"{number} &\\mapsto {latex}&\\\\")

    lines.extend(
        [
            "\\end{flalign*}",
            "\\end{multicols}",
            "\\end{document}",
        ]
    )
    return "\n".join(lines)


class PrimeTableEncoder(Protocol):
    prime_helper: PrimeIndexHelper

    def ordinal(self, n: int) -> TableOrdinal: ...


def build_prime_table_document(
    n: int,
    encoder: PrimeTableEncoder,
    *,
    ordinal_order: OrdinalOrder | None = None,
) -> str:
    rows = build_prime_table_rows(n, encoder, ordinal_order=ordinal_order)
    return build_document(rows)


def build_prime_table_rows(
    n: int,
    encoder: PrimeTableEncoder,
    *,
    ordinal_order: OrdinalOrder | None = None,
) -> list[tuple[int, str]]:
    numbers = encoder.prime_helper.primes_up_to(n)
    if ordinal_order is None:
        return [(number, encoder.ordinal(number).to_latex()) for number in numbers]
    ordinals = [encoder.ordinal(number) for number in numbers]
    return [(numbers[i], ordinals[i].to_latex()) for i in ordinal_order(ordinals)]
