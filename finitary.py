"""
Hereditary prime-index encoder for the standard finitary Veblen normal form
below the small Veblen ordinal.

The normal-form theorem says that every nonzero ordinal below that limit has a
unique finite sum of descending finitary Veblen terms. The comparison and side
condition below follow the standard finite-string presentation, not the
set-coded finite-support presentation. See the "Finitely many variables" section
of:
https://en.wikipedia.org/wiki/Veblen_function

The encoder is bijective because unique prime factorization gives a finite
multiset of node indices, the 2-adic prime-index split bijects each node index
with finite raw argument codes, and the active-argument tail repair bijects raw
arguments onto the canonical arguments allowed by the normal form theorem.
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
class Veblen:
    # Finite Veblen argument vector. args[0] is the active/rightmost argument.
    args: tuple[Ordinal, ...]


Term = tuple[Veblen, int]


@dataclass(frozen=True)
class Ordinal:
    # Finitary Veblen normal form: strictly decreasing principal terms with coefficients.
    terms: tuple[Term, ...]

    def __post_init__(self) -> None:
        normalized = type(self)._from_normal_form_terms(self.terms)
        if normalized.terms != self.terms:
            raise ValueError("terms must be canonical finitary Veblen normal form; use Ordinal.from_terms")

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
        counts: dict[Veblen, int] = {}
        for veblen, coeff in terms:
            _require_int_at_least(coeff, 1, "coeff")
            veblen = _canonicalize_veblen(veblen)
            if not _is_preferred_veblen(veblen):
                raise ValueError("ordinal is not in preferred finitary Veblen normal form")
            counts[veblen] = counts.get(veblen, 0) + coeff
        return cls._from_counts(counts)

    @classmethod
    def _from_counts(cls, counts: dict[Veblen, int]) -> Ordinal:
        veblens = [veblen for veblen, coeff in counts.items() if coeff]
        if not veblens:
            return cls.zero()
        veblens.sort(key=cmp_to_key(_cmp_veblen), reverse=True)
        return cls._unchecked(tuple((veblen, counts[veblen]) for veblen in veblens))

    def to_latex(self) -> str:
        if self.is_zero():
            return "0"

        parts: list[str] = []
        for veblen, coeff in self.terms:
            if _is_veblen_one(veblen):
                parts.append(str(coeff))
                continue

            rendered = _veblen_to_latex(veblen)
            if coeff > 1:
                rendered = f"{rendered}{coeff}"
            parts.append(rendered)
        return "+".join(parts)


ZERO = Ordinal.zero()
VEBLEN_ONE = Veblen((ZERO,))
ONE = Ordinal._unchecked(((VEBLEN_ONE, 1),))


def _is_veblen_one(veblen: Veblen) -> bool:
    return len(veblen.args) == 1 and veblen.args[0].is_zero()


def _as_finite_nat(ordinal: Ordinal) -> int | None:
    if ordinal.is_zero():
        return 0
    if len(ordinal.terms) != 1:
        return None
    veblen, coeff = ordinal.terms[0]
    if not _is_veblen_one(veblen):
        return None
    return coeff


def _veblen_to_latex(veblen: Veblen) -> str:
    if len(veblen.args) == 3:
        gamma, beta, alpha = veblen.args
        if alpha.is_one() and beta.is_zero():
            return f"\\Gamma_{{{gamma.to_latex()}}}"

    if len(veblen.args) == 1:
        gamma = veblen.args[0]
        if gamma.is_zero():
            return "1"
        if gamma.is_one():
            return "\\omega"
        return f"\\omega^{{{gamma.to_latex()}}}"

    if len(veblen.args) == 2:
        gamma, beta = veblen.args
        beta_nat = _as_finite_nat(beta)
        if beta_nat == 0:
            return _veblen_to_latex(Veblen((gamma,)))
        if beta_nat == 1:
            return f"\\varepsilon_{{{gamma.to_latex()}}}"
        if beta_nat == 2:
            return f"\\zeta_{{{gamma.to_latex()}}}"
        return f"\\varphi_{{{beta.to_latex()}}}({gamma.to_latex()})"

    rendered_args = ",".join(arg.to_latex() for arg in reversed(veblen.args))
    return f"\\varphi({rendered_args})"


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

        a_veblen, a_coeff = a.terms[ia]
        b_veblen, b_coeff = b.terms[ib]

        head_cmp = _cmp_veblen(a_veblen, b_veblen)
        if head_cmp != 0:
            return head_cmp

        if a_coeff != b_coeff:
            return -1 if a_coeff < b_coeff else 1

        ia += 1
        ib += 1


def _as_ordinal(veblen: Veblen) -> Ordinal:
    return Ordinal._unchecked(((veblen, 1),))


def _arg_at(args: tuple[Ordinal, ...], index: int) -> Ordinal:
    if index < len(args):
        return args[index]
    return ZERO


def _is_preferred_veblen(veblen: Veblen) -> bool:
    ordinal = _as_ordinal(veblen)
    return all(_cmp_ordinal(arg, ordinal) < 0 for arg in veblen.args)


def _cmp_lesser_remainder(
    lesser_args: tuple[Ordinal, ...],
    differing_index: int,
    greater_ordinal: Ordinal,
) -> int:
    for index in range(differing_index - 1, -1, -1):
        arg_cmp = _cmp_ordinal(_arg_at(lesser_args, index), greater_ordinal)
        if arg_cmp < 0:
            continue
        if arg_cmp > 0:
            return 1

        for lower_index in range(index - 1, -1, -1):
            if not _arg_at(lesser_args, lower_index).is_zero():
                return 1
        return 0
    return -1


def _cmp_veblen(a: Veblen, b: Veblen) -> int:
    if not a.args or (len(a.args) > 1 and a.args[-1].is_zero()):
        a = _canonicalize_veblen(a)
    if not b.args or (len(b.args) > 1 and b.args[-1].is_zero()):
        b = _canonicalize_veblen(b)

    if a == b:
        return 0

    for index in range(max(len(a.args), len(b.args)) - 1, -1, -1):
        arg_cmp = _cmp_ordinal(_arg_at(a.args, index), _arg_at(b.args, index))
        if arg_cmp == 0:
            continue
        if index == 0:
            return arg_cmp
        if arg_cmp < 0:
            return _cmp_lesser_remainder(a.args, index, _as_ordinal(b))
        return -_cmp_lesser_remainder(b.args, index, _as_ordinal(a))
    return 0


@lru_cache(maxsize=None)
def _canonicalize_ordinal(ordinal: Ordinal) -> Ordinal:
    if ordinal.is_zero():
        return ZERO
    return Ordinal._from_normal_form_terms(ordinal.terms)


@lru_cache(maxsize=None)
def _canonicalize_veblen(veblen: Veblen) -> Veblen:
    if not veblen.args:
        raise ValueError("veblen term must have at least one argument")

    args = tuple(_canonicalize_ordinal(arg) for arg in veblen.args)
    while len(args) > 1 and args[-1].is_zero():
        args = args[:-1]
    return Veblen(args)


def _without_finite_tail(ordinal: Ordinal) -> tuple[Ordinal, int]:
    tail = 0
    core_terms = ordinal.terms
    if core_terms and _is_veblen_one(core_terms[-1][0]):
        _, tail = core_terms[-1]
        core_terms = core_terms[:-1]
    return Ordinal.from_terms(core_terms), tail


def _with_finite_tail(core: Ordinal, tail: int) -> Ordinal:
    _require_int_at_least(tail, 0, "tail")
    if tail == 0:
        return core
    return Ordinal.from_terms([*core.terms, (VEBLEN_ONE, tail)])


def _is_excluded_active_base(context: tuple[Ordinal, ...], gamma: Ordinal) -> bool:
    candidate = _canonicalize_veblen(Veblen((gamma, *context)))
    return not _is_preferred_veblen(candidate)


def _argument_not_fixed_point_of(
    context: tuple[Ordinal, ...],
    gamma: Ordinal,
    argument_index: int = 0,
) -> Ordinal:
    _require_int_at_least(argument_index, 0, "argument_index")
    if argument_index != 0:
        raise ValueError("standard finite-string repair only applies to the active argument")

    core, tail = _without_finite_tail(gamma)
    if not _is_excluded_active_base(context, core):
        return gamma

    return _with_finite_tail(core, tail + 1)


def _raw_argument_from_repaired(
    context: tuple[Ordinal, ...],
    gamma: Ordinal,
    argument_index: int = 0,
) -> Ordinal:
    _require_int_at_least(argument_index, 0, "argument_index")
    if argument_index != 0:
        raise ValueError("standard finite-string repair only applies to the active argument")

    if not gamma.terms or not _is_veblen_one(gamma.terms[-1][0]):
        return gamma

    core, tail = _without_finite_tail(gamma)
    if tail < 1:
        return gamma

    if not _is_excluded_active_base(context, core):
        return gamma

    return _with_finite_tail(core, tail - 1)


def _repair_fixed_point_tails(args: tuple[Ordinal, ...]) -> tuple[Ordinal, ...]:
    if not args:
        return args
    return (_argument_not_fixed_point_of(args[1:], args[0]), *args[1:])


def _undo_fixed_point_tail_repairs(args: tuple[Ordinal, ...]) -> tuple[Ordinal, ...]:
    if not args:
        return args
    return (_raw_argument_from_repaired(args[1:], args[0]), *args[1:])


class FinitaryVeblenEncoder:
    def __init__(self) -> None:
        self.prime_helper = PrimeIndexHelper()

    def factorize(self, n: int) -> list[tuple[int, int]]:
        return self.prime_helper.factorize(n)

    def prime_index(self, p: int) -> int:
        return self.prime_helper.prime_index(p)

    def _split_argument_codes(self, index: int) -> dict[int, int]:
        _require_int_at_least(index, 1, "index")

        argument_codes: dict[int, int] = {}
        for p, exp in self.factorize(index):
            source_index = self.prime_index(p)
            argument_index = 0
            odd_part = source_index
            while odd_part % 2 == 0:
                argument_index += 1
                odd_part //= 2
            child_index = (odd_part + 1) // 2
            child_prime = self.prime_helper.prime_at_index(child_index)
            argument_codes[argument_index] = argument_codes.get(argument_index, 1) * child_prime**exp
        return argument_codes

    def _veblen_from_index(self, index: int) -> Veblen:
        _require_int_at_least(index, 1, "index")

        argument_codes = self._split_argument_codes(index)
        decoded_args = {argument_index: self.ordinal(code) for argument_index, code in argument_codes.items()}

        max_argument_index = max(decoded_args, default=0)
        args = [decoded_args.get(argument_index, ZERO) for argument_index in range(max_argument_index + 1)]
        return _canonicalize_veblen(Veblen(_repair_fixed_point_tails(tuple(args))))

    def _encode_child_code_at_argument(self, code: int, argument_index: int) -> int:
        _require_int_at_least(code, 1, "code")
        _require_int_at_least(argument_index, 0, "argument_index")

        encoded = 1
        for p, exp in self.factorize(code):
            child_index = self.prime_index(p)
            source_index = (2**argument_index) * (2 * child_index - 1)
            encoded *= self.prime_helper.prime_at_index(source_index) ** exp
        return encoded

    def _index_from_veblen(self, veblen: Veblen) -> int:
        veblen = _canonicalize_veblen(veblen)
        if not _is_preferred_veblen(veblen):
            raise ValueError("Veblen node is not in preferred finitary Veblen normal form")

        raw_args = _undo_fixed_point_tail_repairs(veblen.args)
        index = 1
        for argument_index, arg in enumerate(raw_args):
            index *= self._encode_child_code_at_argument(self.natural(arg), argument_index)
        return index

    def prime_index_ordinal(self, index: int) -> Ordinal:
        return Ordinal.from_terms([(self._veblen_from_index(index), 1)])

    def prime_index_ordinal_latex(self, index: int) -> str:
        return self.prime_index_ordinal(index).to_latex()

    def ordinal(self, n: int) -> Ordinal:
        terms: list[Term] = []
        for p, exp in self.factorize(n):
            index = self.prime_index(p)
            terms.append((self._veblen_from_index(index), exp))
        return Ordinal._from_normal_form_terms(terms)

    def ordinal_latex(self, n: int) -> str:
        return self.ordinal(n).to_latex()

    def natural(self, ordinal: Ordinal) -> int:
        ordinal = _canonicalize_ordinal(ordinal)
        n = 1
        for veblen, coeff in ordinal.terms:
            index = self._index_from_veblen(veblen)
            n *= self.prime_helper.prime_at_index(index) ** coeff
        return n


def build_prime_latex_document(n: int, encoder: FinitaryVeblenEncoder) -> str:
    return build_document(encoder.prime_helper.primes_up_to(n), encoder.ordinal_latex)
