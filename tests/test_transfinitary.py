#!/usr/bin/env python3

import unittest

from transfinitary import (
    GAMMA0,
    ONE,
    ZERO,
    Matrix,
    Ordinal,
    TransfinitaryVeblenEncoder,
    _repair_fixed_point_tail,
    _undo_fixed_point_tail_repair,
)


class TransfinitaryVeblenMappingTests(unittest.TestCase):
    def _term(self, *entries: tuple[Ordinal, Ordinal]) -> Ordinal:
        return Ordinal.from_terms([(Matrix(entries), 1)])

    def _sum(self, *ordinals: Ordinal) -> Ordinal:
        terms = []
        for ordinal in ordinals:
            terms.extend(ordinal.terms)
        return Ordinal.from_terms(terms)

    def test_nested_transfinitary_position_decodes_by_column_index(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        omega = self._term((ZERO, ONE))
        svo = self._term((omega, ONE))
        lvo_approximant = self._term((svo, ONE))

        ordinal = Ordinal.from_terms([(enc._matrix_from_index(367), 1)])
        self.assertEqual(ordinal, lvo_approximant)
        self.assertEqual(enc.natural(lvo_approximant), 2477)

    def test_tail_repair_shifts_entire_excluded_fiber(self) -> None:
        epsilon0 = self._term((ONE, ONE))
        epsilon0_plus_one = self._sum(epsilon0, ONE)

        raw_epsilon0 = Matrix(((ZERO, epsilon0),))
        raw_epsilon0_plus_one = Matrix(((ZERO, epsilon0_plus_one),))
        repaired_epsilon0 = _repair_fixed_point_tail(raw_epsilon0)
        repaired_epsilon0_plus_one = _repair_fixed_point_tail(raw_epsilon0_plus_one)

        self.assertEqual(
            Ordinal.from_terms([(repaired_epsilon0, 1)]).to_latex(),
            "\\omega^{\\varepsilon_{0}+1}",
        )
        self.assertEqual(
            Ordinal.from_terms([(repaired_epsilon0_plus_one, 1)]).to_latex(),
            "\\omega^{\\varepsilon_{0}+2}",
        )
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_epsilon0), raw_epsilon0)
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_epsilon0_plus_one), raw_epsilon0_plus_one)

        raw_gamma0 = Matrix(((ONE, GAMMA0),))
        raw_gamma0_plus_one = Matrix(((ONE, GAMMA0), (ZERO, ONE)))
        repaired_gamma0 = _repair_fixed_point_tail(raw_gamma0)
        repaired_gamma0_plus_one = _repair_fixed_point_tail(raw_gamma0_plus_one)

        self.assertEqual(
            Ordinal.from_terms([(repaired_gamma0, 1)]).to_latex(),
            "\\varphi_{\\Gamma_{0}}(1)",
        )
        self.assertEqual(
            Ordinal.from_terms([(repaired_gamma0_plus_one, 1)]).to_latex(),
            "\\varphi_{\\Gamma_{0}}(2)",
        )
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_gamma0), raw_gamma0)
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_gamma0_plus_one), raw_gamma0_plus_one)


if __name__ == "__main__":
    unittest.main()
