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


class PrimeTableEncoder(Protocol):
    prime_helper: PrimeIndexHelper

    def ordinal(self, n: int) -> object: ...

    def ordinal_latex(self, n: int) -> str: ...


def ordinal_sorted_numbers(
    numbers: Iterable[int],
    decode_number: Callable[[int], object],
    compare_ordinals: Callable[[object, object], int],
) -> list[int]:
    ordinals = {number: decode_number(number) for number in numbers}
    return sorted(
        ordinals,
        key=cmp_to_key(lambda a, b: compare_ordinals(ordinals[a], ordinals[b])),
    )


PrimeRowOrder = Literal["number", "ordinal"]


def build_prime_table_document(
    n: int,
    encoder: PrimeTableEncoder,
    *,
    order: PrimeRowOrder = "number",
    compare_ordinals: Callable[[object, object], int] | None = None,
) -> str:
    numbers = encoder.prime_helper.primes_up_to(n)
    if order == "ordinal":
        if compare_ordinals is None:
            raise ValueError("compare_ordinals is required for ordinal order")
        numbers = ordinal_sorted_numbers(numbers, encoder.ordinal, compare_ordinals)
    elif order != "number":
        raise ValueError("order must be 'number' or 'ordinal'")
    return build_document(numbers, encoder.ordinal_latex)
