"""Deduplication state for Newsletter Digest Agent.

Tracks both Gmail message IDs and article URLs that have been included
in past digests, preventing duplicate content across runs.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta

log = logging.getLogger(__name__)

_RETENTION_DAYS = 7


def load_sent_digests(path: str) -> dict:
    """Load dedup state from disk."""
    if os.path.exists(path):
        try:
            with open(path) as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("Could not read %s: %s — starting fresh.", path, exc)
    return {}


def save_sent_digests(path: str, data: dict) -> None:
    """Save dedup state, pruning entries older than retention window."""
    cutoff = (datetime.now() - timedelta(days=_RETENTION_DAYS)).strftime("%Y-%m-%d")
    pruned = {k: v for k, v in data.items() if k >= cutoff}
    with open(path, "w") as fh:
        json.dump(pruned, fh, indent=2)


def already_processed_ids(digests: dict) -> set[str]:
    """Collect all Gmail message IDs already processed across all days."""
    ids: set[str] = set()
    for entry in digests.values():
        ids.update(entry.get("message_ids", []))
    return ids


def already_used_urls(digests: dict) -> set[str]:
    """Collect all article URLs already included in past digests."""
    urls: set[str] = set()
    for entry in digests.values():
        urls.update(entry.get("article_urls", []))
    return urls


def record_sent_digest(
    digests: dict,
    today_key: str,
    message_ids: list[str],
    article_urls: list[str],
) -> None:
    """Record message IDs and article URLs for today's digest."""
    entry = digests.setdefault(today_key, {"message_ids": [], "article_urls": []})
    # Ensure article_urls key exists for backward compat
    if "article_urls" not in entry:
        entry["article_urls"] = []
    entry["message_ids"].extend(message_ids)
    entry["article_urls"].extend(article_urls)
