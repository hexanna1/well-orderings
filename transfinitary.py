"""
Hereditary prime-index encoder for a finite-support transfinitary Veblen
normal form below the large Veblen ordinal.

Principal terms are finite-support matrices. An entry `(iota, alpha)` means
that the Veblen array has value `alpha` at ordinal position `iota`, with
unlisted positions equal to zero. Position zero is the active/rightmost
argument. Natural-number positions recover the finitary Veblen fragment, while
ordinal positions continue through the large Veblen ordinal.

Matrix-node indices are encoded as finite columns. Each prime factor of a
matrix-node index names a pair `(position_code, top_term_index)` via the usual
odd/even prime split: the odd-indexed part decodes the bottom-row position, and
the even-indexed part decodes one principal-term index in the top-row value.
Factors with the same decoded position are grouped into the natural code of the
top-row value at that position.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cmp_to_key, lru_cache
from typing import Iterable

from latex_document import build_document
from prime_index import PrimeIndexHelper


Entry = tuple["Ordinal", "Ordinal"]  # (position, value)


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


@dataclass(frozen=True)
class Matrix:
    # Entries are canonicalized as strictly descending positions with nonzero values.
    entries: tuple[Entry, ...]


Term = tuple[Matrix, int]


@dataclass(frozen=True)
class Ordinal:
    # Transfinitary Veblen normal form: strictly decreasing principal matrix terms with coefficients.
    terms: tuple[Term, ...]

    def __post_init__(self) -> None:
        normalized = type(self)._from_normal_form_terms(self.terms)
        if normalized.terms != self.terms:
            raise ValueError(
                "terms must be canonical transfinitary Veblen normal form; use Ordinal.from_terms"
            )

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
        counts: dict[Matrix, int] = {}
        for matrix, coeff in terms:
            _require_int_at_least(coeff, 1, "coeff")
            matrix = _canonicalize_matrix(matrix)
            if not _is_preferred_matrix(matrix):
                raise ValueError("ordinal is not in preferred transfinitary Veblen normal form")
            counts[matrix] = counts.get(matrix, 0) + coeff
        return cls._from_counts(counts)

    @classmethod
    def _from_counts(cls, counts: dict[Matrix, int]) -> Ordinal:
        matrices = [matrix for matrix, coeff in counts.items() if coeff]
        if not matrices:
            return cls.zero()
        matrices.sort(key=cmp_to_key(_cmp_matrix), reverse=True)
        return cls._unchecked(tuple((matrix, counts[matrix]) for matrix in matrices))

    def to_latex(self) -> str:
        if self.is_zero():
            return "0"

        parts: list[str] = []
        for matrix, coeff in self.terms:
            if _is_matrix_one(matrix):
                parts.append(str(coeff))
                continue

            rendered = _matrix_to_latex(matrix)
            if coeff > 1:
                rendered = f"{rendered}{coeff}"
            parts.append(rendered)
        return "+".join(parts)


ZERO = Ordinal.zero()
MATRIX_ONE = Matrix(())
ONE = Ordinal._unchecked(((MATRIX_ONE, 1),))
TWO = Ordinal._unchecked(((MATRIX_ONE, 2),))
GAMMA0_MATRIX = Matrix(((TWO, ONE),))
GAMMA0 = Ordinal._unchecked(((GAMMA0_MATRIX, 1),))
GAMMA_FIXED_POINT_MATRIX = Matrix(((TWO, ONE), (ONE, ONE)))
GAMMA_FIXED_POINT = Ordinal._unchecked(((GAMMA_FIXED_POINT_MATRIX, 1),))


def _is_matrix_one(matrix: Matrix) -> bool:
    return not matrix.entries


def _as_finite_nat(ordinal: Ordinal) -> int | None:
    if ordinal.is_zero():
        return 0
    if len(ordinal.terms) != 1:
        return None
    matrix, coeff = ordinal.terms[0]
    if not _is_matrix_one(matrix):
        return None
    return coeff


def _as_ordinal(matrix: Matrix) -> Ordinal:
    return Ordinal._unchecked(((matrix, 1),))


def _entry_value(entries: tuple[Entry, ...], position: Ordinal) -> Ordinal:
    for entry_position, value in entries:
        if entry_position == position:
            return value
    return ZERO


def _with_entry(
    entries: tuple[Entry, ...],
    position: Ordinal,
    value: Ordinal,
) -> Matrix:
    replaced: list[Entry] = []
    found = False
    for entry_position, entry_value in entries:
        if entry_position == position:
            found = True
            if not value.is_zero():
                replaced.append((position, value))
        else:
            replaced.append((entry_position, entry_value))
    if not found and not value.is_zero():
        replaced.append((position, value))
    return _canonicalize_matrix(Matrix(tuple(replaced)))


def _matrix_to_latex(matrix: Matrix) -> str:
    ordinal = _as_ordinal(matrix)
    if _cmp_ordinal(ordinal, GAMMA_FIXED_POINT) < 0:
        named_latex = _initial_named_latex(matrix)
        if named_latex is not None:
            return named_latex

    if _cmp_ordinal(ordinal, GAMMA_FIXED_POINT) < 0 and _is_binary_matrix(matrix):
        return _binary_fragment_to_latex(matrix)

    top = "&".join(value.to_latex() for _, value in matrix.entries)
    bottom = "&".join(position.to_latex() for position, _ in matrix.entries)
    return f"\\begin{{pmatrix}}{top}\\\\{bottom}\\end{{pmatrix}}"


def _initial_named_latex(matrix: Matrix) -> str | None:
    gamma = _omega_exponent(matrix)
    if gamma is not None:
        if gamma.is_one():
            return "\\omega"
        return f"\\omega^{{{gamma.to_latex()}}}"

    gamma = _binary_named_subscript(matrix, ONE)
    if gamma is not None:
        return f"\\varepsilon_{{{gamma.to_latex()}}}"

    gamma = _binary_named_subscript(matrix, TWO)
    if gamma is not None:
        return f"\\zeta_{{{gamma.to_latex()}}}"

    gamma = _gamma_subscript(matrix)
    if gamma is not None:
        return f"\\Gamma_{{{gamma.to_latex()}}}"

    return None


def _omega_exponent(matrix: Matrix) -> Ordinal | None:
    if len(matrix.entries) != 1:
        return None
    position, value = matrix.entries[0]
    if position != ZERO:
        return None
    return value


def _is_binary_matrix(matrix: Matrix) -> bool:
    return all(position in (ZERO, ONE) for position, _ in matrix.entries)


def _binary_named_subscript(matrix: Matrix, beta: Ordinal) -> Ordinal | None:
    if _entry_value(matrix.entries, ONE) != beta:
        return None
    gamma = _entry_value(matrix.entries, ZERO)
    expected_entries = 1 if gamma.is_zero() else 2
    if len(matrix.entries) != expected_entries:
        return None
    return gamma


def _gamma_subscript(matrix: Matrix) -> Ordinal | None:
    if _entry_value(matrix.entries, TWO) != ONE:
        return None
    if not _entry_value(matrix.entries, ONE).is_zero():
        return None
    gamma = _entry_value(matrix.entries, ZERO)
    expected_entries = 1 if gamma.is_zero() else 2
    if len(matrix.entries) != expected_entries:
        return None
    return gamma


def _binary_fragment_to_latex(matrix: Matrix) -> str:
    gamma = _entry_value(matrix.entries, ZERO)
    beta = _entry_value(matrix.entries, ONE)

    if beta.is_zero():
        if gamma.is_zero():
            return "1"
        if gamma.is_one():
            return "\\omega"
        return f"\\omega^{{{gamma.to_latex()}}}"

    beta_nat = _as_finite_nat(beta)
    if beta_nat == 1:
        return f"\\varepsilon_{{{gamma.to_latex()}}}"
    if beta_nat == 2:
        return f"\\zeta_{{{gamma.to_latex()}}}"
    return f"\\varphi_{{{beta.to_latex()}}}({gamma.to_latex()})"


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

        a_matrix, a_coeff = a.terms[ia]
        b_matrix, b_coeff = b.terms[ib]

        head_cmp = _cmp_matrix(a_matrix, b_matrix)
        if head_cmp != 0:
            return head_cmp

        if a_coeff != b_coeff:
            return -1 if a_coeff < b_coeff else 1

        ia += 1
        ib += 1


def _positions_union(a: tuple[Entry, ...], b: tuple[Entry, ...]) -> list[Ordinal]:
    positions = {position for position, _ in a}
    positions.update(position for position, _ in b)
    return sorted(positions, key=cmp_to_key(_cmp_ordinal), reverse=True)


def _cmp_lesser_remainder(
    lesser_entries: tuple[Entry, ...],
    differing_position: Ordinal,
    greater_ordinal: Ordinal,
) -> int:
    for position, value in lesser_entries:
        if _cmp_ordinal(position, differing_position) >= 0:
            continue

        value_cmp = _cmp_ordinal(value, greater_ordinal)
        if value_cmp < 0:
            continue
        if value_cmp > 0:
            return 1

        for lower_position, _ in lesser_entries:
            if _cmp_ordinal(lower_position, position) < 0:
                return 1
        return 0
    return -1


def _cmp_matrix(a: Matrix, b: Matrix) -> int:
    if _needs_matrix_canonicalization(a):
        a = _canonicalize_matrix(a)
    if _needs_matrix_canonicalization(b):
        b = _canonicalize_matrix(b)

    if a == b:
        return 0

    for position in _positions_union(a.entries, b.entries):
        a_value = _entry_value(a.entries, position)
        b_value = _entry_value(b.entries, position)
        value_cmp = _cmp_ordinal(a_value, b_value)
        if value_cmp == 0:
            continue
        if value_cmp < 0:
            return _cmp_lesser_remainder(a.entries, position, _as_ordinal(b))
        return -_cmp_lesser_remainder(b.entries, position, _as_ordinal(a))
    return 0


def _needs_matrix_canonicalization(matrix: Matrix) -> bool:
    previous_position: Ordinal | None = None
    seen: set[Ordinal] = set()
    for position, value in matrix.entries:
        if value.is_zero():
            return True
        if previous_position is not None and _cmp_ordinal(previous_position, position) <= 0:
            return True
        if position in seen:
            return True
        seen.add(position)
        previous_position = position
    return False


@lru_cache(maxsize=None)
def _canonicalize_ordinal(ordinal: Ordinal) -> Ordinal:
    if ordinal.is_zero():
        return ZERO
    return Ordinal._from_normal_form_terms(ordinal.terms)


@lru_cache(maxsize=None)
def _canonicalize_matrix(matrix: Matrix) -> Matrix:
    entries: list[Entry] = []
    seen: set[Ordinal] = set()
    for raw_position, raw_value in matrix.entries:
        position = _canonicalize_ordinal(raw_position)
        value = _canonicalize_ordinal(raw_value)
        if value.is_zero():
            continue
        if position in seen:
            raise ValueError("matrix positions must be distinct")
        seen.add(position)
        entries.append((position, value))
    entries.sort(
        key=cmp_to_key(lambda a, b: _cmp_ordinal(a[0], b[0])),
        reverse=True,
    )
    return Matrix(tuple(entries))


def _is_preferred_matrix(matrix: Matrix) -> bool:
    ordinal = _as_ordinal(matrix)
    for position, value in matrix.entries:
        if _cmp_ordinal(position, ordinal) >= 0:
            return False
        if _cmp_ordinal(value, ordinal) >= 0:
            return False
    return True


def _without_finite_tail(ordinal: Ordinal) -> tuple[Ordinal, int]:
    tail = 0
    core_terms = ordinal.terms
    if core_terms and _is_matrix_one(core_terms[-1][0]):
        _, tail = core_terms[-1]
        core_terms = core_terms[:-1]
    return Ordinal.from_terms(core_terms), tail


def _with_finite_tail(core: Ordinal, tail: int) -> Ordinal:
    _require_int_at_least(tail, 0, "tail")
    if tail == 0:
        return core
    return Ordinal.from_terms([*core.terms, (MATRIX_ONE, tail)])


def _repair_fixed_point_tail(matrix: Matrix) -> Matrix:
    matrix = _canonicalize_matrix(matrix)
    active = _entry_value(matrix.entries, ZERO)
    core, tail = _without_finite_tail(active)
    core_matrix = _with_entry(matrix.entries, ZERO, core)
    if not _is_preferred_matrix(core_matrix):
        repaired = _with_entry(matrix.entries, ZERO, _with_finite_tail(core, tail + 1))
        if not _is_preferred_matrix(repaired):
            raise ValueError("could not repair raw matrix descriptor into preferred normal form")
        return repaired

    if not _is_preferred_matrix(matrix):
        raise ValueError("raw matrix descriptor is not preferred and has no active finite-tail repair")
    return matrix


def _undo_fixed_point_tail_repair(matrix: Matrix) -> Matrix:
    matrix = _canonicalize_matrix(matrix)
    active = _entry_value(matrix.entries, ZERO)
    if active.is_zero():
        return matrix

    core, tail = _without_finite_tail(active)
    if tail < 1:
        return matrix

    core_matrix = _with_entry(matrix.entries, ZERO, core)
    if _is_preferred_matrix(core_matrix):
        return matrix
    return _with_entry(matrix.entries, ZERO, _with_finite_tail(core, tail - 1))


class TransfinitaryVeblenEncoder:
    def __init__(self) -> None:
        self.prime_helper = PrimeIndexHelper()

    def factorize(self, n: int) -> list[tuple[int, int]]:
        return self.prime_helper.factorize(n)

    def prime_index(self, p: int) -> int:
        return self.prime_helper.prime_index(p)

    def _encode_odd_part(self, code: int) -> int:
        _require_int_at_least(code, 1, "code")

        encoded = 1
        for p, exp in self.factorize(code):
            source_index = 2 * self.prime_index(p) - 1
            encoded *= self.prime_helper.prime_at_index(source_index) ** exp
        return encoded

    def _encode_even_part(self, code: int) -> int:
        _require_int_at_least(code, 1, "code")

        encoded = 1
        for p, exp in self.factorize(code):
            source_index = 2 * self.prime_index(p)
            encoded *= self.prime_helper.prime_at_index(source_index) ** exp
        return encoded

    def _encode_column_factor_index(self, position_code: int, top_term_index: int) -> int:
        _require_int_at_least(position_code, 1, "position_code")
        _require_int_at_least(top_term_index, 1, "top_term_index")
        return self._encode_odd_part(position_code) * self._encode_even_part(top_term_index)

    def _split_column_factor_index(self, source_index: int) -> tuple[int, int]:
        _require_int_at_least(source_index, 1, "source_index")

        position_code = 1
        top_term_index = 1
        for p, exp in self.factorize(source_index):
            source_prime_index = self.prime_index(p)
            if source_prime_index % 2 == 1:
                child_index = (source_prime_index + 1) // 2
                position_code *= self.prime_helper.prime_at_index(child_index) ** exp
            else:
                child_index = source_prime_index // 2
                top_term_index *= self.prime_helper.prime_at_index(child_index) ** exp
        return position_code, top_term_index

    def _split_entry_codes(self, index: int) -> dict[int, int]:
        _require_int_at_least(index, 1, "index")

        entry_codes: dict[int, int] = {}
        for p, exp in self.factorize(index):
            source_index = self.prime_index(p)
            position_code, top_term_index = self._split_column_factor_index(source_index)
            top_term_prime = self.prime_helper.prime_at_index(top_term_index)
            entry_codes[position_code] = entry_codes.get(position_code, 1) * top_term_prime**exp
        return entry_codes

    def _matrix_from_index(self, index: int) -> Matrix:
        _require_int_at_least(index, 1, "index")

        entries = tuple(
            (self.ordinal(position_code), self.ordinal(value_code))
            for position_code, value_code in self._split_entry_codes(index).items()
        )
        return _repair_fixed_point_tail(Matrix(entries))

    def _encode_value_code_at_position(self, code: int, position_code: int) -> int:
        _require_int_at_least(code, 1, "code")
        _require_int_at_least(position_code, 1, "position_code")

        encoded = 1
        for p, exp in self.factorize(code):
            top_term_index = self.prime_index(p)
            source_index = self._encode_column_factor_index(position_code, top_term_index)
            encoded *= self.prime_helper.prime_at_index(source_index) ** exp
        return encoded

    def _index_from_matrix(self, matrix: Matrix) -> int:
        matrix = _canonicalize_matrix(matrix)
        if not _is_preferred_matrix(matrix):
            raise ValueError("matrix is not in preferred transfinitary Veblen normal form")

        raw_matrix = _undo_fixed_point_tail_repair(matrix)
        index = 1
        for position, value in raw_matrix.entries:
            position_code = self.natural(position)
            value_code = self.natural(value)
            index *= self._encode_value_code_at_position(value_code, position_code)
        return index

    def prime_index_ordinal(self, index: int) -> Ordinal:
        return Ordinal.from_terms([(self._matrix_from_index(index), 1)])

    def prime_index_ordinal_latex(self, index: int) -> str:
        return self.prime_index_ordinal(index).to_latex()

    def ordinal(self, n: int) -> Ordinal:
        terms: list[Term] = []
        for p, exp in self.factorize(n):
            index = self.prime_index(p)
            terms.append((self._matrix_from_index(index), exp))
        return Ordinal._from_normal_form_terms(terms)

    def ordinal_latex(self, n: int) -> str:
        return self.ordinal(n).to_latex()

    def natural(self, ordinal: Ordinal) -> int:
        ordinal = _canonicalize_ordinal(ordinal)
        n = 1
        for matrix, coeff in ordinal.terms:
            index = self._index_from_matrix(matrix)
            n *= self.prime_helper.prime_at_index(index) ** coeff
        return n


def build_prime_latex_document(n: int, encoder: TransfinitaryVeblenEncoder) -> str:
    return build_document(encoder.prime_helper.primes_up_to(n), encoder.ordinal_latex)
