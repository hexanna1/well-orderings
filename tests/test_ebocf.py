#!/usr/bin/env python3

import unittest

from ebocf import (
    EBOCFOrdinalEncoder,
    OMEGA,
    OMEGA_2,
    ONE,
    TWO,
    ZERO,
    Ordinal,
    Principal,
    finite,
    is_admissible,
    is_legal,
    psi,
    raw_psi,
    support,
)


class EBOCFMappingTests(unittest.TestCase):
    def _sum(self, *terms: tuple[Ordinal, Ordinal, int]) -> Ordinal:
        return Ordinal.raw_from_terms([(Principal(level, arg), coeff) for level, arg, coeff in terms])

    def test_initial_terms_render(self) -> None:
        cases = [
            (ZERO, "0"),
            (ONE, "1"),
            (finite(3), "3"),
            (OMEGA, "\\Omega"),
            (OMEGA_2, "\\Omega_{2}"),
            (psi(OMEGA, ZERO), "\\Omega_{\\Omega}"),
        ]
        for ordinal, expected in cases:
            self.assertEqual(ordinal.to_latex(), expected)

    def test_guards_handle_illegal_and_ordinal_valued_levels(self) -> None:
        epsilon_zero = psi(ZERO, OMEGA)
        illegal = raw_psi(ZERO, epsilon_zero)
        omega_epsilon_zero = psi(epsilon_zero, ZERO)

        self.assertFalse(is_legal(illegal))
        self.assertFalse(is_admissible(illegal, ZERO))
        self.assertIn(OMEGA, support(ZERO, epsilon_zero))
        self.assertIn(OMEGA, support(ZERO, omega_epsilon_zero))
        self.assertIn(ZERO, support(ZERO, omega_epsilon_zero))

    def test_canonical_sum_orders_by_principal(self) -> None:
        unordered = self._sum((ZERO, ZERO, 1), (TWO, ZERO, 1), (ONE, ZERO, 1))
        self.assertEqual(unordered.to_latex(), "\\Omega_{2}+\\Omega+1")

    def test_symbolic_rendering_patterns(self) -> None:
        omega_plus_one = self._sum((ONE, ZERO, 1), (ZERO, ZERO, 1))
        omega_plus_two = self._sum((ONE, ZERO, 1), (ZERO, ZERO, 2))
        omega_two_plus_one = self._sum((TWO, ZERO, 1), (ZERO, ZERO, 1))
        omega_two_plus_two = self._sum((TWO, ZERO, 1), (ZERO, ZERO, 2))
        omega_two_plus_omega = self._sum((TWO, ZERO, 1), (ONE, ZERO, 1))
        omega_two_times_two = self._sum((TWO, ZERO, 2))
        omega_omega = psi(OMEGA, ZERO)
        epsilon_zero = psi(ZERO, OMEGA)
        gamma_zero = psi(ZERO, OMEGA_2)
        psi_one_gamma_zero = psi(ONE, OMEGA_2)

        cases = [
            (psi(ZERO, ONE), "\\omega"),
            (psi(ONE, ONE), "\\Omega\\omega"),
            (psi(ONE, OMEGA), "\\Omega^{2}"),
            (psi(TWO, ONE), "\\Omega_{2}\\omega"),
            (psi(TWO, OMEGA), "\\Omega_{2}\\Omega"),
            (psi(TWO, omega_plus_one), "\\Omega_{2}\\Omega\\omega"),
            (psi(ZERO, omega_plus_two), "\\psi_{0}(\\Omega+2)"),
            (psi(TWO, OMEGA_2), "\\Omega_{2}^{2}"),
            (psi(TWO, omega_two_plus_one), "\\Omega_{2}^{2}\\omega"),
            (psi(ZERO, omega_two_plus_two), "\\psi_{0}(\\Omega_{2}+2)"),
            (psi(TWO, omega_two_plus_omega), "\\Omega_{2}^{2}\\Omega"),
            (psi(TWO, omega_two_times_two), "\\Omega_{2}^{3}"),
            (psi(TWO, psi(TWO, OMEGA_2)), "\\Omega_{2}^{\\Omega_{2}}"),
            (psi(OMEGA, ONE), "\\Omega_{\\Omega}\\omega"),
            (psi(OMEGA, omega_omega), "\\Omega_{\\Omega}^{2}"),
            (psi(ONE, OMEGA_2), "\\psi_{1}(\\Omega_{2})"),
            (psi(ONE, epsilon_zero), "\\Omega\\psi_{0}(\\Omega)"),
            (psi(ZERO, psi(ONE, epsilon_zero)), "\\psi_{0}(\\Omega\\psi_{0}(\\Omega))"),
            (psi(ONE, gamma_zero), "\\Omega\\psi_{0}(\\Omega_{2})"),
            (psi(TWO, psi_one_gamma_zero), "\\Omega_{2}\\psi_{1}(\\Omega_{2})"),
            (psi(ZERO, psi(TWO, psi_one_gamma_zero)), "\\psi_{0}(\\Omega_{2}\\psi_{1}(\\Omega_{2}))"),
        ]
        for ordinal, expected in cases:
            self.assertEqual(ordinal.to_latex(), expected)

    def test_total_encoder_roundtrips_on_prefix(self) -> None:
        enc = EBOCFOrdinalEncoder()
        for n in range(1, 121):
            self.assertEqual(enc.raw_code(enc.raw_decode(n)), n)
            self.assertEqual(enc.argument_code(enc.argument_decode(n)), n)
            self.assertEqual(enc.ebocf_encode(enc.ebocf_decode(n)), n)

    def test_total_encoder_distinguishes_full_terms_from_countable_output(self) -> None:
        enc = EBOCFOrdinalEncoder()
        self.assertEqual(enc.argument_decode(3).to_latex(), "\\Omega")
        self.assertEqual(enc.argument_decode(7).to_latex(), "\\Omega_{2}")
        self.assertEqual(enc.ebocf_decode(5).to_latex(), "\\psi_{0}(\\Omega)")
        self.assertEqual(enc.ebocf_encode(psi(ZERO, OMEGA_2)), 17)
        with self.assertRaisesRegex(ValueError, "countable"):
            enc.ebocf_encode(OMEGA)


if __name__ == "__main__":
    unittest.main()
