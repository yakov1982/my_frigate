#!/usr/bin/env python3

from __future__ import annotations

import argparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Минимальный пример проекта в Git.")
    parser.add_argument("--name", default="Git", help="Кого поприветствовать.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print(f"Привет, {args.name}!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
