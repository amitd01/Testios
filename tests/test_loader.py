"""Tests for x_scraper/loader.py — bookmark date filter and article body fetching."""

from __future__ import annotations

import csv
import io
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

from agent.x_scraper.loader import _parse_timestamp, load_x_data


# ── _parse_timestamp ──────────────────────────────────────────────────────────

class TestParseTimestamp:
    def test_parses_valid_utc(self):
        dt = _parse_timestamp("2026-03-13T09:59:28.000Z")
        assert dt is not None
        assert dt.year == 2026
        assert dt.month == 3
        assert dt.day == 13
        assert dt.tzinfo == timezone.utc

    def test_parses_without_millis(self):
        dt = _parse_timestamp("2023-07-03T01:10:12Z")
        assert dt is not None
        assert dt.year == 2023

    def test_returns_none_for_empty(self):
        assert _parse_timestamp("") is None

    def test_returns_none_for_garbage(self):
        assert _parse_timestamp("not-a-date") is None


# ── Bookmark date filter ──────────────────────────────────────────────────────

def _write_csv(rows: list[dict], path: Path) -> None:
    """Write a minimal bookmarks/likes CSV."""
    fieldnames = ["url", "author", "text", "timestamp", "embedded_links"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


class TestBookmarkDateFilter:
    def test_stale_bookmarks_filtered_out(self, tmp_path):
        old_ts = (datetime.now(tz=timezone.utc) - timedelta(days=60)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        new_ts = (datetime.now(tz=timezone.utc) - timedelta(days=5)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {"url": "https://x.com/old/1", "author": "Old User", "text": "old tweet",
                 "timestamp": old_ts, "embedded_links": "https://example.com/old"},
                {"url": "https://x.com/new/1", "author": "New User", "text": "new tweet",
                 "timestamp": new_ts, "embedded_links": "https://example.com/new"},
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks), str(likes), used_urls=set(), bookmark_lookback_days=14
        )

        urls = [nl.links[0] for nl in results]
        assert "https://example.com/new" in urls
        assert "https://example.com/old" not in urls

    def test_no_filter_when_lookback_zero(self, tmp_path):
        old_ts = "2023-03-01T18:04:26.000Z"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [{"url": "https://x.com/old/1", "author": "Old", "text": "tweet",
              "timestamp": old_ts, "embedded_links": "https://example.com/old"}],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks), str(likes), used_urls=set(), bookmark_lookback_days=0
        )

        assert any("https://example.com/old" in nl.links for nl in results)

    def test_filter_does_not_apply_to_likes(self, tmp_path):
        """Likes are filtered by the scraper; the loader should not apply the date
        filter to them, even if the tweet timestamp is old."""
        old_ts = "2023-03-01T18:04:26.000Z"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv([], bookmarks)
        likes = tmp_path / "likes.csv"
        _write_csv(
            [{"url": "https://x.com/old/like", "author": "Old", "text": "tweet",
              "timestamp": old_ts, "embedded_links": "https://example.com/like"}],
            likes,
        )

        results = load_x_data(
            str(bookmarks), str(likes), used_urls=set(), bookmark_lookback_days=14
        )

        assert any("https://example.com/like" in nl.links for nl in results)


# ── Article body fetching ─────────────────────────────────────────────────────

class TestArticleBodyFetching:
    def test_fetch_fn_called_for_external_link(self, tmp_path):
        recent_ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [{"url": "https://x.com/u/1", "author": "Author",
              "text": "Cool article",
              "timestamp": recent_ts,
              "embedded_links": "https://example.com/article"}],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        fetch_calls = []
        def fake_fetch(url):
            fetch_calls.append(url)
            return ("Article Title", "Full article body text here.")

        results = load_x_data(
            str(bookmarks), str(likes), used_urls=set(),
            bookmark_lookback_days=0, fetch_fn=fake_fetch,
        )

        assert len(results) == 1
        assert results[0].body == "Full article body text here."
        assert "Article Title" in results[0].subject
        assert "https://example.com/article" in fetch_calls

    def test_fallback_to_tweet_text_when_fetch_returns_empty(self, tmp_path):
        recent_ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [{"url": "https://x.com/u/2", "author": "Author",
              "text": "Paywalled article",
              "timestamp": recent_ts,
              "embedded_links": "https://wsj.com/paywalled"}],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        def empty_fetch(url):
            return ("", "")

        results = load_x_data(
            str(bookmarks), str(likes), used_urls=set(),
            bookmark_lookback_days=0, fetch_fn=empty_fetch,
        )

        assert len(results) == 1
        assert results[0].body == "Paywalled article"  # falls back to tweet text

    def test_no_fetch_when_fetch_fn_is_none(self, tmp_path):
        recent_ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [{"url": "https://x.com/u/3", "author": "Author",
              "text": "Tweet text only",
              "timestamp": recent_ts,
              "embedded_links": "https://example.com/article"}],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks), str(likes), used_urls=set(),
            bookmark_lookback_days=0, fetch_fn=None,
        )

        assert len(results) == 1
        assert results[0].body == "Tweet text only"
