import unittest

from frigate.data_processing.common.license_plate.matching import (
    get_plate_match_label,
    plate_pattern_matches,
)


class TestLprMatching(unittest.TestCase):
    def test_literal_pattern_uses_match_distance(self) -> None:
        self.assertTrue(
            plate_pattern_matches("ABC1234", "ABC1235", match_distance=1)
        )

    def test_regex_pattern_does_not_use_match_distance(self) -> None:
        self.assertFalse(
            plate_pattern_matches("ABC[0-9]{4}", "ABCX234", match_distance=5)
        )

    def test_blacklist_and_whitelist_matching_uses_first_label(self) -> None:
        match = get_plate_match_label(
            {"Residents": ["ABC1234"], "Watchlist": ["ZZZ9999"]},
            "ABC1234",
            match_distance=0,
        )
        self.assertEqual(match, "Residents")


if __name__ == "__main__":
    unittest.main(verbosity=2)
