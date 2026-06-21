"""Binary Veblen ordinal term model and prime-index encoder."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cmp_to_key, lru_cache
from typing import Iterable

from latex_document import build_document
from prime_index import PrimeIndexHelper


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


def _require_argument_index(argument_index: int) -> None:
    if type(argument_index) is not int or argument_index not in (0, 1):
        raise ValueError("argument_index must be the integer 0 or 1")


@dataclass(frozen=True)
class Phi:
    beta: Ordinal
    gamma: Ordinal


Term = tuple[Phi, int]  # (principal term, coefficient)


@dataclass(frozen=True)
class Ordinal:
    # Veblen normal form: strictly decreasing principal terms with natural coefficients.
    terms: tuple[Term, ...]

    def __post_init__(self) -> None:
        normalized = type(self)._from_normal_form_terms(self.terms)
        if normalized.terms != self.terms:
            raise ValueError("terms must be canonical Veblen normal form; use Ordinal.from_terms")

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
        # Always normalize, so callers cannot accidentally build non-VNF ordinals.
        return cls._from_normal_form_terms(terms)

    @classmethod
    def _from_normal_form_terms(cls, terms: Iterable[Term]) -> Ordinal:
        counts: dict[Phi, int] = {}
        for phi, coeff in terms:
            _require_int_at_least(coeff, 1, "coeff")
            phi = _canonicalize_phi(phi)
            if _is_fixed_point_argument(phi.beta, phi.gamma):
                raise ValueError("ordinal is not in Veblen normal form (fixed-point argument)")
            counts[phi] = counts.get(phi, 0) + coeff
        return cls._from_counts(counts)

    @classmethod
    def _from_counts(cls, counts: dict[Phi, int]) -> Ordinal:
        phis = [phi for phi, coeff in counts.items() if coeff]
        if not phis:
            return cls.zero()
        phis.sort(key=cmp_to_key(_cmp_phi), reverse=True)
        return cls._unchecked(tuple((phi, counts[phi]) for phi in phis))

    def to_latex(self) -> str:
        if self.is_zero():
            return "0"

        parts: list[str] = []
        for phi, coeff in self.terms:
            if _is_phi_one(phi):
                parts.append(str(coeff))
                continue

            rendered = _phi_to_latex(phi)
            if coeff > 1:
                rendered = f"{rendered}{coeff}"
            parts.append(rendered)
        return "+".join(parts)


ZERO = Ordinal.zero()
PHI_ONE = Phi(ZERO, ZERO)
ONE = Ordinal._unchecked(((PHI_ONE, 1),))


def _is_phi_one(phi: Phi) -> bool:
    return phi.beta.is_zero() and phi.gamma.is_zero()


def _as_finite_nat(ordinal: Ordinal) -> int | None:
    if ordinal.is_zero():
        return 0
    if len(ordinal.terms) != 1:
        return None
    phi, coeff = ordinal.terms[0]
    if not _is_phi_one(phi):
        return None
    return coeff


def _is_fixed_point_core(beta: Ordinal, core_terms: tuple[Term, ...]) -> bool:
    if len(core_terms) != 1:
        return False
    theta, theta_coeff = core_terms[0]
    if theta_coeff != 1:
        return False
    return _cmp_ordinal(theta.beta, beta) > 0


def _is_fixed_point_argument(beta: Ordinal, gamma: Ordinal) -> bool:
    # In Veblen normal form, a fixed point of phi_beta is a single principal term
    # with coefficient 1 whose index is strictly greater than beta.
    return _is_fixed_point_core(beta, gamma.terms)


def _phi_to_latex(phi: Phi) -> str:
    # Pretty-printers for common initial Veblen functions:
    #   phi_0(alpha) = omega^alpha
    #   phi_1(alpha) = epsilon_alpha
    beta_nat = _as_finite_nat(phi.beta)
    if beta_nat == 0:
        if phi.gamma.is_zero():
            return "1"
        if phi.gamma.is_one():
            return "\\omega"
        return f"\\omega^{{{phi.gamma.to_latex()}}}"

    if beta_nat == 1:
        return f"\\varepsilon_{{{phi.gamma.to_latex()}}}"

    if beta_nat == 2:
        return f"\\zeta_{{{phi.gamma.to_latex()}}}"

    return f"\\varphi_{{{phi.beta.to_latex()}}}({phi.gamma.to_latex()})"


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
        if ia >= len(a.terms):
            return -1
        if ib >= len(b.terms):
            return 1

        a_phi, a_coeff = a.terms[ia]
        b_phi, b_coeff = b.terms[ib]

        head_cmp = _cmp_phi(a_phi, b_phi)
        if head_cmp != 0:
            return head_cmp

        if a_coeff != b_coeff:
            return -1 if a_coeff < b_coeff else 1

        ia += 1
        ib += 1


def _as_ordinal(phi: Phi) -> Ordinal:
    return Ordinal._unchecked(((phi, 1),))


def _cmp_phi(a: Phi, b: Phi) -> int:
    if a == b:
        return 0

    beta_cmp = _cmp_ordinal(a.beta, b.beta)
    if beta_cmp == 0:
        return _cmp_ordinal(a.gamma, b.gamma)

    if beta_cmp < 0:
        # a.beta < b.beta and b is a fixed point of all lower-indexed functions:
        #   phi_{a.beta}(a.gamma) < phi_{b.beta}(b.gamma)  <=>  a.gamma < phi_{b.beta}(b.gamma)
        return _cmp_ordinal(a.gamma, _as_ordinal(b))

    # a.beta > b.beta:
    #   phi_{a.beta}(a.gamma) < phi_{b.beta}(b.gamma)  <=>  phi_{a.beta}(a.gamma) < b.gamma
    return _cmp_ordinal(_as_ordinal(a), b.gamma)


@lru_cache(maxsize=None)
def _canonicalize_ordinal(ordinal: Ordinal) -> Ordinal:
    if ordinal.is_zero():
        return ZERO
    return Ordinal._from_normal_form_terms(ordinal.terms)


@lru_cache(maxsize=None)
def _canonicalize_phi(phi: Phi) -> Phi:
    beta = _canonicalize_ordinal(phi.beta)
    gamma = _canonicalize_ordinal(phi.gamma)
    return Phi(beta, gamma)


def _without_finite_tail(ordinal: Ordinal) -> tuple[Ordinal, int]:
    tail = 0
    core_terms = ordinal.terms
    if core_terms and _is_phi_one(core_terms[-1][0]):
        _, tail = core_terms[-1]
        core_terms = core_terms[:-1]
    return Ordinal.from_terms(core_terms), tail


def _with_finite_tail(core: Ordinal, tail: int) -> Ordinal:
    _require_int_at_least(tail, 0, "tail")
    if tail == 0:
        return core
    return Ordinal.from_terms([*core.terms, (PHI_ONE, tail)])


def _argument_not_fixed_point_of(beta: Ordinal, gamma: Ordinal) -> Ordinal:
    """
    Map an arbitrary ordinal `gamma` to an ordinal that is *not* a fixed point of phi_beta,
    bijectively and purely structurally.

    For Veblen normal form, the side condition is:
      gamma < phi_beta(gamma),
    i.e. gamma must not be a fixed point of phi_beta.

    In VNF, any principal term phi_delta(x) with delta > beta is a (common) fixed point of all
    lower-indexed functions, hence in particular a fixed point of phi_beta. To get a *bijection*
    from all ordinals onto the admissible arguments (excluding those fixed points), we shift the
    finite tail over each fixed point:

      theta + n  ->  theta + (n+1)

    where theta is a fixed point of phi_beta (a single principal term with index > beta and
    coefficient 1) and n is a natural number (the coefficient of 1 = phi_0(0)).
    """

    # Only shift ordinals of the form theta + n, where theta is a fixed point of phi_beta.
    core, tail = _without_finite_tail(gamma)
    if not _is_fixed_point_core(beta, core.terms):
        return gamma

    # Shift the whole fiber theta + n -> theta + (n+1).
    return _with_finite_tail(core, tail + 1)


def _raw_argument_from_repaired(beta: Ordinal, gamma: Ordinal) -> Ordinal:
    if not gamma.terms or not _is_phi_one(gamma.terms[-1][0]):
        return gamma

    core, tail = _without_finite_tail(gamma)
    if tail < 1:
        return gamma
    if not _is_fixed_point_core(beta, core.terms):
        return gamma
    return _with_finite_tail(core, tail - 1)


class BinaryVeblenEncoder:
    def __init__(self) -> None:
        self.prime_helper = PrimeIndexHelper()

    def factorize(self, n: int) -> list[tuple[int, int]]:
        return self.prime_helper.factorize(n)

    def prime_index(self, p: int) -> int:
        return self.prime_helper.prime_index(p)

    def _split_argument_codes(self, index: int) -> tuple[int, int]:
        _require_int_at_least(index, 1, "index")

        beta_code = 1
        gamma_code = 1
        for p, exp in self.factorize(index):
            source_index = self.prime_index(p)
            if source_index % 2 == 1:
                child_index = (source_index + 1) // 2
                gamma_code *= self.prime_helper.prime_at_index(child_index) ** exp
            else:
                child_index = source_index // 2
                beta_code *= self.prime_helper.prime_at_index(child_index) ** exp
        return beta_code, gamma_code

    def _phi_from_index(self, index: int) -> Phi:
        _require_int_at_least(index, 1, "index")

        beta_code, gamma_code = self._split_argument_codes(index)

        beta = self.ordinal(beta_code)
        gamma_raw = self.ordinal(gamma_code)
        gamma = _argument_not_fixed_point_of(beta, gamma_raw)
        return Phi(beta, gamma)

    def _encode_child_code_at_argument(self, code: int, argument_index: int) -> int:
        _require_int_at_least(code, 1, "code")
        _require_argument_index(argument_index)

        encoded = 1
        for p, exp in self.factorize(code):
            child_index = self.prime_index(p)
            source_index = 2 * child_index - 1 + argument_index
            encoded *= self.prime_helper.prime_at_index(source_index) ** exp
        return encoded

    def _index_from_phi(self, phi: Phi) -> int:
        phi = _canonicalize_phi(phi)
        if _is_fixed_point_argument(phi.beta, phi.gamma):
            raise ValueError("phi is not in Veblen normal form (fixed-point argument)")

        beta_code = self.natural(phi.beta)
        gamma_code = self.natural(_raw_argument_from_repaired(phi.beta, phi.gamma))
        return self._encode_child_code_at_argument(gamma_code, 0) * self._encode_child_code_at_argument(beta_code, 1)

    def prime_index_ordinal(self, index: int) -> Ordinal:
        return Ordinal.from_terms([(self._phi_from_index(index), 1)])

    def prime_index_ordinal_latex(self, index: int) -> str:
        return self.prime_index_ordinal(index).to_latex()

    def ordinal(self, n: int) -> Ordinal:
        terms: list[Term] = []
        for p, exp in self.factorize(n):
            index = self.prime_index(p)
            terms.append((self._phi_from_index(index), exp))
        return Ordinal._from_normal_form_terms(terms)

    def ordinal_latex(self, n: int) -> str:
        return self.ordinal(n).to_latex()

    def natural(self, ordinal: Ordinal) -> int:
        ordinal = _canonicalize_ordinal(ordinal)
        n = 1
        for phi, coeff in ordinal.terms:
            index = self._index_from_phi(phi)
            n *= self.prime_helper.prime_at_index(index) ** coeff
        return n


def build_prime_latex_document(n: int, encoder: BinaryVeblenEncoder) -> str:
    return build_document(encoder.prime_helper.primes_up_to(n), encoder.ordinal_latex)
