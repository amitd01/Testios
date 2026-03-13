"""Load X scraper CSV output into Newsletter objects for the digest pipeline."""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from urllib.parse import urlparse

from ..fetcher import resolve_url
from ..models import Newsletter

log = logging.getLogger(__name__)

# Long-form tweets (threads, essays) with no external link are treated as
# first-class articles when they exceed this word threshold.
LONG_TWEET_MIN_WORDS = 150


def _parse_timestamp(ts: str) -> datetime | None:
    """Parse ISO-8601 tweet timestamp (e.g. '2026-03-13T09:59:28.000Z') → UTC datetime."""
    if not ts:
        return None
    try:
        # Strip trailing milliseconds + Z, then re-attach UTC
        clean = ts.rstrip("Z").split(".")[0]
        return datetime.fromisoformat(clean).replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def load_x_data(
    bookmarks_csv: str,
    likes_csv: str,
    used_urls: set[str],
    bookmark_lookback_days: int = 14,
    fetch_fn: Callable[[str], tuple[str, str]] | None = None,
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
        bookmark_lookback_days: Skip bookmarks whose tweet timestamp is older than this
            many days. Prevents stale 2023-2024 bookmarks from consuming Claude context
            on every run. Set to 0 to disable. Likes are already filtered by the scraper.
        fetch_fn: Optional callable(url) → (title, body). When provided, X items with
            external links have their body replaced with the fetched article text, giving
            Claude real content to evaluate rather than just the 140-280 char tweet text.

    Returns:
        List of Newsletter objects ready for the ranking pipeline.
    """
    newsletters: list[Newsletter] = []

    # Compute bookmark age cutoff (UTC)
    bookmark_cutoff: datetime | None = None
    if bookmark_lookback_days > 0:
        bookmark_cutoff = datetime.now(tz=timezone.utc) - timedelta(days=bookmark_lookback_days)
        log.debug(
            "Bookmark date filter: skipping tweets older than %s (%d days).",
            bookmark_cutoff.strftime("%Y-%m-%d"),
            bookmark_lookback_days,
        )

    for csv_path, source_label, apply_date_filter in [
        (bookmarks_csv, "X Bookmark", True),   # bookmarks accumulate forever → filter
        (likes_csv,     "X Like",     False),  # likes already filtered by scraper
    ]:
        if not Path(csv_path).exists():
            log.info("X data file not found: %s — skipping.", csv_path)
            continue

        count = 0
        stale_skipped = 0
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # ── Bookmark staleness filter ─────────────────────────────────
                if apply_date_filter and bookmark_cutoff is not None:
                    tweet_ts = _parse_timestamp(row.get("timestamp", ""))
                    if tweet_ts is not None and tweet_ts < bookmark_cutoff:
                        stale_skipped += 1
                        log.debug(
                            "Skipping stale bookmark from %s: %s",
                            tweet_ts.strftime("%Y-%m-%d"),
                            row.get("url", ""),
                        )
                        continue

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

                    # ── Fetch article body for external links ─────────────────
                    # By default the tweet body is just 140-280 chars of tweet text,
                    # which gives Claude too little content to score properly.
                    # Fetching the linked article provides full context, matching the
                    # quality of how email newsletters are processed.
                    body = text  # fallback: raw tweet text
                    fetched_title = ""
                    if fetch_fn is not None:
                        for link in new_links:
                            link_domain = urlparse(link).netloc.lstrip("www.")
                            # Skip social/video platforms (fetch_article also skips these,
                            # but short-circuit here to save the function call overhead).
                            if any(d in link_domain for d in ("twitter.com", "x.com", "youtu")):
                                continue
                            ft, fb = fetch_fn(link)
                            if fb:
                                fetched_title = ft or ""
                                body = fb
                                log.debug(
                                    "Fetched article body (%d chars) for X item: %s",
                                    len(body),
                                    link,
                                )
                                break  # use the first successfully fetched article body

                    newsletters.append(
                        Newsletter(
                            id=f"x:{tweet_url}",
                            subject=f"[{source_label}] {fetched_title or author}",
                            sender=f"{author} (via {source_label})",
                            date=row.get("timestamp", ""),
                            body=body,
                            links=new_links,
                        )
                    )
                    count += 1

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
                    newsletters.append(
                        Newsletter(
                            id=f"x:{tweet_url}",
                            subject=f"[{source_label}] {author}",
                            sender=f"{author} (via {source_label})",
                            date=row.get("timestamp", ""),
                            body=text,
                            links=new_links,
                        )
                    )
                    count += 1

                else:
                    continue  # short tweet, no link → drop

        if stale_skipped:
            log.info(
                "Skipped %d stale bookmark(s) older than %d days from %s.",
                stale_skipped,
                bookmark_lookback_days,
                csv_path,
            )
        log.info("Loaded %d tweets with new links from %s.", count, csv_path)

    return newsletters
