import unittest
from pathlib import Path

from encoder_registry import ENCODER_SPECS
from ordinal_bundle import BUNDLE_MAGIC, decode_bundle, encode_bundle, encode_latex


DOCS = Path(__file__).resolve().parents[1] / "docs"


class WebsiteRowDataTests(unittest.TestCase):
    def test_encoder_bundles_are_complete_and_well_formed(self) -> None:
        expected_numbers = None
        for spec in ENCODER_SPECS.values():
            path = DOCS / spec.bundle_filename
            bundle = path.read_bytes()
            rows = decode_bundle(bundle)
            numbers = {number for number, _height, _latex in rows}
            self.assertEqual(bundle[:4], BUNDLE_MAGIC)
            self.assertEqual(len(rows), 5133)
            self.assertEqual(len(numbers), len(rows))
            self.assertTrue(all(height > 0 for _number, height, _latex in rows))
            if expected_numbers is None:
                expected_numbers = numbers
            else:
                self.assertEqual(numbers, expected_numbers)

    def test_bundle_round_trip(self) -> None:
        rows = [(2, "1"), (3, r"\omega"), (5, r"\varphi_{1}(0)")]
        heights = [30, 31, 32]
        encoded = encode_bundle(rows, heights)
        self.assertEqual(encoded[:4], BUNDLE_MAGIC)
        self.assertLess(len(encode_latex(rows[-1][1])), len(rows[-1][1]))
        self.assertEqual(
            decode_bundle(encoded),
            [(number, height, latex) for (number, latex), height in zip(rows, heights, strict=True)],
        )


if __name__ == "__main__":
    unittest.main()
