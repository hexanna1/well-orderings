#!/usr/bin/env python3

import unittest

from ebocf import (
    OMEGA,
    OMEGA_2,
    ONE,
    TWO,
    ZERO,
    Ordinal,
    Principal,
    psi,
    support,
)


class EBOCFMappingTests(unittest.TestCase):
    def _sum(self, *terms: tuple[Ordinal, Ordinal, int]) -> Ordinal:
        return Ordinal.raw_from_terms([(Principal(level, arg), coeff) for level, arg, coeff in terms])

    def test_support_recurses_into_ordinal_valued_levels(self) -> None:
        epsilon_zero = psi(ZERO, OMEGA)
        omega_epsilon_zero = psi(epsilon_zero, ZERO)

        self.assertIn(OMEGA, support(ZERO, omega_epsilon_zero))
        self.assertIn(ZERO, support(ZERO, omega_epsilon_zero))

    def test_omega_powers_preserve_nested_levels_and_fixed_point_factors(self) -> None:
        omega_plus_one = self._sum((ONE, ZERO, 1), (ZERO, ZERO, 1))
        omega_two_times_two = self._sum((TWO, ZERO, 2))
        epsilon_zero = psi(ZERO, OMEGA)
        psi_one_gamma_zero = psi(ONE, OMEGA_2)

        cases = [
            (psi(TWO, omega_plus_one), "\\Omega_{2}\\Omega\\omega"),
            (psi(TWO, omega_two_times_two), "\\Omega_{2}^{3}"),
            (psi(OMEGA, ONE), "\\Omega_{\\Omega}\\omega"),
            (psi(ZERO, psi(ONE, epsilon_zero)), "\\psi_{0}(\\Omega\\psi_{0}(\\Omega))"),
            (psi(ZERO, psi(TWO, psi_one_gamma_zero)), "\\psi_{0}(\\Omega_{2}\\psi_{1}(\\Omega_{2}))"),
        ]
        for ordinal, expected in cases:
            self.assertEqual(ordinal.to_latex(), expected)


if __name__ == "__main__":
    unittest.main()
