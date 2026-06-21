"""
EBOCF term model and encoder.

This module provides the recursive term model, structural comparison, Buchholz
G-support guards, legality checks, symbolic rendering, and total prime-index
codings for EBOCF.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cmp_to_key, lru_cache
from typing import Iterable

from latex_document import build_document
from prime_index import PrimeIndexHelper


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


@dataclass(frozen=True)
class Principal:
    # EBOCF principal term psi_level(arg). The level is itself an
    # ordinal term, so this covers finite levels, omega, and ordinal-valued levels.
    level: Ordinal
    arg: Ordinal


Term = tuple[Principal, int]


@dataclass(frozen=True)
class Ordinal:
    # Structurally canonical finite descending sum of EBOCF principal terms.
    #
    # This class can represent raw structural terms as well as legal EBOCF terms.
    # Use `Ordinal.from_legal_terms` when the Buchholz guard condition is required.
    terms: tuple[Term, ...]

    def __post_init__(self) -> None:
        normalized = _normalize_terms(self.terms)
        if normalized != self.terms:
            raise ValueError("terms must be structurally canonical; use Ordinal.raw_from_terms")

    @classmethod
    def _unchecked(cls, terms: tuple[Term, ...]) -> Ordinal:
        obj = object.__new__(cls)
        object.__setattr__(obj, "terms", terms)
        return obj

    @classmethod
    def zero(cls) -> Ordinal:
        return cls._unchecked(())

    @classmethod
    def raw_from_terms(cls, terms: Iterable[Term]) -> Ordinal:
        return cls._unchecked(_normalize_terms(tuple(terms)))

    @classmethod
    def from_legal_terms(cls, terms: Iterable[Term]) -> Ordinal:
        ordinal = cls.raw_from_terms(terms)
        if not is_legal(ordinal):
            raise ValueError("ordinal is not in EBOCF normal form")
        return ordinal

    def is_zero(self) -> bool:
        return not self.terms

    def is_one(self) -> bool:
        return self == ONE

    def to_latex(self) -> str:
        if self.is_zero():
            return "0"
        return "+".join(_term_to_latex(principal, coeff) for principal, coeff in self.terms)


ZERO = Ordinal.zero()
PSI0_ZERO = Principal(ZERO, ZERO)
ONE = Ordinal._unchecked(((PSI0_ZERO, 1),))
PSI1_ZERO = Principal(ONE, ZERO)
OMEGA = Ordinal._unchecked(((PSI1_ZERO, 1),))


@lru_cache(maxsize=None)
def finite(n: int) -> Ordinal:
    _require_int_at_least(n, 0, "n")
    if n == 0:
        return ZERO
    return Ordinal._unchecked(((PSI0_ZERO, n),))


TWO = finite(2)
PSI2_ZERO = Principal(TWO, ZERO)
OMEGA_2 = Ordinal._unchecked(((PSI2_ZERO, 1),))


def principal(level: Ordinal, arg: Ordinal) -> Principal:
    return Principal(level, arg)


def raw_psi(level: Ordinal, arg: Ordinal, coeff: int = 1) -> Ordinal:
    return Ordinal.raw_from_terms([(Principal(level, arg), coeff)])


def psi(level: Ordinal, arg: Ordinal, coeff: int = 1) -> Ordinal:
    return Ordinal.from_legal_terms([(Principal(level, arg), coeff)])


def psi_n(level: int, arg: Ordinal, coeff: int = 1) -> Ordinal:
    return psi(finite(level), arg, coeff)


def _normalize_terms(terms: tuple[Term, ...]) -> tuple[Term, ...]:
    counts: dict[Principal, int] = {}
    for principal, coeff in terms:
        _require_int_at_least(coeff, 0, "coeff")
        if coeff == 0:
            continue
        counts[principal] = counts.get(principal, 0) + coeff

    principals = [principal for principal, coeff in counts.items() if coeff]
    principals.sort(key=cmp_to_key(_cmp_principal), reverse=True)
    return tuple((principal, counts[principal]) for principal in principals)


def _is_principal_one(principal: Principal) -> bool:
    return principal.level.is_zero() and principal.arg.is_zero()


def _with_coeff_latex(rendered: str, coeff: int) -> str:
    if coeff < 1:
        raise ValueError("coeff must be >= 1")
    if coeff == 1:
        return rendered
    return f"{rendered}{coeff}"


def _term_to_latex(principal: Principal, coeff: int) -> str:
    if _is_principal_one(principal):
        return str(coeff)
    return _with_coeff_latex(_principal_to_latex(principal), coeff)


def _principal_to_latex(principal: Principal) -> str:
    if principal.level.is_zero():
        if _is_below_epsilon0(principal.arg):
            return _omega_power_latex(principal.arg)

        rendered_arg = _omega_expr_latex(principal.arg)
        return f"\\psi_{{0}}({rendered_arg})"

    rendered = _same_base_psi_as_omega_latex(principal.level, principal.arg)
    if rendered is not None:
        return rendered

    return _principal_raw_latex(principal)


def _level_to_latex(level: Ordinal) -> str:
    finite = as_finite_nat(level)
    if finite is not None:
        return str(finite)
    return level.to_latex()


def _omega_level_latex(level: Ordinal) -> str:
    finite = as_finite_nat(level)
    if finite == 0:
        return "1"
    if finite == 1:
        return "\\Omega"
    if finite is not None:
        return f"\\Omega_{{{finite}}}"
    return f"\\Omega_{{{level.to_latex()}}}"


def as_finite_nat(ordinal: Ordinal) -> int | None:
    if ordinal.is_zero():
        return 0
    if len(ordinal.terms) != 1:
        return None
    principal, coeff = ordinal.terms[0]
    if not _is_principal_one(principal):
        return None
    return coeff


@lru_cache(maxsize=262144)
def _uses_level_at_least(ordinal: Ordinal, threshold: Ordinal) -> bool:
    for principal, _ in ordinal.terms:
        if _cmp_ordinal(principal.level, threshold) >= 0:
            return True
        if _uses_level_at_least(principal.level, threshold):
            return True
        if _uses_level_at_least(principal.arg, threshold):
            return True
    return False


@lru_cache(maxsize=262144)
def _is_below_epsilon0(ordinal: Ordinal) -> bool:
    return not _uses_level_at_least(ordinal, ONE)


def _is_pure_above_level(ordinal: Ordinal, level: Ordinal) -> bool:
    return bool(ordinal.terms) and all(_cmp_ordinal(principal.level, level) > 0 for principal, _ in ordinal.terms)


def _is_epsilon_number(ordinal: Ordinal) -> bool:
    if len(ordinal.terms) != 1:
        return False
    principal, coeff = ordinal.terms[0]
    return coeff == 1 and _is_pure_above_level(principal.arg, principal.level)


def _omega_power_latex(exponent: Ordinal) -> str:
    return _raw_omega_power_latex(exponent)


@dataclass(frozen=True)
class RenderedOrdinal:
    latex: str
    finite_nat: int | None = None

    @classmethod
    def finite(cls, n: int) -> RenderedOrdinal:
        if n < 0:
            raise ValueError("n must be >= 0")
        return cls(str(n), n)

    def is_zero(self) -> bool:
        return self.finite_nat == 0

    def is_one(self) -> bool:
        return self.finite_nat == 1


def _sum_rendered_ordinal(parts: Iterable[RenderedOrdinal]) -> RenderedOrdinal:
    filtered = [part for part in parts if not part.is_zero()]
    if not filtered:
        return RenderedOrdinal.finite(0)

    finite_total = 0
    nonfinite_parts: list[str] = []
    all_finite = True
    for part in filtered:
        if part.finite_nat is None:
            all_finite = False
            nonfinite_parts.append(part.latex)
        else:
            finite_total += part.finite_nat

    if all_finite:
        return RenderedOrdinal.finite(finite_total)
    if finite_total:
        nonfinite_parts.append(str(finite_total))
    return RenderedOrdinal("+".join(nonfinite_parts))


def _with_rendered_coeff(rendered: RenderedOrdinal, coeff: int) -> RenderedOrdinal:
    if coeff < 1:
        raise ValueError("coeff must be >= 1")
    if rendered.finite_nat is not None:
        return RenderedOrdinal.finite(rendered.finite_nat * coeff)
    if coeff == 1:
        return rendered
    return RenderedOrdinal(_with_coeff_latex(rendered.latex, coeff))


def _one_plus_rendered_ordinal(ordinal: RenderedOrdinal) -> RenderedOrdinal:
    if ordinal.finite_nat is not None:
        return RenderedOrdinal.finite(ordinal.finite_nat + 1)
    return ordinal


def _raw_omega_power_latex(exponent: Ordinal) -> str:
    if exponent.is_zero():
        return "1"
    if exponent.is_one():
        return "\\omega"
    return f"\\omega^{{{exponent.to_latex()}}}"


def _base_power_latex(base_latex: str, exponent: RenderedOrdinal) -> str:
    if exponent.is_zero():
        return "1"
    if exponent.finite_nat == 1:
        return base_latex
    return f"{base_latex}^{{{exponent.latex}}}"


def _base_monomial_rendered(base_latex: str, exponent: RenderedOrdinal, omega_tail: Ordinal) -> RenderedOrdinal:
    head = _base_power_latex(base_latex, exponent)
    tail = _omega_power_rendered(omega_tail)
    if head == "1":
        return tail
    if tail.is_one():
        return RenderedOrdinal(head)
    return RenderedOrdinal(f"{head}{tail.latex}")


def _decompose_same_base_multiple(ordinal: Ordinal, base_level: Ordinal) -> tuple[RenderedOrdinal, Ordinal] | None:
    quotient_parts: list[RenderedOrdinal] = []
    tail_terms: list[Term] = []

    for principal, coeff in ordinal.terms:
        level_cmp = _cmp_ordinal(principal.level, base_level)
        if level_cmp > 0:
            return None
        if level_cmp == 0:
            quotient = _omega_power_for_same_base(principal.arg, base_level)
            if quotient is None:
                return None
            quotient_parts.append(_with_rendered_coeff(quotient, coeff))
        else:
            tail_terms.append((principal, coeff))

    return _sum_rendered_ordinal(quotient_parts), Ordinal.raw_from_terms(tail_terms)


def _omega_power_for_same_base(exponent: Ordinal, base_level: Ordinal) -> RenderedOrdinal | None:
    decomposed = _decompose_same_base_multiple(exponent, base_level)
    if decomposed is None:
        return None

    quotient, tail = decomposed
    return _base_monomial_rendered(_omega_level_latex(base_level), quotient, tail)


def _omega_power_rendered(exponent: Ordinal) -> RenderedOrdinal:
    if _is_epsilon_number(exponent):
        return RenderedOrdinal(exponent.to_latex())

    if exponent.is_zero() or _is_below_epsilon0(exponent):
        return RenderedOrdinal(_raw_omega_power_latex(exponent), 1 if exponent.is_zero() else None)

    leading_level = exponent.terms[0][0].level
    if leading_level.is_zero():
        return RenderedOrdinal(_raw_omega_power_latex(exponent))

    rendered = _omega_power_for_same_base(exponent, leading_level)
    if rendered is not None:
        return rendered
    return RenderedOrdinal(_raw_omega_power_latex(exponent))


def _omega_expr_latex(ordinal: Ordinal) -> str:
    parts: list[str] = []

    for principal, coeff in ordinal.terms:
        if principal.level.is_zero():
            parts.append(_term_to_latex(principal, coeff))
        else:
            rendered = _principal_as_omega_expr_latex(principal)
            parts.append(_with_coeff_latex(rendered, coeff))

    return "+".join(parts) if parts else "0"


def _principal_as_omega_expr_latex(principal: Principal) -> str:
    if principal.level.is_zero():
        return _term_to_latex(principal, 1)
    rendered = _same_base_psi_as_omega_latex(principal.level, principal.arg)
    if rendered is not None:
        return rendered
    return _principal_raw_latex(principal)


def _same_base_psi_as_omega_latex(level: Ordinal, arg: Ordinal) -> str | None:
    if level.is_zero():
        return None

    decomposed = _decompose_same_base_multiple(arg, level)
    if decomposed is None:
        return None

    quotient, tail = decomposed
    exponent = _one_plus_rendered_ordinal(quotient)
    return _base_monomial_rendered(_omega_level_latex(level), exponent, tail).latex


def _principal_raw_latex(principal: Principal) -> str:
    if principal.arg.is_zero():
        return _omega_level_latex(principal.level)
    return f"\\psi_{{{_level_to_latex(principal.level)}}}({principal.arg.to_latex()})"


def _cmp_principal(a: Principal, b: Principal) -> int:
    if a == b:
        return 0

    level_cmp = _cmp_ordinal(a.level, b.level)
    if level_cmp != 0:
        return level_cmp
    return _cmp_ordinal(a.arg, b.arg)


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

        a_principal, a_coeff = a.terms[ia]
        b_principal, b_coeff = b.terms[ib]

        head_cmp = _cmp_principal(a_principal, b_principal)
        if head_cmp != 0:
            return head_cmp

        if a_coeff != b_coeff:
            return -1 if a_coeff < b_coeff else 1

        ia += 1
        ib += 1


@lru_cache(maxsize=262144)
def support(level: Ordinal, ordinal: Ordinal) -> frozenset[Ordinal]:
    result: set[Ordinal] = set()
    for principal, _ in ordinal.terms:
        result.update(_support_principal(level, principal))
    return frozenset(result)


def _support_principal(level: Ordinal, principal: Principal) -> frozenset[Ordinal]:
    if _cmp_ordinal(principal.level, level) < 0:
        return frozenset()
    return frozenset({principal.arg, *support(level, principal.level), *support(level, principal.arg)})


@lru_cache(maxsize=262144)
def is_admissible(level: Ordinal, arg: Ordinal) -> bool:
    if not is_legal(level):
        return False
    if not is_legal(arg):
        return False
    return all(_cmp_ordinal(guarded, arg) < 0 for guarded in support(level, arg))


@lru_cache(maxsize=262144)
def is_legal_principal(principal: Principal) -> bool:
    return is_legal(principal.level) and is_admissible(principal.level, principal.arg)


@lru_cache(maxsize=262144)
def is_legal(ordinal: Ordinal) -> bool:
    return all(is_legal_principal(principal) for principal, _ in ordinal.terms)


class AdmissibleIndex:
    def __init__(self, encoder: EBOCFOrdinalEncoder, level: Ordinal) -> None:
        if not is_legal(level):
            raise ValueError("level must be a legal EBOCF ordinal")
        self.encoder = encoder
        self.level = level
        self.admissible_terms: list[Ordinal] = []
        self.admissible_raw_codes: list[int] = []
        self.next_raw_scan = 1
        self.rank_cache: dict[Ordinal, int] = {}

    def ensure_unranked(self, k: int) -> None:
        _require_int_at_least(k, 1, "rank")
        while len(self.admissible_terms) < k:
            self._scan_next()

    def ensure_scanned_through(self, raw_code: int) -> None:
        _require_int_at_least(raw_code, 1, "raw_code")
        while self.next_raw_scan <= raw_code:
            self._scan_next()

    def unrank(self, k: int) -> Ordinal:
        self.ensure_unranked(k)
        return self.admissible_terms[k - 1]

    def rank(self, arg: Ordinal) -> int:
        cached = self.rank_cache.get(arg)
        if cached is not None:
            return cached

        if not is_admissible(self.level, arg):
            raise ValueError("argument is not admissible at this level")

        target_raw = self.encoder.raw_code(arg)
        self.ensure_scanned_through(target_raw)

        cached = self.rank_cache.get(arg)
        if cached is None:
            raise ValueError("argument is not admissible at this level")
        return cached

    def _scan_next(self) -> None:
        raw_code = self.next_raw_scan
        self.next_raw_scan += 1

        ordinal = self.encoder.raw_decode(raw_code)
        if not is_admissible(self.level, ordinal):
            return

        rank = len(self.admissible_terms) + 1
        self.admissible_terms.append(ordinal)
        self.admissible_raw_codes.append(raw_code)
        self.rank_cache[ordinal] = rank

    def stats(self) -> dict[str, int | str]:
        return {
            "level": self.level.to_latex(),
            "count": len(self.admissible_terms),
            "next_raw_scan": self.next_raw_scan,
            "last_raw_code": self.admissible_raw_codes[-1] if self.admissible_raw_codes else 0,
        }


class EBOCFOrdinalEncoder:
    def __init__(self) -> None:
        self.prime_helper = PrimeIndexHelper()
        if self.prime_helper.prime_index(2) != 1:
            raise RuntimeError("EBOCFOrdinalEncoder requires 1-based prime indices")
        self._raw_decode_cache: dict[int, Ordinal] = {}
        self._raw_code_cache: dict[Ordinal, int] = {}
        self._argument_decode_cache: dict[int, Ordinal] = {}
        self._argument_code_cache: dict[Ordinal, int] = {}
        self._admissible_indexes: dict[Ordinal, AdmissibleIndex] = {}

    def factorize(self, n: int) -> list[tuple[int, int]]:
        return self.prime_helper.factorize(n)

    def prime_index(self, p: int) -> int:
        return self.prime_helper.prime_index(p)

    def prime_at_index(self, index: int) -> int:
        return self.prime_helper.prime_at_index(index)

    def _pack_source_index(self, level_code: int, arg_code: int) -> int:
        _require_int_at_least(level_code, 1, "level_code")
        _require_int_at_least(arg_code, 1, "arg_code")

        source_index = 1
        for prime, exp in self.factorize(level_code):
            source_index *= self.prime_at_index(2 * self.prime_index(prime) - 1) ** exp
        for prime, exp in self.factorize(arg_code):
            source_index *= self.prime_at_index(2 * self.prime_index(prime)) ** exp
        return source_index

    def _unpack_source_index(self, source_index: int) -> tuple[int, int]:
        _require_int_at_least(source_index, 1, "source_index")

        level_code = 1
        arg_code = 1
        for prime, exp in self.factorize(source_index):
            index = self.prime_index(prime)
            if index % 2 == 1:
                level_code *= self.prime_at_index((index + 1) // 2) ** exp
            else:
                arg_code *= self.prime_at_index(index // 2) ** exp
        return level_code, arg_code

    def _admissible_index(self, level: Ordinal) -> AdmissibleIndex:
        if not is_legal(level):
            raise ValueError("level must be a legal EBOCF ordinal")

        index = self._admissible_indexes.get(level)
        if index is None:
            index = AdmissibleIndex(self, level)
            self._admissible_indexes[level] = index
        return index

    def raw_decode(self, n: int) -> Ordinal:
        _require_int_at_least(n, 1, "n")

        cached = self._raw_decode_cache.get(n)
        if cached is not None:
            return cached

        terms: list[Term] = []
        for prime, exp in self.factorize(n):
            source_index = self.prime_index(prime)
            level_code, arg_code = self._unpack_source_index(source_index)
            terms.append((Principal(self.raw_decode(level_code), self.raw_decode(arg_code)), exp))

        decoded = Ordinal.raw_from_terms(terms)
        self._raw_decode_cache[n] = decoded
        self._raw_code_cache.setdefault(decoded, n)
        return decoded

    def raw_code(self, ordinal: Ordinal) -> int:
        cached = self._raw_code_cache.get(ordinal)
        if cached is not None:
            return cached

        n = 1
        for principal, coeff in ordinal.terms:
            source_index = self._pack_source_index(self.raw_code(principal.level), self.raw_code(principal.arg))
            n *= self.prime_at_index(source_index) ** coeff
        self._raw_code_cache[ordinal] = n
        self._raw_decode_cache.setdefault(n, ordinal)
        return n

    def admissible_rank(self, level: Ordinal, arg: Ordinal) -> int:
        return self._admissible_index(level).rank(arg)

    def admissible_unrank(self, level: Ordinal, rank: int) -> Ordinal:
        return self._admissible_index(level).unrank(rank)

    def ensure_unranked(self, level: Ordinal, rank: int) -> None:
        self._admissible_index(level).ensure_unranked(rank)

    def argument_decode(self, n: int) -> Ordinal:
        _require_int_at_least(n, 1, "n")

        cached = self._argument_decode_cache.get(n)
        if cached is not None:
            return cached

        terms: list[Term] = []
        for prime, exp in self.factorize(n):
            source_index = self.prime_index(prime)
            level_code, arg_rank = self._unpack_source_index(source_index)
            level = self.argument_decode(level_code)
            terms.append((Principal(level, self.admissible_unrank(level, arg_rank)), exp))

        decoded = Ordinal.from_legal_terms(terms)
        self._argument_decode_cache[n] = decoded
        self._argument_code_cache.setdefault(decoded, n)
        return decoded

    def argument_code(self, ordinal: Ordinal) -> int:
        ordinal = Ordinal.raw_from_terms(ordinal.terms)
        if not is_legal(ordinal):
            raise ValueError("ordinal is not in EBOCF normal form")

        cached = self._argument_code_cache.get(ordinal)
        if cached is not None:
            return cached

        n = 1
        for principal, coeff in ordinal.terms:
            arg_rank = self.admissible_rank(principal.level, principal.arg)
            level_code = self.argument_code(principal.level)
            source_index = self._pack_source_index(level_code, arg_rank)
            n *= self.prime_at_index(source_index) ** coeff
        self._argument_code_cache[ordinal] = n
        self._argument_decode_cache.setdefault(n, ordinal)
        return n

    def is_ebocf_ordinal(self, ordinal: Ordinal) -> bool:
        return is_legal(ordinal) and all(principal.level.is_zero() for principal, _ in ordinal.terms)

    def ebocf_encode(self, ordinal: Ordinal) -> int:
        ordinal = Ordinal.raw_from_terms(ordinal.terms)
        if not self.is_ebocf_ordinal(ordinal):
            raise ValueError("ordinal is not a countable EBOCF ordinal")

        n = 1
        for principal, coeff in ordinal.terms:
            rank = self.admissible_rank(ZERO, principal.arg)
            n *= self.prime_at_index(rank) ** coeff
        return n

    def ebocf_decode(self, n: int) -> Ordinal:
        _require_int_at_least(n, 1, "n")

        terms: list[Term] = []
        for prime, exp in self.factorize(n):
            rank = self.prime_index(prime)
            terms.append((Principal(ZERO, self.admissible_unrank(ZERO, rank)), exp))
        return Ordinal.from_legal_terms(terms)

    def positive_int_to_ebocf(self, n: int) -> Ordinal:
        """Decode the project-wide positive-integer convention: 1 maps to 0."""
        return self.ebocf_decode(n)

    def ebocf_to_positive_int(self, ordinal: Ordinal) -> int:
        """Encode using the project-wide positive-integer convention."""
        return self.ebocf_encode(ordinal)

    def nat_to_ebocf(self, n: int) -> Ordinal:
        """Decode the zero-based natural-number convention: 0 maps to 0."""
        _require_int_at_least(n, 0, "n")
        return self.ebocf_decode(n + 1)

    def ebocf_to_nat(self, ordinal: Ordinal) -> int:
        """Encode using the zero-based natural-number convention."""
        return self.ebocf_encode(ordinal) - 1

    def ordinal(self, n: int) -> Ordinal:
        return self.positive_int_to_ebocf(n)

    def ordinal_latex(self, n: int) -> str:
        return self.ordinal(n).to_latex()

    def natural(self, ordinal: Ordinal) -> int:
        return self.ebocf_to_positive_int(ordinal)

    def ebocf_less_nat(self, m: int, n: int) -> bool:
        return _cmp_ordinal(self.nat_to_ebocf(m), self.nat_to_ebocf(n)) < 0

    def prime_index_ordinal(self, index: int) -> Ordinal:
        _require_int_at_least(index, 1, "index")
        return Ordinal.from_legal_terms([(Principal(ZERO, self.admissible_unrank(ZERO, index)), 1)])

    def prime_index_ordinal_latex(self, index: int) -> str:
        return self.prime_index_ordinal(index).to_latex()

    def prepare_prime_table(self, limit: int) -> None:
        qmax = len(self.prime_helper.primes_up_to(limit))
        if qmax:
            self.ensure_unranked(ZERO, qmax)

    def admissible_index_stats(self, level: Ordinal) -> dict[str, int | str]:
        return self._admissible_index(level).stats()


def build_prime_latex_document(n: int, encoder: EBOCFOrdinalEncoder) -> str:
    return build_document(encoder.prime_helper.primes_up_to(n), encoder.ordinal_latex)
