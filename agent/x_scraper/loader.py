"""Load X scraper CSV output into Newsletter objects for the digest pipeline."""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from ..models import Newsletter

log = logging.getLogger(__name__)


def load_x_data(
    bookmarks_csv: str,
    likes_csv: str,
    used_urls: set[str],
) -> list[Newsletter]:
    """Read scraper CSVs and return Newsletter objects with unused links.

    Tweets whose embedded links have *all* already appeared in past
    digests are skipped entirely.

    Args:
        bookmarks_csv: Path to bookmarks.csv.
        likes_csv: Path to likes.csv.
        used_urls: URLs already included in previous digests.

    Returns:
        List of Newsletter objects ready for the ranking pipeline.
    """
    newsletters: list[Newsletter] = []

    for csv_path, source_label in [
        (bookmarks_csv, "X Bookmark"),
        (likes_csv, "X Like"),
    ]:
        if not Path(csv_path).exists():
            log.info("X data file not found: %s — skipping.", csv_path)
            continue

        count = 0
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                embedded = row.get("embedded_links", "")
                if not embedded.strip():
                    continue

                links = [l.strip() for l in embedded.split(",") if l.strip()]
                # Filter out links already used in past digests
                new_links = [l for l in links if l not in used_urls]

                if not new_links:
                    log.debug(
                        "All links from tweet %s already used — skipping.",
                        row.get("url", ""),
                    )
                    continue

                tweet_url = row.get("url", "")
                author = row.get("author", "Unknown").replace("\n", " ")

                newsletters.append(
                    Newsletter(
                        id=f"x:{tweet_url}",
                        subject=f"[{source_label}] {author}",
                        sender=f"{author} (via {source_label})",
                        date=row.get("timestamp", ""),
                        body=row.get("text", ""),
                        links=new_links,
                    )
                )
                count += 1

        log.info("Loaded %d tweets with new links from %s.", count, csv_path)

    return newsletters
