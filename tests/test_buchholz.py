#!/usr/bin/env python3

import unittest

from buchholz import (
    BuchholzOrdinalEncoder,
    OMEGA,
    ONE,
    Ordinal,
    Principal,
    ZERO,
    is_legal,
)


class BuchholzMappingTests(unittest.TestCase):
    def _term(self, level: int, arg: Ordinal, coeff: int = 1) -> Ordinal:
        return Ordinal.from_legal_terms([(Principal(level, arg), coeff)])

    def _sum(self, *terms: tuple[int, Ordinal, int]) -> Ordinal:
        return Ordinal.from_legal_terms([(Principal(level, arg), coeff) for level, arg, coeff in terms])

    def test_raw_code_roundtrip_on_prefix(self) -> None:
        enc = BuchholzOrdinalEncoder()
        for n in range(1, 301):
            self.assertEqual(enc.raw_code(enc.raw_decode(n)), n)

    def test_encoder_roundtrip_on_prefix(self) -> None:
        enc = BuchholzOrdinalEncoder()
        for n in range(1, 301):
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_rejects_illegal_fixed_point_duplicate(self) -> None:
        psi0_omega = Ordinal.from_legal_terms([(Principal(0, OMEGA), 1)])
        illegal = Ordinal.raw_from_terms([(Principal(0, psi0_omega), 1)])
        self.assertFalse(is_legal(illegal))

    def test_initial_code_renders(self) -> None:
        enc = BuchholzOrdinalEncoder()
        cases = [
            (1, "0"),
            (2, "1"),
            (3, "\\omega"),
            (4, "2"),
            (5, "\\psi_{0}(\\Omega)"),
            (7, "\\omega^{2}"),
            (11, "\\omega^{\\omega}"),
            (13, "\\psi_{0}(\\Omega+1)"),
            (17, "\\psi_{0}(\\Omega_{2})"),
        ]
        for n, expected in cases:
            self.assertEqual(enc.ordinal(n).to_latex(), expected)

    def test_finite_coefficients_in_omega_tails_render_as_naturals(self) -> None:
        omega_plus_two = self._sum((1, ZERO, 1), (0, ZERO, 2))
        self.assertEqual(omega_plus_two.to_latex(), "\\Omega+2")
        self.assertEqual(self._term(0, omega_plus_two).to_latex(), "\\psi_{0}(\\Omega+2)")

        omega_plus_two_omega_plus_three = self._sum((1, ONE, 2), (0, ZERO, 3))
        self.assertEqual(omega_plus_two_omega_plus_three.to_latex(), "\\Omega\\omega2+3")
        self.assertEqual(
            self._term(0, omega_plus_two_omega_plus_three).to_latex(),
            "\\psi_{0}(\\Omega\\omega2+3)",
        )

        self.assertEqual(self._term(1, OMEGA, 2).to_latex(), "\\Omega^{2}2")

    def test_omega_renderer_recurses_through_nested_omega_levels(self) -> None:
        omega_two = self._sum((1, ZERO, 2))
        omega_squared = self._term(1, OMEGA)
        omega_squared_plus_omega_plus_one = self._sum((1, OMEGA, 1), (1, ZERO, 1), (0, ZERO, 1))
        omega_to_omega = self._term(1, omega_squared)
        epsilon_zero = self._term(0, OMEGA)
        epsilon_one = self._term(0, self._sum((1, ZERO, 1), (0, ZERO, 1)))
        psi_one_gamma_zero = self._term(1, self._term(2, ZERO))

        cases = [
            (self._term(1, omega_two), "\\Omega^{3}"),
            (self._term(1, omega_squared_plus_omega_plus_one), "\\Omega^{\\Omega+1}\\omega"),
            (self._term(1, omega_to_omega), "\\Omega^{\\Omega^{\\Omega}}"),
            (self._term(0, self._term(1, epsilon_zero)), "\\psi_{0}(\\Omega\\psi_{0}(\\Omega))"),
            (self._term(0, self._term(1, epsilon_one)), "\\psi_{0}(\\Omega\\psi_{0}(\\Omega+1))"),
            (self._term(0, self._term(2, psi_one_gamma_zero)), "\\psi_{0}(\\Omega_{2}\\psi_{1}(\\Omega_{2}))"),
        ]
        for ordinal, expected in cases:
            self.assertEqual(ordinal.to_latex(), expected)


if __name__ == "__main__":
    unittest.main()
