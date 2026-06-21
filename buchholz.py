"""Buchholz ordinal term model and prime-index encoder."""

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
    # Buchholz principal term psi_level(arg), with any finite level.
    level: int
    arg: Ordinal

    def __post_init__(self) -> None:
        _require_int_at_least(self.level, 0, "level")


Term = tuple[Principal, int]


@dataclass(frozen=True)
class Ordinal:
    # Structurally canonical finite descending sum of Buchholz principal terms.
    #
    # This class deliberately represents both legal and raw terms. Use
    # `Ordinal.from_legal_terms` when Buchholz normal-form legality is required.
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
            raise ValueError("ordinal is not in Buchholz normal form")
        return ordinal

    def is_zero(self) -> bool:
        return not self.terms

    def is_one(self) -> bool:
        return self == ONE

    def to_latex(self) -> str:
        if self.is_zero():
            return "0"

        parts: list[str] = []
        for principal, coeff in self.terms:
            parts.append(_term_to_latex(principal, coeff))
        return "+".join(parts)


ZERO = Ordinal.zero()
PSI0_ZERO = Principal(0, ZERO)
PSI1_ZERO = Principal(1, ZERO)
ONE = Ordinal._unchecked(((PSI0_ZERO, 1),))
OMEGA = Ordinal._unchecked(((PSI1_ZERO, 1),))


def _normalize_terms(terms: tuple[Term, ...]) -> tuple[Term, ...]:
    counts: dict[Principal, int] = {}
    for principal, coeff in terms:
        _require_int_at_least(coeff, 0, "coeff")
        if coeff == 0:
            continue
        _require_int_at_least(principal.level, 0, "level")
        counts[principal] = counts.get(principal, 0) + coeff

    principals = [principal for principal, coeff in counts.items() if coeff]
    principals.sort(key=cmp_to_key(_cmp_principal), reverse=True)
    return tuple((principal, counts[principal]) for principal in principals)


def _is_principal_one(principal: Principal) -> bool:
    return principal.level == 0 and principal.arg.is_zero()


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


@lru_cache(maxsize=262144)
def _uses_level(ordinal: Ordinal, level: int) -> bool:
    return any(principal.level == level or _uses_level(principal.arg, level) for principal, _ in ordinal.terms)


@lru_cache(maxsize=262144)
def _is_below_epsilon0(ordinal: Ordinal) -> bool:
    return all(principal.level == 0 and _is_below_epsilon0(principal.arg) for principal, _ in ordinal.terms)


def _is_pure_above_level(ordinal: Ordinal, level: int) -> bool:
    return bool(ordinal.terms) and all(principal.level > level for principal, _ in ordinal.terms)


def _is_epsilon_number(ordinal: Ordinal) -> bool:
    if len(ordinal.terms) != 1:
        return False
    principal, coeff = ordinal.terms[0]
    return coeff == 1 and _is_pure_above_level(principal.arg, principal.level)


def _omega_power_latex(exponent: Ordinal) -> str:
    return _raw_omega_power_latex(exponent)


def _raw_omega_power_latex(exponent: Ordinal) -> str:
    if exponent.is_zero():
        return "1"
    if exponent.is_one():
        return "\\omega"
    return f"\\omega^{{{exponent.to_latex()}}}"


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


def _one_plus_rendered_ordinal(ordinal: RenderedOrdinal) -> RenderedOrdinal:
    if ordinal.finite_nat is not None:
        return RenderedOrdinal.finite(ordinal.finite_nat + 1)
    return ordinal


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


def _decompose_same_base_multiple(ordinal: Ordinal, base_level: int) -> tuple[RenderedOrdinal, Ordinal] | None:
    quotient_parts: list[RenderedOrdinal] = []
    tail_terms: list[Term] = []

    for principal, coeff in ordinal.terms:
        if principal.level > base_level:
            return None
        if principal.level == base_level:
            quotient = _omega_power_for_same_base(principal.arg, base_level)
            if quotient is None:
                return None
            quotient_parts.append(_with_rendered_coeff(quotient, coeff))
        else:
            tail_terms.append((principal, coeff))

    return _sum_rendered_ordinal(quotient_parts), Ordinal.raw_from_terms(tail_terms)


