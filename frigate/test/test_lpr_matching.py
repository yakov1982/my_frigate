import unittest
from types import SimpleNamespace

from frigate.data_processing.common.license_plate.mixin import LicensePlateProcessingMixin


def _build_dummy(match_distance: int = 1) -> LicensePlateProcessingMixin:
    dummy = LicensePlateProcessingMixin.__new__(LicensePlateProcessingMixin)
    dummy.lpr_config = SimpleNamespace(match_distance=match_distance)
    return dummy


class TestLprMatching(unittest.TestCase):
    def test_literal_pattern_uses_match_distance(self) -> None:
        dummy = _build_dummy(match_distance=1)
        self.assertTrue(dummy._plate_pattern_matches("ABC1234", "ABC1235"))

    def test_regex_pattern_does_not_use_match_distance(self) -> None:
        dummy = _build_dummy(match_distance=5)
        self.assertFalse(dummy._plate_pattern_matches("ABC[0-9]{4}", "ABCX234"))

    def test_blacklist_and_whitelist_matching_uses_first_label(self) -> None:
        dummy = _build_dummy(match_distance=0)
        match = dummy._get_plate_match_label(
            {"Residents": ["ABC1234"], "Watchlist": ["ZZZ9999"]}, "ABC1234"
        )
        self.assertEqual(match, "Residents")


if __name__ == "__main__":
    unittest.main(verbosity=2)
