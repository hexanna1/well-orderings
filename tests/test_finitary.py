#!/usr/bin/env python3

import unittest

from finitary import (
    FinitaryVeblenEncoder,
    Ordinal,
    VEBLEN_ONE,
    Veblen,
    ZERO,
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
            ordinal = Ordinal.from_terms([(enc._veblen_from_index(index), 1)])
            self.assertEqual(ordinal.to_latex(), expected)

    def test_fixed_point_dodging_prevents_binary_fragment_collapse(self) -> None:
        enc = FinitaryVeblenEncoder()
        self.assertEqual(enc.ordinal(5).to_latex(), "\\varepsilon_{0}")
        # 31 is p_11. Index 11 has raw active child-code 5, so the naive term
        # omega^(epsilon_0) is shifted to omega^(epsilon_0+1).
        self.assertEqual(enc.ordinal(31).to_latex(), "\\omega^{\\varepsilon_{0}+1}")
        self.assertNotEqual(enc.ordinal(31), enc.ordinal(5))

    def test_higher_argument_fixed_point_dodging(self) -> None:
        enc = FinitaryVeblenEncoder()
        gamma0 = self._term(ZERO, ZERO, self._nat(1))

        with self.assertRaises(ValueError):
            Ordinal.from_terms([(Veblen((ZERO, gamma0)), 1)])

        self.assertEqual(
            Ordinal.from_terms([(enc._veblen_from_index(101), 1)]).to_latex(),
            "\\varphi_{\\Gamma_{0}}(1)",
        )
        self.assertEqual(
            Ordinal.from_terms([(enc._veblen_from_index(202), 1)]).to_latex(),
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
                self.assertEqual((c1 > 0) - (c1 < 0), -((c2 > 0) - (c2 < 0)))

        sample = list(range(0, 300, 17))
        for i in sample:
            for j in sample:
                for k in sample:
                    if (
                        _cmp_ordinal(ordinals[i], ordinals[j]) < 0
                        and _cmp_ordinal(ordinals[j], ordinals[k]) < 0
                    ):
                        self.assertLess(_cmp_ordinal(ordinals[i], ordinals[k]), 0)

    def test_decode_encode_roundtrip_on_prefix(self) -> None:
        enc = FinitaryVeblenEncoder()
        for n in range(1, 1001):
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_decode_encode_roundtrip_on_large_landmarks(self) -> None:
        enc = FinitaryVeblenEncoder()
        for n in (1231, 5903, 43591):
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
