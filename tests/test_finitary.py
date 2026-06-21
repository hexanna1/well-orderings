#!/usr/bin/env python3

import unittest

from binary import BinaryVeblenEncoder
from finitary import (
    FinitaryVeblenEncoder,
    Ordinal,
    VEBLEN_ONE,
    Veblen,
    ZERO,
    _argument_not_fixed_point_of,
    _cmp_ordinal,
    _cmp_veblen,
    _is_preferred_veblen,
    _repair_fixed_point_tails,
    _undo_fixed_point_tail_repairs,
)


class FinitaryVeblenMappingTests(unittest.TestCase):
    def _nat(self, n: int) -> Ordinal:
        if n < 0:
            raise ValueError("n must be >= 0")
        if n == 0:
            return ZERO
        return Ordinal.from_terms([(VEBLEN_ONE, n)])

    def _term(self, *args: Ordinal) -> Ordinal:
        return Ordinal.from_terms([(Veblen(tuple(args)), 1)])

    def _sum(self, *ordinals: Ordinal) -> Ordinal:
        terms = []
        for ordinal in ordinals:
            terms.extend(ordinal.terms)
        return Ordinal.from_terms(terms)

    def test_initial_prime_index_targets(self) -> None:
        enc = FinitaryVeblenEncoder()
        cases = [
            (1, "1"),
            (2, "\\omega"),
            (3, "\\varepsilon_{0}"),
            (4, "\\omega^{2}"),
            (5, "\\omega^{\\omega}"),
            (6, "\\varepsilon_{1}"),
            (7, "\\Gamma_{0}"),
            (14, "\\Gamma_{1}"),
            (19, "\\varphi(1,0,0,0)"),
        ]
        for index, expected in cases:
            self.assertEqual(enc.prime_index_ordinal_latex(index), expected)

    def test_initial_integer_values_match_binary_encoder_until_first_higher_argument(self) -> None:
        finitary = FinitaryVeblenEncoder()
        binary = BinaryVeblenEncoder()

        for n in range(1, 17):
            self.assertEqual(finitary.ordinal_latex(n), binary.ordinal_latex(n))

        self.assertEqual(finitary.ordinal_latex(17), "\\Gamma_{0}")
        self.assertEqual(binary.ordinal_latex(17), "\\varphi_{\\omega}(0)")

    def test_argument_splitting(self) -> None:
        enc = FinitaryVeblenEncoder()
        p1 = enc.prime_helper.prime_at_index(1)
        p2 = enc.prime_helper.prime_at_index(2)
        p4 = enc.prime_helper.prime_at_index(4)
        p6 = enc.prime_helper.prime_at_index(6)
        p12 = enc.prime_helper.prime_at_index(12)

        self.assertEqual(
            enc._split_argument_codes(p1 * p2 * p4 * p6 * p12),
            {
                0: enc.prime_helper.prime_at_index(1),
                1: enc.prime_helper.prime_at_index(1) * enc.prime_helper.prime_at_index(2),
                2: enc.prime_helper.prime_at_index(1) * enc.prime_helper.prime_at_index(2),
            },
        )

    def test_fixed_point_dodging_prevents_binary_fragment_collapse(self) -> None:
        enc = FinitaryVeblenEncoder()
        self.assertEqual(enc.ordinal_latex(5), "\\varepsilon_{0}")
        # 31 is p_11. Index 11 has raw active child-code 5, so the naive term
        # omega^(epsilon_0) is shifted to omega^(epsilon_0+1).
        self.assertEqual(enc.ordinal_latex(31), "\\omega^{\\varepsilon_{0}+1}")
        self.assertNotEqual(enc.ordinal(31), enc.ordinal(5))

    def test_higher_support_fixed_point_dodging(self) -> None:
        next_gamma_fixed_point = self._term(ZERO, self._nat(1), self._nat(1))
        repaired = _argument_not_fixed_point_of((ZERO, self._nat(1)), next_gamma_fixed_point)
        self.assertEqual(repaired, self._sum(next_gamma_fixed_point, self._nat(1)))

    def test_higher_argument_fixed_point_dodging(self) -> None:
        enc = FinitaryVeblenEncoder()
        gamma0 = self._term(ZERO, ZERO, self._nat(1))

        with self.assertRaises(ValueError):
            Ordinal.from_terms([(Veblen((ZERO, gamma0)), 1)])

        self.assertEqual(
            enc.prime_index_ordinal_latex(101),
            "\\varphi_{\\Gamma_{0}}(1)",
        )
        self.assertEqual(
            enc.prime_index_ordinal_latex(202),
            "\\varphi_{\\Gamma_{0}}(2)",
        )

    def test_standard_finitary_gamma_boundary(self) -> None:
        enc = FinitaryVeblenEncoder()
        one = self._nat(1)
        two = self._nat(2)
        gamma0 = self._term(ZERO, ZERO, one)
        gamma1 = self._term(one, ZERO, one)
        phi_gamma0_1 = self._term(one, gamma0)
        phi_gamma0_2 = self._term(two, gamma0)

        self.assertLess(_cmp_ordinal(gamma0, phi_gamma0_1), 0)
        self.assertLess(_cmp_ordinal(phi_gamma0_1, gamma1), 0)
        self.assertEqual(enc.natural(phi_gamma0_1), enc.prime_helper.prime_at_index(101))
        self.assertEqual(enc.natural(phi_gamma0_2), enc.prime_helper.prime_at_index(202))
        self.assertEqual(enc.natural(gamma1), enc.prime_helper.prime_at_index(14))

    def test_tail_repair_roundtrip_on_argument_vectors(self) -> None:
        epsilon0 = self._term(ZERO, self._nat(1))
        gamma0 = self._term(ZERO, ZERO, self._nat(1))
        raw_vectors = [
            (ZERO,),
            (epsilon0,),
            (ZERO, gamma0),
            (epsilon0, ZERO, self._sum(gamma0, self._nat(2))),
        ]

        for raw in raw_vectors:
            repaired = _repair_fixed_point_tails(raw)
            self.assertEqual(_undo_fixed_point_tail_repairs(repaired), raw)
            self.assertEqual(_repair_fixed_point_tails(_undo_fixed_point_tail_repairs(repaired)), repaired)

    def test_fixed_point_repair_reduces_to_prefix_comparison(self) -> None:
        next_gamma_fixed_point = self._term(ZERO, self._nat(1), self._nat(1))
        epsilon0 = self._term(ZERO, self._nat(1))

        with self.assertRaises(ValueError):
            Ordinal.from_terms([(Veblen((epsilon0, ZERO)), 1)])
        self.assertTrue(_is_preferred_veblen(Veblen((epsilon0, self._nat(1)))))
        self.assertEqual(_argument_not_fixed_point_of((ZERO,), epsilon0), self._sum(epsilon0, self._nat(1)))
        self.assertEqual(_argument_not_fixed_point_of((self._nat(1),), epsilon0), epsilon0)
        self.assertEqual(
            _argument_not_fixed_point_of((ZERO, self._nat(1)), next_gamma_fixed_point),
            self._sum(next_gamma_fixed_point, self._nat(1)),
        )

    def test_strict_vnf_in_prefix(self) -> None:
        enc = FinitaryVeblenEncoder()
        for n in range(1, 1001):
            ordinal = enc.ordinal(n)
            for index, (veblen, coeff) in enumerate(ordinal.terms):
                self.assertGreaterEqual(coeff, 1, f"bad coefficient at n={n}")
                self.assertTrue(_is_preferred_veblen(veblen), f"nonpreferred term at n={n}: {veblen}")
                if index == 0:
                    continue
                prev_veblen, _ = ordinal.terms[index - 1]
                self.assertGreater(
                    _cmp_veblen(prev_veblen, veblen),
                    0,
                    f"non-decreasing principal terms at n={n} index={index}",
                )

    def test_comparator_properties_on_samples(self) -> None:
        enc = FinitaryVeblenEncoder()
        ordinals = [enc.ordinal(i) for i in range(1, 301)]

        sample = list(range(0, 300, 11))
        for i in sample:
            for j in sample:
                c1 = _cmp_ordinal(ordinals[i], ordinals[j])
                c2 = _cmp_ordinal(ordinals[j], ordinals[i])
                s1 = 0 if c1 == 0 else (1 if c1 > 0 else -1)
                s2 = 0 if c2 == 0 else (1 if c2 > 0 else -1)
                self.assertEqual(s1, -s2, f"antisymmetry failed for {(i + 1, j + 1)}")

        sample_trip = list(range(0, 300, 17))
        for i in sample_trip:
            for j in sample_trip:
                for k in sample_trip:
                    a = ordinals[i]
                    b = ordinals[j]
                    c = ordinals[k]
                    if _cmp_ordinal(a, b) < 0 and _cmp_ordinal(b, c) < 0:
                        self.assertLess(
                            _cmp_ordinal(a, c),
                            0,
                            f"transitivity failed for {(i + 1, j + 1, k + 1)}",
                        )

    def test_injective_on_prefix(self) -> None:
        enc = FinitaryVeblenEncoder()
        seen = {}
        for n in range(1, 1001):
            ordinal = enc.ordinal(n)
            self.assertNotIn(ordinal, seen, f"collision for {seen.get(ordinal)} and {n}")
            seen[ordinal] = n

    def test_decode_encode_roundtrip_on_prefix(self) -> None:
        enc = FinitaryVeblenEncoder()
        for n in range(1, 1001):
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_decode_encode_roundtrip_on_landmarks(self) -> None:
        enc = FinitaryVeblenEncoder()
        for n in [17, 41, 179, 431, 1231, 5903, 43591]:
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_encode_decode_roundtrip_on_constructed_canonical_ordinals(self) -> None:
        enc = FinitaryVeblenEncoder()
        one = self._nat(1)
        omega = self._term(one)
        epsilon0 = self._term(ZERO, one)
        gamma0 = self._term(ZERO, ZERO, one)

        cases = [
            ZERO,
            one,
            omega,
            epsilon0,
            gamma0,
            self._sum(epsilon0, omega),
            self._sum(epsilon0, epsilon0, omega),
            self._term(self._sum(epsilon0, one)),
            self._term(ZERO, self._sum(gamma0, one)),
            self._term(self._sum(epsilon0, one), epsilon0),
        ]
        for ordinal in cases:
            self.assertEqual(enc.ordinal(enc.natural(ordinal)), ordinal)


if __name__ == "__main__":
    unittest.main()
