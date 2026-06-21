"""LaTeX document builder for ordinal mapping tables."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from functools import cmp_to_key
from typing import Literal, Protocol

from prime_index import PrimeIndexHelper


def build_document(
    numbers: Iterable[int],
    render_number: Callable[[int], str],
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

    for i in numbers:
        lines.append(f"{i} &\\mapsto {render_number(i)}&\\\\")

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
    latex_by_number = dict(rows)
    return build_document((number for number, _ in rows), latex_by_number.__getitem__)


def build_prime_table_rows(
    n: int,
    encoder: PrimeTableEncoder,
    *,
    order: PrimeRowOrder = "number",
    compare_ordinals: Callable[[object, object], int] | None = None,
) -> list[tuple[int, str]]:
    numbers = encoder.prime_helper.primes_up_to(n)
    ordinals: dict[int, LatexOrdinal] | None = None
    if order == "ordinal":
        if compare_ordinals is None:
            raise ValueError("compare_ordinals is required for ordinal order")
        ordinal_map = {number: encoder.ordinal(number) for number in numbers}
        numbers.sort(
            key=cmp_to_key(lambda a, b: compare_ordinals(ordinal_map[a], ordinal_map[b])),
        )
        ordinals = ordinal_map
    elif order != "number":
        raise ValueError("order must be 'number' or 'ordinal'")

    def render_number(number: int) -> str:
        ordinal = ordinals[number] if ordinals is not None else encoder.ordinal(number)
        return ordinal.to_latex()

    return [(number, render_number(number)) for number in numbers]
