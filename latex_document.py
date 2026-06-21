"""LaTeX document builder for ordinal mapping tables."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from functools import cmp_to_key
from typing import Literal, Protocol

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


class LatexOrdinal(Protocol):
    def to_latex(self) -> str: ...


class PrimeTableEncoder(Protocol):
    prime_helper: PrimeIndexHelper

    def ordinal(self, n: int) -> LatexOrdinal: ...


PrimeRowOrder = Literal["number", "ordinal"]


def build_prime_table_document(
    n: int,
    encoder: PrimeTableEncoder,
    *,
    order: PrimeRowOrder = "number",
    compare_ordinals: Callable[[object, object], int] | None = None,
) -> str:
    rows = build_prime_table_rows(
        n,
        encoder,
        order=order,
        compare_ordinals=compare_ordinals,
    )
    return build_document(rows)


def build_prime_table_rows(
    n: int,
    encoder: PrimeTableEncoder,
    *,
    order: PrimeRowOrder = "number",
    compare_ordinals: Callable[[object, object], int] | None = None,
) -> list[tuple[int, str]]:
    numbers = encoder.prime_helper.primes_up_to(n)
    if order == "ordinal":
        if compare_ordinals is None:
            raise ValueError("compare_ordinals is required for ordinal order")
        rows = [(number, encoder.ordinal(number)) for number in numbers]
        rows.sort(
            key=cmp_to_key(lambda a, b: compare_ordinals(a[1], b[1])),
        )
        return [(number, ordinal.to_latex()) for number, ordinal in rows]
    if order != "number":
        raise ValueError("order must be 'number' or 'ordinal'")
    return [(number, encoder.ordinal(number).to_latex()) for number in numbers]
