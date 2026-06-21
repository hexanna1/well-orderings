#!/usr/bin/env python3

import unittest

from buchholz_1 import (
    OMEGA,
    Ordinal,
    Principal,
    ZERO,
)


class Buchholz1MappingTests(unittest.TestCase):
    def _term(self, level: int, arg: Ordinal, coeff: int = 1) -> Ordinal:
        return Ordinal.from_legal_terms([(Principal(level, arg), coeff)])

    def _sum(self, *terms: tuple[int, Ordinal, int]) -> Ordinal:
        return Ordinal.from_legal_terms([(Principal(level, arg), coeff) for level, arg, coeff in terms])

    def test_omega_powers_preserve_absorption_and_fixed_point_factors(self) -> None:
        omega_two = self._sum((1, ZERO, 2))
        omega_squared_plus_omega_plus_one = self._sum((1, OMEGA, 1), (1, ZERO, 1), (0, ZERO, 1))
        epsilon_zero = self._term(0, OMEGA)

        cases = [
            (self._term(1, omega_two), "\\Omega^{3}"),
            (self._term(1, omega_squared_plus_omega_plus_one), "\\Omega^{\\Omega+1}\\omega"),
            (self._term(0, self._term(1, epsilon_zero)), "\\psi(\\Omega\\psi(\\Omega))"),
        ]
        for ordinal, expected in cases:
            self.assertEqual(ordinal.to_latex(), expected)


if __name__ == "__main__":
    unittest.main()
