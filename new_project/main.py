#!/usr/bin/env python3
"""Simple CLI app for the new project."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Print a greeting and UTC time.")
    parser.add_argument(
        "--name",
        default="World",
        help="Name used in the greeting.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"Hello, {args.name}!")
    print(f"UTC time: {now_utc}")


if __name__ == "__main__":
    main()
