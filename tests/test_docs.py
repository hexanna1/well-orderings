import unittest
from pathlib import Path

from encoder_registry import ENCODER_SPECS
from ordinal_bundle import BUNDLE_MAGIC, OrdinalSkeleton, decode_bundle, encode_bundle


DATA = Path(__file__).resolve().parents[1] / "docs" / "data"


class WebsiteRowDataTests(unittest.TestCase):
    def test_encoder_bundles_are_complete_and_well_formed(self) -> None:
        for spec in ENCODER_SPECS.values():
            path = DATA / spec.bundle_filename
            bundle = path.read_bytes()
            skeleton = decode_bundle(bundle)
            self.assertEqual(bundle[:4], BUNDLE_MAGIC)
            self.assertEqual(skeleton.maximum, 100000)
            self.assertEqual(len(skeleton.ordinal_ranks), 9592)
            self.assertEqual(set(skeleton.ordinal_ranks), set(range(9592)))
            self.assertTrue(all(height > 0 for height in skeleton.ordinal_heights))
            self.assertEqual(
                skeleton.admissible_raw_codes is not None,
                spec.name in {"buchholz_1", "buchholz", "ebocf"},
            )

    def test_bundle_round_trip(self) -> None:
        rows = [(2, "1"), (3, r"\omega"), (5, r"\varphi_{1}(0)")]
        heights = [30, 31, 32]
        encoded = encode_bundle(
            [number for number, _latex in rows],
            heights,
            5,
            [1, 3, 4],
        )
        self.assertEqual(encoded[:4], BUNDLE_MAGIC)
        self.assertEqual(
            decode_bundle(encoded),
            OrdinalSkeleton(
                maximum=5,
                ordinal_ranks=(0, 1, 2),
                ordinal_heights=(30, 31, 32),
                admissible_raw_codes=(1, 3, 4),
            ),
        )


if __name__ == "__main__":
    unittest.main()
