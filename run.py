#!/usr/bin/env python3
"""Entry point for the Newsletter Digest Agent."""

import argparse
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Newsletter Digest Agent — fetch, rank, and email your newsletters.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help=(
            "Run the full pipeline but print the HTML digest to stdout "
            "instead of sending an email. Useful for testing."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        from agent import main as run_agent  # noqa: PLC0415

        run_agent(dry_run=args.dry_run)
    except Exception as exc:
        import logging
        import traceback

        logging.basicConfig(level="ERROR")
        logging.getLogger(__name__).error(
            "Unhandled exception: %s\n%s", exc, traceback.format_exc()
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
