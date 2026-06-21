#!/usr/bin/env python3

import unittest

from transfinitary import (
    GAMMA0,
    MATRIX_ONE,
    ONE,
    TWO,
    ZERO,
    Matrix,
    Ordinal,
    TransfinitaryVeblenEncoder,
    _cmp_matrix,
    _cmp_ordinal,
    _is_preferred_matrix,
    _repair_fixed_point_tail,
    _undo_fixed_point_tail_repair,
)


class TransfinitaryVeblenMappingTests(unittest.TestCase):
    def _nat(self, n: int) -> Ordinal:
        if n < 0:
            raise ValueError("n must be >= 0")
        if n == 0:
            return ZERO
        return Ordinal.from_terms([(MATRIX_ONE, n)])

    def _term(self, *entries: tuple[Ordinal, Ordinal]) -> Ordinal:
        return Ordinal.from_terms([(Matrix(tuple(entries)), 1)])

    def _matrix(self, *entries: tuple[Ordinal, Ordinal]) -> Matrix:
        return Matrix(tuple(entries))

    def _sum(self, *ordinals: Ordinal) -> Ordinal:
        terms = []
        for ordinal in ordinals:
            terms.extend(ordinal.terms)
        return Ordinal.from_terms(terms)

    def test_binary_fragment_renders_below_gamma0(self) -> None:
        omega = self._term((ZERO, ONE))
        epsilon0 = self._term((ONE, ONE))
        zeta0 = self._term((ONE, TWO))
        phi_omega_0 = self._term((ONE, omega))

        self.assertEqual(omega.to_latex(), "\\omega")
        self.assertEqual(self._term((ZERO, self._nat(2))).to_latex(), "\\omega^{2}")
        self.assertEqual(epsilon0.to_latex(), "\\varepsilon_{0}")
        self.assertEqual(zeta0.to_latex(), "\\zeta_{0}")
        self.assertEqual(phi_omega_0.to_latex(), "\\varphi_{\\omega}(0)")

        self.assertLess(_cmp_ordinal(omega, epsilon0), 0)
        self.assertLess(_cmp_ordinal(epsilon0, zeta0), 0)
        self.assertLess(_cmp_ordinal(zeta0, phi_omega_0), 0)
        self.assertLess(_cmp_ordinal(phi_omega_0, GAMMA0), 0)

    def test_transfinitary_terms_render_above_gamma0(self) -> None:
        omega = self._term((ZERO, ONE))
        svo = self._term((omega, ONE))
        lvo_approximant = self._term((svo, ONE))
        omega_svo_plus_one = self._term((ZERO, self._sum(svo, ONE)))
        gamma_gamma0 = self._term((TWO, ONE), (ZERO, GAMMA0))
        epsilon_gamma0_plus_one = self._term((ONE, ONE), (ZERO, self._sum(GAMMA0, ONE)))
        zeta_gamma0_plus_one = self._term((ONE, TWO), (ZERO, self._sum(GAMMA0, ONE)))
        svo_latex = "\\begin{pmatrix}1\\\\\\omega\\end{pmatrix}"

        self.assertEqual(GAMMA0.to_latex(), "\\Gamma_{0}")
        self.assertEqual(
            omega_svo_plus_one.to_latex(),
            f"\\begin{{pmatrix}}{svo_latex}+1\\\\0\\end{{pmatrix}}",
        )
        self.assertEqual(gamma_gamma0.to_latex(), "\\Gamma_{\\Gamma_{0}}")
        self.assertEqual(epsilon_gamma0_plus_one.to_latex(), "\\varepsilon_{\\Gamma_{0}+1}")
        self.assertEqual(zeta_gamma0_plus_one.to_latex(), "\\zeta_{\\Gamma_{0}+1}")
        self.assertEqual(
            lvo_approximant.to_latex(),
            f"\\begin{{pmatrix}}1\\\\{svo_latex}\\end{{pmatrix}}",
        )

        self.assertLess(_cmp_ordinal(GAMMA0, svo), 0)
        self.assertLess(_cmp_ordinal(svo, lvo_approximant), 0)

    def test_nested_transfinitary_position_decodes_by_column_index(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        omega = self._term((ZERO, ONE))
        svo = self._term((omega, ONE))
        lvo_approximant = self._term((svo, ONE))

        self.assertEqual(enc.prime_index_ordinal(367), lvo_approximant)
        self.assertEqual(enc.natural(lvo_approximant), 2477)

    def test_rejects_nonpreferred_fixed_point_descriptors(self) -> None:
        epsilon0 = self._term((ONE, ONE))

        with self.assertRaises(ValueError):
            Ordinal.from_terms([(self._matrix((ZERO, epsilon0)), 1)])

        with self.assertRaises(ValueError):
            Ordinal.from_terms([(self._matrix((ONE, GAMMA0)), 1)])

    def test_tail_repair_shifts_entire_excluded_fiber(self) -> None:
        epsilon0 = self._term((ONE, ONE))
        epsilon0_plus_one = self._sum(epsilon0, ONE)

        raw_epsilon0 = self._matrix((ZERO, epsilon0))
        raw_epsilon0_plus_one = self._matrix((ZERO, epsilon0_plus_one))
        repaired_epsilon0 = _repair_fixed_point_tail(raw_epsilon0)
        repaired_epsilon0_plus_one = _repair_fixed_point_tail(raw_epsilon0_plus_one)

        self.assertEqual(
            Ordinal.from_terms([(repaired_epsilon0, 1)]).to_latex(),
            "\\omega^{\\varepsilon_{0}+1}",
        )
        self.assertEqual(
            Ordinal.from_terms([(repaired_epsilon0_plus_one, 1)]).to_latex(),
            "\\omega^{\\varepsilon_{0}+2}",
        )
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_epsilon0), raw_epsilon0)
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_epsilon0_plus_one), raw_epsilon0_plus_one)

        raw_gamma0 = self._matrix((ONE, GAMMA0))
        raw_gamma0_plus_one = self._matrix((ONE, GAMMA0), (ZERO, ONE))
        repaired_gamma0 = _repair_fixed_point_tail(raw_gamma0)
        repaired_gamma0_plus_one = _repair_fixed_point_tail(raw_gamma0_plus_one)

        self.assertEqual(
            Ordinal.from_terms([(repaired_gamma0, 1)]).to_latex(),
            "\\varphi_{\\Gamma_{0}}(1)",
        )
        self.assertEqual(
            Ordinal.from_terms([(repaired_gamma0_plus_one, 1)]).to_latex(),
            "\\varphi_{\\Gamma_{0}}(2)",
        )
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_gamma0), raw_gamma0)
        self.assertEqual(_undo_fixed_point_tail_repair(repaired_gamma0_plus_one), raw_gamma0_plus_one)

    def test_initial_prime_index_targets(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        cases = [
            (1, "1"),
            (2, "\\omega"),
            (3, "\\varepsilon_{0}"),
            (4, "\\omega^{2}"),
            (5, "\\omega^{\\omega}"),
            (6, "\\varepsilon_{1}"),
            (7, "\\Gamma_{0}"),
            (9, "\\zeta_{0}"),
            (11, "\\begin{pmatrix}1\\\\\\omega\\end{pmatrix}"),
            (13, "\\varphi_{\\omega}(0)"),
            (17, "\\omega^{\\varepsilon_{0}+1}"),
            (22, "\\begin{pmatrix}1&1\\\\\\omega&0\\end{pmatrix}"),
        ]
        for index, expected in cases:
            self.assertEqual(enc.prime_index_ordinal_latex(index), expected)

    def test_entry_splitting(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        p1 = enc.prime_helper.prime_at_index(1)
        p2 = enc.prime_helper.prime_at_index(2)
        p4 = enc.prime_helper.prime_at_index(4)
        p6 = enc.prime_helper.prime_at_index(6)
        p12 = enc.prime_helper.prime_at_index(12)

        self.assertEqual(
            enc._split_entry_codes(p1 * p2 * p4 * p6 * p12),
            {
                1: enc.prime_helper.prime_at_index(1),
                2: enc.prime_helper.prime_at_index(1) * enc.prime_helper.prime_at_index(2),
                4: enc.prime_helper.prime_at_index(1) * enc.prime_helper.prime_at_index(2),
            },
        )
        self.assertEqual(enc._encode_column_factor_index(4, 2), 12)
        self.assertEqual(enc._split_column_factor_index(12), (4, 2))

    def test_column_lvo_inverse_examples(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        omega = self._term((ZERO, ONE))
        epsilon0 = self._term((ONE, ONE))
        epsilon1 = self._term((ONE, ONE), (ZERO, ONE))
        zeta0 = self._term((ONE, TWO))
        gamma1 = self._term((TWO, ONE), (ZERO, ONE))
        svo = self._term((omega, ONE))
        omega_epsilon0_plus_one = self._term((ZERO, self._sum(epsilon0, ONE)))
        phi_epsilon0_omega_epsilon0_plus_one = self._term(
            (ONE, epsilon0),
            (ZERO, omega_epsilon0_plus_one),
        )

        cases = [
            (73, self._term((ZERO, self._sum(epsilon1, ONE)))),
            (2482, self._term((ZERO, self._sum(epsilon1, epsilon0, ONE)))),
            (43357, self._term((ZERO, self._sum(zeta0, omega_epsilon0_plus_one)))),
            (1362, self._term((ONE, ONE), (ZERO, self._sum(zeta0, TWO)))),
            (
                7507903,
                self._term(
                    (ONE, omega),
                    (ZERO, self._sum(phi_epsilon0_omega_epsilon0_plus_one, ONE)),
                ),
            ),
            (871, self._term((ONE, omega), (ZERO, self._sum(GAMMA0, ONE)))),
            (163, self._term((ONE, GAMMA0), (ZERO, ONE))),
            (489, self._term((ONE, self._sum(GAMMA0, ONE)))),
            (43847, self._term((ONE, GAMMA0), (ZERO, self._sum(gamma1, ONE)))),
            (938, self._term((TWO, ONE), (ZERO, self._sum(GAMMA0, ONE)))),
            (2681, self._term((TWO, self._sum(GAMMA0, ONE)))),
            (
                2289,
                self._term((TWO, ONE), (ONE, ONE), (ZERO, self._sum(svo, ONE))),
            ),
            (1199, self._term((omega, ONE), (ZERO, svo))),
            (
                1320,
                self._term((omega, ONE), (ONE, ONE), (ZERO, self._sum(omega, self._nat(3)))),
            ),
            (77, self._term((omega, ONE), (TWO, ONE))),
            (829, self._term((omega, svo))),
        ]

        for expected_index, expected_ordinal in cases:
            with self.subTest(index=expected_index):
                self.assertEqual(enc.prime_index_ordinal(expected_index), expected_ordinal)
                matrix, coeff = expected_ordinal.terms[0]
                self.assertEqual(coeff, 1)
                self.assertEqual(enc._index_from_matrix(matrix), expected_index)

    def test_strict_vnf_in_prefix(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        for n in range(1, 1001):
            ordinal = enc.ordinal(n)
            for index, (matrix, coeff) in enumerate(ordinal.terms):
                self.assertGreaterEqual(coeff, 1, f"bad coefficient at n={n}")
                self.assertTrue(_is_preferred_matrix(matrix), f"nonpreferred term at n={n}: {matrix}")
                if index == 0:
                    continue
                previous_matrix, _ = ordinal.terms[index - 1]
                self.assertGreater(
                    _cmp_matrix(previous_matrix, matrix),
                    0,
                    f"non-decreasing principal terms at n={n} index={index}",
                )

    def test_comparator_properties_on_samples(self) -> None:
        enc = TransfinitaryVeblenEncoder()
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
        enc = TransfinitaryVeblenEncoder()
        seen = {}
        for n in range(1, 1001):
            ordinal = enc.ordinal(n)
            self.assertNotIn(ordinal, seen, f"collision for {seen.get(ordinal)} and {n}")
            seen[ordinal] = n

    def test_decode_encode_roundtrip_on_prefix(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        for n in range(1, 2001):
            self.assertEqual(enc.natural(enc.ordinal(n)), n)

    def test_encode_decode_roundtrip_on_constructed_canonical_ordinals(self) -> None:
        enc = TransfinitaryVeblenEncoder()
        omega = self._term((ZERO, ONE))
        epsilon0 = self._term((ONE, ONE))
        zeta0 = self._term((ONE, TWO))
        phi_omega_0 = self._term((ONE, omega))
        svo = self._term((omega, ONE))

        cases = [
            ZERO,
            ONE,
            omega,
            epsilon0,
            zeta0,
            phi_omega_0,
            GAMMA0,
            svo,
            self._sum(epsilon0, omega),
            self._sum(svo, GAMMA0, omega),
        ]
        for ordinal in cases:
            self.assertEqual(enc.ordinal(enc.natural(ordinal)), ordinal)


if __name__ == "__main__":
    unittest.main()