def _with_rendered_coeff(rendered: RenderedOrdinal, coeff: int) -> RenderedOrdinal:
    if coeff < 1:
        raise ValueError("coeff must be >= 1")
    if rendered.finite_nat is not None:
        return RenderedOrdinal.finite(rendered.finite_nat * coeff)
    if coeff == 1:
        return rendered
    return RenderedOrdinal(_with_coeff_latex(rendered.latex, coeff))


def _omega_power_rendered(exponent: Ordinal) -> RenderedOrdinal:
    if _is_epsilon_number(exponent):
        return RenderedOrdinal(exponent.to_latex())

    if exponent.is_zero() or _is_below_epsilon0(exponent):
        return RenderedOrdinal(_raw_omega_power_latex(exponent), 1 if exponent.is_zero() else None)

    leading_level = exponent.terms[0][0].level
    if leading_level == 0:
        return RenderedOrdinal(_raw_omega_power_latex(exponent))

    rendered = _omega_power_for_same_base(exponent, leading_level)
    if rendered is not None:
        return rendered
    return RenderedOrdinal(_raw_omega_power_latex(exponent))


def _omega_power_for_same_base(exponent: Ordinal, base_level: int) -> RenderedOrdinal | None:
    decomposed = _decompose_same_base_multiple(exponent, base_level)
    if decomposed is None:
        return None

    quotient, tail = decomposed
    return _base_monomial_rendered(_omega_level_latex(base_level), quotient, tail)


def _omega_expr_latex(ordinal: Ordinal) -> str:
    parts: list[str] = []

    for principal, coeff in ordinal.terms:
        if principal.level == 0:
            parts.append(_term_to_latex(principal, coeff))
        else:
            rendered = _principal_as_omega_expr_latex(principal)
            parts.append(_with_coeff_latex(rendered, coeff))

    return "+".join(parts) if parts else "0"


def _principal_as_omega_expr_latex(principal: Principal) -> str:
    if principal.level == 0:
        return _term_to_latex(principal, 1)

    rendered = _same_base_psi_as_omega_latex(principal.level, principal.arg)
    if rendered is not None:
        return rendered
    return _principal_raw_latex(principal)


def _same_base_psi_as_omega_latex(level: int, arg: Ordinal) -> str | None:
    decomposed = _decompose_same_base_multiple(arg, level)
    if decomposed is None:
        return None

    quotient, tail = decomposed
    exponent = _one_plus_rendered_ordinal(quotient)
    return _base_monomial_rendered(_omega_level_latex(level), exponent, tail).latex


def _level_to_latex(level: int) -> str:
    if level < 0:
        raise ValueError("level must be >= 0")
    return str(level)


def _omega_level_latex(level: int) -> str:
    if level < 1:
        raise ValueError("level must be >= 1")
    if level == 1:
        return "\\Omega"
    return f"\\Omega_{{{level}}}"


def _principal_to_latex(principal: Principal) -> str:
    if principal.level == 0:
        if _is_below_epsilon0(principal.arg):
            return _omega_power_latex(principal.arg)

        rendered_arg = _omega_expr_latex(principal.arg)
        return f"\\psi_{{0}}({rendered_arg})"

    rendered = _same_base_psi_as_omega_latex(principal.level, principal.arg)
    if rendered is not None:
        return rendered

    return _principal_raw_latex(principal)


def _principal_raw_latex(principal: Principal) -> str:
    if principal.arg.is_zero():
        return _omega_level_latex(principal.level)
    return f"\\psi_{{{_level_to_latex(principal.level)}}}({principal.arg.to_latex()})"


def _cmp_principal(a: Principal, b: Principal) -> int:
    if a == b:
        return 0
    if a.level != b.level:
        return -1 if a.level < b.level else 1
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


