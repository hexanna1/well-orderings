"""Cantor normal-form ordinal term model and prime-index encoder."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cmp_to_key, lru_cache
from typing import Iterable

from latex_document import build_document
from prime_index import PrimeIndexHelper


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


Term = tuple["Ordinal", int]  # (exponent, coefficient)


@dataclass(frozen=True)
class Ordinal:
    # Cantor normal form: strictly decreasing omega-exponents with natural coefficients.
    terms: tuple[Term, ...]

    def __post_init__(self) -> None:
        normalized = type(self)._from_normal_form_terms(self.terms)
        if normalized.terms != self.terms:
            raise ValueError("terms must be canonical Cantor normal form; use Ordinal.from_terms")

    @classmethod
    def _unchecked(cls, terms: tuple[Term, ...]) -> Ordinal:
        obj = object.__new__(cls)
        object.__setattr__(obj, "terms", terms)
        return obj

    @classmethod
    def zero(cls) -> Ordinal:
        return cls._unchecked(())

    def is_zero(self) -> bool:
        return not self.terms

    def is_one(self) -> bool:
        return self == ONE

    @classmethod
    def from_terms(cls, terms: Iterable[Term]) -> Ordinal:
        return cls._from_normal_form_terms(terms)

    @classmethod
    def _from_normal_form_terms(cls, terms: Iterable[Term]) -> Ordinal:
        counts: dict[Ordinal, int] = {}
        for exponent, coeff in terms:
            _require_int_at_least(coeff, 1, "coeff")
            exponent = _canonicalize_ordinal(exponent)
            counts[exponent] = counts.get(exponent, 0) + coeff
        return cls._from_counts(counts)

    @classmethod
    def _from_counts(cls, counts: dict[Ordinal, int]) -> Ordinal:
        exponents = [exponent for exponent, coeff in counts.items() if coeff]
        if not exponents:
            return cls.zero()
        exponents.sort(key=cmp_to_key(_cmp_ordinal), reverse=True)
        return cls._unchecked(tuple((exponent, counts[exponent]) for exponent in exponents))

    def to_latex(self) -> str:
        if self.is_zero():
            return "0"
        return "+".join(_term_to_latex(exponent, coeff) for exponent, coeff in self.terms)


ZERO = Ordinal.zero()
ONE = Ordinal._unchecked(((ZERO, 1),))


def _with_coeff_latex(rendered: str, coeff: int) -> str:
    if coeff < 1:
        raise ValueError("coeff must be >= 1")
    if coeff == 1:
        return rendered
    return f"{rendered}{coeff}"


def _term_to_latex(exponent: Ordinal, coeff: int) -> str:
    if exponent.is_zero():
        return str(coeff)
    if exponent.is_one():
        return _with_coeff_latex("\\omega", coeff)
    return _with_coeff_latex(f"\\omega^{{{exponent.to_latex()}}}", coeff)


def _cmp_ordinal(a: Ordinal, b: Ordinal) -> int:
    if a == b:
        return 0
    if a.is_zero():
        return -1
    if b.is_zero():
        return 1

    ia = 0
    ib = 0
    while True:
        if ia >= len(a.terms) and ib >= len(b.terms):
            return 0
        if ia >= len(a.terms):
            return -1
        if ib >= len(b.terms):
            return 1

        a_exponent, a_coeff = a.terms[ia]
        b_exponent, b_coeff = b.terms[ib]

        exponent_cmp = _cmp_ordinal(a_exponent, b_exponent)
        if exponent_cmp != 0:
            return exponent_cmp

        if a_coeff != b_coeff:
            return -1 if a_coeff < b_coeff else 1

        ia += 1
        ib += 1


@lru_cache(maxsize=None)
def _canonicalize_ordinal(ordinal: Ordinal) -> Ordinal:
    if ordinal.is_zero():
        return ZERO
    return Ordinal._from_normal_form_terms(ordinal.terms)


class CantorOrdinalEncoder:
    def __init__(self) -> None:
        self.prime_helper = PrimeIndexHelper()

    def factorize(self, n: int) -> list[tuple[int, int]]:
        return self.prime_helper.factorize(n)

    def prime_index(self, p: int) -> int:
        return self.prime_helper.prime_index(p)

    def prime_index_ordinal(self, index: int) -> Ordinal:
        _require_int_at_least(index, 1, "index")
        return Ordinal.from_terms([(self.ordinal(index), 1)])

    def prime_index_ordinal_latex(self, index: int) -> str:
        return self.prime_index_ordinal(index).to_latex()

    def ordinal(self, n: int) -> Ordinal:
        terms: list[Term] = []
        for prime, coeff in self.factorize(n):
            exponent = self.ordinal(self.prime_index(prime))
            terms.append((exponent, coeff))
        return Ordinal._from_normal_form_terms(terms)

    def ordinal_latex(self, n: int) -> str:
        return self.ordinal(n).to_latex()

    def natural(self, ordinal: Ordinal) -> int:
        ordinal = _canonicalize_ordinal(ordinal)
        n = 1
        for exponent, coeff in ordinal.terms:
            index = self.natural(exponent)
            n *= self.prime_helper.prime_at_index(index) ** coeff
        return n


def build_prime_latex_document(n: int, encoder: CantorOrdinalEncoder) -> str:
    return build_document(encoder.prime_helper.primes_up_to(n), encoder.ordinal_latex)
