"""Load X scraper CSV output into ArticleCandidate objects for the digest pipeline.

Tweet classification (Step 2 — EXPAND)
----------------------------------------
Each tweet row is classified into one of three types:

  Type A — Single external link
      The tweet has exactly one non-x.com / non-twitter.com link.
      fetch_fn is called to retrieve the full article body.
      → produces 1 ArticleCandidate

  Type B — Multiple external links (aggregator tweet)
      The tweet embeds 2+ non-x.com links.
      fetch_fn is called for each link.
      → produces N ArticleCandidates (one per successfully fetched link)

  Type C — Long-form tweet (no external links)
      The tweet has no external links and its text is ≥ LONG_TWEET_MIN_WORDS words.
      The tweet text itself is the article body; the tweet URL is the article URL.
      → produces 1 ArticleCandidate

  Short tweet with no usable link → dropped (0 candidates).

Deduplication
--------------
Dedup is performed at the **tweet URL** level (not the article URL level).
The caller passes ``considered_tweet_urls`` — a set of tweet URLs that have
already entered the pipeline in a previous run.  Any tweet whose URL appears in
this set is skipped immediately; its articles are never fetched or scored again.

Article-level URL dedup (``sent_digests.json`` 7-day window) is applied by
``agent/__init__.py`` after this function returns.
"""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from ..fetcher import resolve_url
from ..models import ArticleCandidate

log = logging.getLogger(__name__)

# Long-form tweet minimum word count to qualify as a Type C article.
LONG_TWEET_MIN_WORDS = 200

# Domains whose links are X / Twitter posts — not treated as external articles.
_X_DOMAINS = frozenset(["twitter.com", "x.com"])

# Max chars of tweet body forwarded for Type C candidates (no fetch needed).
MAX_BODY_CHARS_TWEET = 3000


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_timestamp(ts: str) -> datetime | None:
    """Parse ISO-8601 tweet timestamp (e.g. '2026-03-13T09:59:28.000Z') → UTC datetime."""
    if not ts:
        return None
    try:
        clean = ts.rstrip("Z").split(".")[0]
        return datetime.fromisoformat(clean).replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def _is_x_domain(url: str) -> bool:
    """Return True if *url* points to Twitter / X."""
    try:
        host = urlparse(url).netloc.lstrip("www.").lower()
    except Exception:
        return False
    return any(host == d or host.endswith("." + d) for d in _X_DOMAINS)


def _resolve_links(raw_links: list[str]) -> list[str]:
    """Resolve t.co shortlinks to real URLs; leave other URLs unchanged."""
    resolved: list[str] = []
    for link in raw_links:
        try:
            domain = urlparse(link).netloc.lstrip("www.")
        except Exception:
            domain = ""
        if "t.co" in domain:
            real = resolve_url(link)
            log.debug("Resolved t.co %s → %s", link, real)
            resolved.append(real)
        else:
            resolved.append(link)
    return resolved


# ── Public loader ─────────────────────────────────────────────────────────────


