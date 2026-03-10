#!/usr/bin/env python3
"""Standalone entry point for X/Twitter scraping (Phase 1 of the pipeline).

Run this before run.py to populate bookmarks.csv and likes.csv.
The newsletter digest pipeline will automatically pick up the CSVs.

Usage:
    python run_scraper.py              # Opens browser for manual login if needed
    python run_scraper.py --headless   # Headless mode (requires saved session)
"""

import argparse
import asyncio


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape X bookmarks and likes to CSV."
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser in headless mode (requires saved state.json)",
    )
    args = parser.parse_args()

    from agent.x_scraper.scraper import main as scrape_main

    asyncio.run(scrape_main(headless=args.headless))


if __name__ == "__main__":
    main()
