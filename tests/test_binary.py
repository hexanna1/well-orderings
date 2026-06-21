#!/usr/bin/env python3

import unittest

from binary import BinaryVeblenEncoder


class BinaryVeblenMappingTests(unittest.TestCase):
    def test_fixed_point_dodging_prevents_collapse(self) -> None:
        enc = BinaryVeblenEncoder()
        self.assertEqual(enc.ordinal(5).to_latex(), "\\varepsilon_{0}")
        # 31 is p_11. Index 11 has raw active child-code 5, so the naive term
        # omega^(epsilon_0) is shifted to omega^(epsilon_0+1).
        self.assertEqual(enc.ordinal(31).to_latex(), "\\omega^{\\varepsilon_{0}+1}")
        self.assertNotEqual(enc.ordinal(31), enc.ordinal(5))


if __name__ == "__main__":
    unittest.main()
