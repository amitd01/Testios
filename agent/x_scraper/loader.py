"""Load X scraper CSV output into Newsletter objects for the digest pipeline."""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from urllib.parse import urlparse

from ..fetcher import resolve_url
from ..models import Newsletter

log = logging.getLogger(__name__)

# Long-form tweets (threads, essays) with no external link are treated as
# first-class articles when they exceed this word threshold.
LONG_TWEET_MIN_WORDS = 150


def load_x_data(
    bookmarks_csv: str,
    likes_csv: str,
    used_urls: set[str],
) -> list[Newsletter]:
    """Read scraper CSVs and return Newsletter objects with unused links.

    Three-path decision per tweet:
    1. Has embedded links → use those (existing behaviour, deduped against used_urls).
    2. No links but text ≥ LONG_TWEET_MIN_WORDS → treat tweet URL as article URL.
    3. Short tweet, no link → drop.

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
                tweet_url = row.get("url", "")
                text = row.get("text", "")
                author = row.get("author", "Unknown").replace("\n", " ")

                if embedded.strip():
                    links = [l.strip() for l in embedded.split(",") if l.strip()]
                    # Resolve t.co shortlinks to real URLs for proper dedup and
                    # so Claude can see the actual article domain/title.
                    resolved = []
                    for l in links:
                        domain = urlparse(l).netloc.lstrip("www.")
                        if "t.co" in domain:
                            real = resolve_url(l)
                            log.debug("Resolved t.co %s → %s", l, real)
                            resolved.append(real)
                        else:
                            resolved.append(l)
                    # Filter out links already used in past digests
                    new_links = [l for l in resolved if l not in used_urls]
                    if not new_links:
                        log.debug(
                            "All links from tweet %s already used — skipping.",
                            tweet_url,
                        )
                        continue
                elif len(text.split()) >= LONG_TWEET_MIN_WORDS:
                    # Long-form tweet with no external link — use tweet URL itself
                    if tweet_url in used_urls:
                        log.debug(
                            "Long-form tweet %s already used — skipping.", tweet_url
                        )
                        continue
                    new_links = [tweet_url]
                    log.debug(
                        "Long-form tweet (%d words) loaded as article: %s",
                        len(text.split()),
                        tweet_url,
                    )
                else:
                    continue  # short tweet, no link → drop

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
