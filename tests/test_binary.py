#!/usr/bin/env python3

import unittest

from binary import (
    BinaryVeblenEncoder,
    Ordinal,
    Phi,
    ZERO,
    _cmp_ordinal,
    _cmp_phi,
    _is_fixed_point_argument,
)


class BinaryVeblenMappingTests(unittest.TestCase):
    def _nat(self, n: int) -> Ordinal:
        if n < 0:
            raise ValueError("n must be >= 0")
        if n == 0:
            return ZERO
        return Ordinal.from_terms([(Phi(ZERO, ZERO), n)])

    def _sum(self, *ordinals: Ordinal) -> Ordinal:
        terms = []
        for ordinal in ordinals:
            terms.extend(ordinal.terms)
        return Ordinal.from_terms(terms)

    def _omega_pow(self, alpha: Ordinal) -> Ordinal:
        return Ordinal.from_terms([(Phi(ZERO, alpha), 1)])

    def _epsilon(self, alpha: Ordinal) -> Ordinal:
        return Ordinal.from_terms([(Phi(self._nat(1), alpha), 1)])

    def _zeta(self, alpha: Ordinal) -> Ordinal:
        return Ordinal.from_terms([(Phi(self._nat(2), alpha), 1)])

    def test_fixed_point_dodging_prevents_collapse(self) -> None:
        enc = BinaryVeblenEncoder()
        self.assertEqual(enc.ordinal(5).to_latex(), "\\varepsilon_{0}")
        # 31 is p_11. Index 11 has raw active child-code 5, so the naive term
        # omega^(epsilon_0) is shifted to omega^(epsilon_0+1).
        self.assertEqual(enc.ordinal(31).to_latex(), "\\omega^{\\varepsilon_{0}+1}")
        self.assertNotEqual(enc.ordinal(31), enc.ordinal(5))

    def test_strict_vnf_in_prefix(self) -> None:
        enc = BinaryVeblenEncoder()
        for n in range(1, 5001):
            ordinal = enc.ordinal(n)
            for index, (phi, coeff) in enumerate(ordinal.terms):
                self.assertGreaterEqual(coeff, 1, f"bad coefficient at n={n}")
                self.assertFalse(
                    _is_fixed_point_argument(phi.beta, phi.gamma),
                    f"fixed-point argument at n={n}: {phi}",
                )
                if index == 0:
                    continue
                prev_phi, _ = ordinal.terms[index - 1]
                self.assertGreater(
                    _cmp_phi(prev_phi, phi),
                    0,
                    f"non-decreasing principal terms at n={n} index={index}",
                )

    def test_comparator_properties_on_samples(self) -> None:
        enc = BinaryVeblenEncoder()
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
        enc = BinaryVeblenEncoder()
        for n in range(1, 1001):
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_encode_decode_roundtrip_on_constructed_canonical_ordinals(self) -> None:
        enc = BinaryVeblenEncoder()
        one = self._nat(1)
        epsilon0 = self._epsilon(ZERO)
        cases = [
            ZERO,
            one,
            self._omega_pow(one),
            epsilon0,
            self._sum(epsilon0, self._omega_pow(self._nat(2))),
            self._omega_pow(self._sum(epsilon0, one)),
        ]
        for ordinal in cases:
            self.assertEqual(enc.ordinal(enc.natural(ordinal)), ordinal)

    def test_rejects_non_vnf_fixed_point_argument(self) -> None:
        enc = BinaryVeblenEncoder()
        epsilon0 = enc.ordinal(5)
        with self.assertRaises(ValueError):
            Ordinal.from_terms([(Phi(ZERO, epsilon0), 1)])
        with self.assertRaises(ValueError):
            Ordinal(((Phi(ZERO, epsilon0), 1),))

    def test_large_prime_index_targets(self) -> None:
        enc = BinaryVeblenEncoder()

        one = self._nat(1)
        omega = self._omega_pow(one)
        epsilon0 = self._epsilon(ZERO)
        epsilon1 = self._epsilon(one)
        epsilon_omega = self._epsilon(omega)
        zeta0 = self._zeta(ZERO)

        epsilon1_plus_one = self._sum(epsilon1, one)
        zeta0_plus_two = self._sum(zeta0, self._nat(2))

        cases = [
            (31, self._omega_pow(epsilon1_plus_one)),
            (354, self._epsilon(zeta0_plus_two)),
            (341, self._omega_pow(self._sum(epsilon1, epsilon0))),
            (682, self._omega_pow(self._sum(epsilon1, epsilon0, one))),
            (6431, self._omega_pow(self._sum(zeta0, epsilon_omega))),
            (4307, self._omega_pow(self._sum(zeta0, self._omega_pow(self._sum(epsilon0, one))))),
        ]
        for index, expected_ordinal in cases:
            ordinal = Ordinal.from_terms([(enc._phi_from_index(index), 1)])
            self.assertEqual(ordinal, expected_ordinal)

if __name__ == "__main__":
    unittest.main()