@lru_cache(maxsize=262144, typed=True)
def support(level: int, ordinal: Ordinal) -> frozenset[Ordinal]:
    _require_int_at_least(level, 0, "level")

    result: set[Ordinal] = set()
    for principal, _ in ordinal.terms:
        result.update(_support_principal(level, principal))
    return frozenset(result)


def _support_principal(level: int, principal: Principal) -> frozenset[Ordinal]:
    if level <= principal.level:
        return frozenset({principal.arg, *support(level, principal.arg)})
    return frozenset()


@lru_cache(maxsize=262144, typed=True)
def is_admissible(level: int, arg: Ordinal) -> bool:
    _require_int_at_least(level, 0, "level")
    if not is_legal(arg):
        return False
    return all(_cmp_ordinal(guarded, arg) < 0 for guarded in support(level, arg))


@lru_cache(maxsize=262144)
def is_legal(ordinal: Ordinal) -> bool:
    return all(is_admissible(principal.level, principal.arg) for principal, _ in ordinal.terms)


class AdmissibleIndex:
    def __init__(self, encoder: BuchholzOrdinalEncoder, level: int) -> None:
        _require_int_at_least(level, 0, "level")
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

    def stats(self) -> dict[str, int]:
        return {
            "level": self.level,
            "count": len(self.admissible_terms),
            "next_raw_scan": self.next_raw_scan,
            "last_raw_code": self.admissible_raw_codes[-1] if self.admissible_raw_codes else 0,
        }


