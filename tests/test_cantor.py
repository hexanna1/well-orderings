#!/usr/bin/env python3

import unittest

from cantor import ONE, ZERO, CantorOrdinalEncoder, Ordinal, build_prime_latex_document


class CantorMappingTests(unittest.TestCase):
    def test_initial_values_render(self) -> None:
        enc = CantorOrdinalEncoder()
        expected = [
            "0",
            "1",
            "\\omega",
            "2",
            "\\omega^{\\omega}",
            "\\omega+1",
            "\\omega^{2}",
            "3",
            "\\omega2",
            "\\omega^{\\omega}+1",
        ]
        self.assertEqual([enc.ordinal_latex(n) for n in range(1, 11)], expected)

    def test_decode_encode_roundtrip_on_prefix(self) -> None:
        enc = CantorOrdinalEncoder()
        for n in range(1, 1001):
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_constructed_ordinal_roundtrip(self) -> None:
        enc = CantorOrdinalEncoder()
        omega_plus_two = Ordinal.from_terms([(ZERO, 2), (ONE, 1)])
        self.assertEqual(omega_plus_two.to_latex(), "\\omega+2")
        self.assertEqual(enc.ordinal(enc.natural(omega_plus_two)), omega_plus_two)

    def test_prime_index_ordinal_matches_prime_value(self) -> None:
        enc = CantorOrdinalEncoder()
        for index in range(1, 101):
            prime = enc.prime_helper.prime_at_index(index)
            self.assertEqual(enc.prime_index_ordinal(index), enc.ordinal(prime))
            self.assertEqual(enc.prime_index_ordinal_latex(index), enc.ordinal_latex(prime))

    def test_prime_latex_document_uses_prime_rows(self) -> None:
        enc = CantorOrdinalEncoder()
        document = build_prime_latex_document(5, enc)

        self.assertIn("5 &\\mapsto \\omega^{\\omega}&\\\\", document)
        self.assertNotIn("4 &\\mapsto", document)


if __name__ == "__main__":
    unittest.main()