def load_x_data(
    bookmarks_csv: str,
    likes_csv: str,
    considered_tweet_urls: set[str],
    bookmark_lookback_days: int = 14,
    fetch_fn: Callable[[str], tuple[str, str]] | None = None,
) -> list[ArticleCandidate]:
    """Read scraper CSVs and return ArticleCandidate objects.

    Tweet-URL dedup gate
    --------------------
    Tweets whose URL appears in *considered_tweet_urls* are skipped entirely;
    their linked articles are never fetched or scored.  This is a permanent
    filter — once a tweet enters the pipeline it is never reprocessed.

    Args:
        bookmarks_csv:         Path to bookmarks.csv exported by the scraper.
        likes_csv:             Path to likes.csv exported by the scraper.
        considered_tweet_urls: Set of tweet URLs already processed in past runs.
        bookmark_lookback_days: Skip bookmarks whose timestamp is older than
                               this many days.  Set to 0 to disable.
        fetch_fn:              Optional callable ``(url) → (title, body)``.
                               When provided, external links are fetched for
                               Types A and B to get full article content.

    Returns:
        List of ArticleCandidate objects ready for the scoring pipeline.
    """
    candidates: list[ArticleCandidate] = []

    # Compute bookmark age cutoff (UTC)
    bookmark_cutoff: datetime | None = None
    if bookmark_lookback_days > 0:
        bookmark_cutoff = datetime.now(tz=timezone.utc) - timedelta(
            days=bookmark_lookback_days
        )
        log.debug(
            "Bookmark date filter: skipping tweets older than %s (%d days).",
            bookmark_cutoff.strftime("%Y-%m-%d"),
            bookmark_lookback_days,
        )

    for csv_path, source_label, apply_date_filter in [
        (bookmarks_csv, "X Bookmark", True),   # bookmarks accumulate → filter
        (likes_csv,     "X Like",     False),  # likes already filtered by scraper
    ]:
        if not Path(csv_path).exists():
            log.info("X data file not found: %s — skipping.", csv_path)
            continue

        tweet_count = 0
        stale_skipped = 0
        considered_skipped = 0

        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                tweet_url = row.get("url", "")
                text = row.get("text", "")
                author = row.get("author", "Unknown").replace("\n", " ")
                embedded_raw = row.get("embedded_links", "")
                timestamp = row.get("timestamp", "")

                # ── Tweet-URL dedup ───────────────────────────────────────────
                if tweet_url in considered_tweet_urls:
                    considered_skipped += 1
                    log.debug(
                        "Skipping already-considered tweet: %s", tweet_url
                    )
                    continue

                # ── Bookmark staleness filter ─────────────────────────────────
                if apply_date_filter and bookmark_cutoff is not None:
                    tweet_ts = _parse_timestamp(timestamp)
                    if tweet_ts is not None and tweet_ts < bookmark_cutoff:
                        stale_skipped += 1
                        log.debug(
                            "Skipping stale bookmark from %s: %s",
                            tweet_ts.strftime("%Y-%m-%d"),
                            tweet_url,
                        )
                        continue

                # ── Resolve and classify links ────────────────────────────────
                raw_links = [
                    l.strip() for l in embedded_raw.split(",") if l.strip()
                ]
                resolved_links = _resolve_links(raw_links)
                external_links = [l for l in resolved_links if not _is_x_domain(l)]

                # ── Determine tweet type ──────────────────────────────────────
                if len(external_links) == 0:
                    # Type C: long-form tweet with no external links
                    word_count = len(text.split())
                    if word_count >= LONG_TWEET_MIN_WORDS:
                        candidates.append(
                            ArticleCandidate(
                                url=tweet_url,
                                title=f"[{source_label}] {author}",
                                body=text[:MAX_BODY_CHARS_TWEET],
                                source=f"{author} (via {source_label})",
                                source_type="x",
                                date=timestamp,
                                origin_id=tweet_url,
                            )
                        )
                        tweet_count += 1
                        log.debug(
                            "Tweet %s [Type C — long-form %d words] → 1 candidate.",
                            tweet_url,
                            word_count,
                        )
                    else:
                        log.debug(
                            "Tweet %s [Dropped — %d words, no external links].",
                            tweet_url,
                            word_count,
                        )

                elif len(external_links) == 1:
                    # Type A: single external link
                    link = external_links[0]
                    body = text  # fallback to tweet text
                    fetched_title = ""
                    if fetch_fn is not None:
                        ft, fb = fetch_fn(link)
                        if fb:
                            fetched_title = ft or ""
                            body = fb
                    candidates.append(
                        ArticleCandidate(
                            url=link,
                            title=fetched_title or f"[{source_label}] {author}",
                            body=body[:MAX_BODY_CHARS_TWEET],
                            source=f"{author} (via {source_label})",
                            source_type="x",
                            date=timestamp,
                            origin_id=tweet_url,
                        )
                    )
                    tweet_count += 1
                    log.debug(
                        "Tweet %s [Type A — single link] → 1 candidate: %s",
                        tweet_url,
                        link,
                    )

                else:
                    # Type B: multiple external links (aggregator tweet)
                    produced = 0
                    for link in external_links:
                        body = text
                        fetched_title = ""
                        if fetch_fn is not None:
                            ft, fb = fetch_fn(link)
                            if fb:
                                fetched_title = ft or ""
                                body = fb
                        candidates.append(
                            ArticleCandidate(
                                url=link,
                                title=fetched_title or f"[{source_label}] {author}",
                                body=body[:MAX_BODY_CHARS_TWEET],
                                source=f"{author} (via {source_label})",
                                source_type="x",
                                date=timestamp,
                                origin_id=tweet_url,
                            )
                        )
                        produced += 1
                    tweet_count += produced
                    log.debug(
                        "Tweet %s [Type B — %d links] → %d candidate(s).",
                        tweet_url,
                        len(external_links),
                        produced,
                    )

        if stale_skipped:
            log.info(
                "Skipped %d stale bookmark(s) older than %d days from %s.",
                stale_skipped,
                bookmark_lookback_days,
                csv_path,
            )
        if considered_skipped:
            log.info(
                "Skipped %d already-considered tweet(s) from %s.",
                considered_skipped,
                csv_path,
            )
        log.info(
            "Loaded %d candidate(s) from %s.", tweet_count, csv_path
        )

    return candidates