class BuchholzOrdinalEncoder:
    def __init__(self) -> None:
        self.prime_helper = PrimeIndexHelper()
        if self.prime_helper.prime_index(2) != 1:
            raise RuntimeError("BuchholzOrdinalEncoder requires 1-based prime indices")
        self._raw_decode_cache: dict[int, Ordinal] = {}
        self._raw_code_cache: dict[Ordinal, int] = {}
        self._admissible_indexes: dict[int, AdmissibleIndex] = {}

    def factorize(self, n: int) -> list[tuple[int, int]]:
        return self.prime_helper.factorize(n)

    def prime_index(self, p: int) -> int:
        return self.prime_helper.prime_index(p)

    def prime_at_index(self, index: int) -> int:
        return self.prime_helper.prime_at_index(index)

    def _admissible_index(self, level: int) -> AdmissibleIndex:
        _require_int_at_least(level, 0, "level")
        index = self._admissible_indexes.get(level)
        if index is None:
            index = AdmissibleIndex(self, level)
            self._admissible_indexes[level] = index
        return index

    def _unpack_source_index(self, source_index: int) -> tuple[int, int]:
        _require_int_at_least(source_index, 1, "source_index")

        level = 0
        odd_part = source_index
        while odd_part % 2 == 0:
            odd_part //= 2
            level += 1
        return level, (odd_part + 1) // 2

    def _pack_source_index(self, level: int, child_code: int) -> int:
        _require_int_at_least(level, 0, "level")
        _require_int_at_least(child_code, 1, "child_code")
        return (2**level) * (2 * child_code - 1)

    def raw_decode(self, n: int) -> Ordinal:
        _require_int_at_least(n, 1, "n")

        cached = self._raw_decode_cache.get(n)
        if cached is not None:
            return cached

        terms: list[Term] = []
        for prime, exp in self.factorize(n):
            source_index = self.prime_index(prime)
            level, child_code = self._unpack_source_index(source_index)
            terms.append((Principal(level, self.raw_decode(child_code)), exp))
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
            child_code = self.raw_code(principal.arg)
            source_index = self._pack_source_index(principal.level, child_code)
            n *= self.prime_at_index(source_index) ** coeff
        self._raw_code_cache[ordinal] = n
        self._raw_decode_cache.setdefault(n, ordinal)
        return n

    def admissible_rank(self, level: int, arg: Ordinal) -> int:
        return self._admissible_index(level).rank(arg)

    def admissible_unrank(self, level: int, rank: int) -> Ordinal:
        return self._admissible_index(level).unrank(rank)

    def ensure_unranked(self, level: int, rank: int) -> None:
        self._admissible_index(level).ensure_unranked(rank)

    def argument_code(self, ordinal: Ordinal) -> int:
        if not is_legal(ordinal):
            raise ValueError("ordinal is not in Buchholz normal form")

        n = 1
        for principal, coeff in ordinal.terms:
            rank = self.admissible_rank(principal.level, principal.arg)
            source_index = self._pack_source_index(principal.level, rank)
            n *= self.prime_at_index(source_index) ** coeff
        return n

    def argument_decode(self, n: int) -> Ordinal:
        _require_int_at_least(n, 1, "n")

        terms: list[Term] = []
        for prime, exp in self.factorize(n):
            source_index = self.prime_index(prime)
            level, rank = self._unpack_source_index(source_index)
            terms.append((Principal(level, self.admissible_unrank(level, rank)), exp))
        return Ordinal.from_legal_terms(terms)

    def is_buchholz_ordinal(self, ordinal: Ordinal) -> bool:
        return is_legal(ordinal) and all(principal.level == 0 for principal, _ in ordinal.terms)

    def buchholz_encode(self, ordinal: Ordinal) -> int:
        ordinal = Ordinal.raw_from_terms(ordinal.terms)
        if not self.is_buchholz_ordinal(ordinal):
            raise ValueError("ordinal is not a Buchholz ordinal below psi_0(Omega_omega)")

        n = 1
        for principal, coeff in ordinal.terms:
            rank = self.admissible_rank(0, principal.arg)
            n *= self.prime_at_index(rank) ** coeff
        return n

    def buchholz_decode(self, n: int) -> Ordinal:
        _require_int_at_least(n, 1, "n")

        terms: list[Term] = []
        for prime, exp in self.factorize(n):
            rank = self.prime_index(prime)
            terms.append((Principal(0, self.admissible_unrank(0, rank)), exp))
        return Ordinal.from_legal_terms(terms)

    def positive_int_to_buchholz(self, n: int) -> Ordinal:
        """Decode the project-wide positive-integer convention: 1 maps to 0."""
        return self.buchholz_decode(n)

    def buchholz_to_positive_int(self, ordinal: Ordinal) -> int:
        """Encode using the project-wide positive-integer convention."""
        return self.buchholz_encode(ordinal)

    def nat_to_buchholz(self, n: int) -> Ordinal:
        """Decode the zero-based natural-number convention: 0 maps to 0."""
        _require_int_at_least(n, 0, "n")
        return self.buchholz_decode(n + 1)

    def buchholz_to_nat(self, ordinal: Ordinal) -> int:
        """Encode using the zero-based natural-number convention."""
        return self.buchholz_encode(ordinal) - 1

    def ordinal(self, n: int) -> Ordinal:
        return self.positive_int_to_buchholz(n)

    def ordinal_latex(self, n: int) -> str:
        return self.ordinal(n).to_latex()

    def natural(self, ordinal: Ordinal) -> int:
        return self.buchholz_to_positive_int(ordinal)

    def buchholz_less_nat(self, m: int, n: int) -> bool:
        return _cmp_ordinal(self.nat_to_buchholz(m), self.nat_to_buchholz(n)) < 0

    def prime_index_ordinal(self, index: int) -> Ordinal:
        _require_int_at_least(index, 1, "index")
        return Ordinal.from_legal_terms([(Principal(0, self.admissible_unrank(0, index)), 1)])

    def prime_index_ordinal_latex(self, index: int) -> str:
        return self.prime_index_ordinal(index).to_latex()

    def prepare_prime_table(self, limit: int) -> None:
        qmax = len(self.prime_helper.primes_up_to(limit))
        if qmax:
            self.ensure_unranked(0, qmax)

    def admissible_index_stats(self, level: int) -> dict[str, int]:
        return self._admissible_index(level).stats()


def build_prime_latex_document(n: int, encoder: BuchholzOrdinalEncoder) -> str:
    return build_document(encoder.prime_helper.primes_up_to(n), encoder.ordinal_latex)
