#!/usr/bin/env python3

import unittest

from finitary import (
    FinitaryVeblenEncoder,
    ONE,
    Ordinal,
    VEBLEN_ONE,
    Veblen,
    ZERO,
    _cmp_ordinal,
)


class FinitaryVeblenMappingTests(unittest.TestCase):
    def _term(self, *args: Ordinal) -> Ordinal:
        return Ordinal.from_terms([(Veblen(args), 1)])

    def test_standard_finitary_gamma_boundary(self) -> None:
        enc = FinitaryVeblenEncoder()
        two = Ordinal.from_terms([(VEBLEN_ONE, 2)])
        gamma0 = self._term(ZERO, ZERO, ONE)
        gamma1 = self._term(ONE, ZERO, ONE)
        phi_gamma0_1 = self._term(ONE, gamma0)
        phi_gamma0_2 = self._term(two, gamma0)

        self.assertLess(_cmp_ordinal(gamma0, phi_gamma0_1), 0)
        self.assertLess(_cmp_ordinal(phi_gamma0_1, gamma1), 0)
        self.assertEqual(enc.natural(phi_gamma0_1), enc.prime_helper.prime_at_index(101))
        self.assertEqual(enc.natural(phi_gamma0_2), enc.prime_helper.prime_at_index(202))
        self.assertEqual(enc.natural(gamma1), enc.prime_helper.prime_at_index(14))


if __name__ == "__main__":
    unittest.main()
