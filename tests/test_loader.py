"""Tests for x_scraper/loader.py — tweet dedup, bookmark filter, Type A/B/C."""

from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

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


# ── CSV writer helper ─────────────────────────────────────────────────────────


def _write_csv(rows: list[dict], path: Path) -> None:
    """Write a minimal bookmarks/likes CSV."""
    fieldnames = ["url", "author", "text", "timestamp", "embedded_links"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


# ── Bookmark date filter ──────────────────────────────────────────────────────


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
                {
                    "url": "https://x.com/old/1",
                    "author": "Old User",
                    "text": "old tweet",
                    "timestamp": old_ts,
                    "embedded_links": "https://example.com/old",
                },
                {
                    "url": "https://x.com/new/1",
                    "author": "New User",
                    "text": "new tweet",
                    "timestamp": new_ts,
                    "embedded_links": "https://example.com/new",
                },
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=14,
        )

        urls = [ac.url for ac in results]
        assert "https://example.com/new" in urls
        assert "https://example.com/old" not in urls

    def test_no_filter_when_lookback_zero(self, tmp_path):
        old_ts = "2023-03-01T18:04:26.000Z"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/old/1",
                    "author": "Old",
                    "text": "tweet",
                    "timestamp": old_ts,
                    "embedded_links": "https://example.com/old",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
        )

        assert any(ac.url == "https://example.com/old" for ac in results)

    def test_filter_does_not_apply_to_likes(self, tmp_path):
        """Likes are filtered by the scraper; loader must not date-filter them."""
        old_ts = "2023-03-01T18:04:26.000Z"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv([], bookmarks)
        likes = tmp_path / "likes.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/old/like",
                    "author": "Old",
                    "text": "tweet",
                    "timestamp": old_ts,
                    "embedded_links": "https://example.com/like",
                }
            ],
            likes,
        )

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=14,
        )

        assert any(ac.url == "https://example.com/like" for ac in results)


# ── Tweet URL dedup ───────────────────────────────────────────────────────────


class TestTweetUrlDedup:
    def test_considered_tweet_url_skipped(self, tmp_path):
        """Tweet whose URL is in considered_tweet_urls produces 0 candidates."""
        ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        tweet_url = "https://x.com/user/status/1"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": tweet_url,
                    "author": "User",
                    "text": "tweet text",
                    "timestamp": ts,
                    "embedded_links": "https://example.com/article",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls={tweet_url},
            bookmark_lookback_days=0,
        )

        assert results == []

    def test_new_tweet_url_passes_dedup(self, tmp_path):
        """Tweet URL not in considered_tweet_urls is processed normally."""
        ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        tweet_url = "https://x.com/user/status/999"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": tweet_url,
                    "author": "User",
                    "text": "tweet",
                    "timestamp": ts,
                    "embedded_links": "https://example.com/article",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls={"https://x.com/other/status/1"},  # different URL
            bookmark_lookback_days=0,
        )

        assert len(results) == 1


# ── Article body fetching ─────────────────────────────────────────────────────


class TestArticleBodyFetching:
    def test_fetch_fn_called_for_external_link(self, tmp_path):
        recent_ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/1",
                    "author": "Author",
                    "text": "Cool article",
                    "timestamp": recent_ts,
                    "embedded_links": "https://example.com/article",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        fetch_calls = []

        def fake_fetch(url):
            fetch_calls.append(url)
            return ("Article Title", "Full article body text here.")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=fake_fetch,
        )

        assert len(results) == 1
        assert results[0].body == "Full article body text here."
        assert results[0].title == "Article Title"
        assert "https://example.com/article" in fetch_calls

    def test_fallback_to_tweet_text_when_fetch_returns_empty(self, tmp_path):
        recent_ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/2",
                    "author": "Author",
                    "text": "Paywalled article",
                    "timestamp": recent_ts,
                    "embedded_links": "https://wsj.com/paywalled",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        def empty_fetch(url):
            return ("", "")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=empty_fetch,
        )

        assert len(results) == 1
        assert results[0].body == "Paywalled article"  # falls back to tweet text

    def test_no_fetch_when_fetch_fn_is_none(self, tmp_path):
        recent_ts = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/3",
                    "author": "Author",
                    "text": "Tweet text only",
                    "timestamp": recent_ts,
                    "embedded_links": "https://example.com/article",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=None,
        )

        assert len(results) == 1
        assert results[0].body == "Tweet text only"


# ── Type A / B / C tweet classification ──────────────────────────────────────


class TestXTweetTypes:
    def _fresh_ts(self) -> str:
        return (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )

    # ── Type A (single external link) ────────────────────────────────────────

    def test_type_a_single_external_link(self, tmp_path):
        """Tweet with 1 non-x.com link → 1 candidate; fetch_fn called once."""
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/1",
                    "author": "Author",
                    "text": "Cool article",
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "https://example.com/article",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        calls = []

        def fake_fetch(url):
            calls.append(url)
            return ("Title", "Body text")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=fake_fetch,
        )

        assert len(results) == 1
        assert results[0].url == "https://example.com/article"
        assert "https://example.com/article" in calls

    def test_type_a_x_link_not_fetched(self, tmp_path):
        """Tweet with 1 x.com link: no external article → treated as Type C check (short → drop)."""
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/2",
                    "author": "Author",
                    "text": "short",
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "https://x.com/other/status/99",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        calls = []

        def fake_fetch(url):
            calls.append(url)
            return ("T", "B")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=fake_fetch,
        )

        # No external link → Type C check fails (short text) → 0 candidates
        assert len(results) == 0
        # fetch_fn must NOT have been called for the x.com link
        assert calls == []

    # ── Type B (multiple external links) ─────────────────────────────────────

    def test_type_b_two_external_links(self, tmp_path):
        """Tweet with 2 external links → 2 candidates."""
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/3",
                    "author": "Author",
                    "text": "Two links",
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "https://a.com/1, https://b.com/2",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        calls = []

        def fake_fetch(url):
            calls.append(url)
            return ("Title", "Body")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=fake_fetch,
        )

        assert len(results) == 2
        urls = {r.url for r in results}
        assert "https://a.com/1" in urls
        assert "https://b.com/2" in urls
        assert len(calls) == 2

    def test_type_b_mixed_x_and_external(self, tmp_path):
        """Tweet with 1 x.com + 1 external → only 1 external candidate (Type A)."""
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/4",
                    "author": "Author",
                    "text": "Quote tweet",
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "https://x.com/quoted/status/5, https://external.com/article",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        calls = []

        def fake_fetch(url):
            calls.append(url)
            return ("Title", "Body")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=fake_fetch,
        )

        assert len(results) == 1
        assert results[0].url == "https://external.com/article"

    def test_type_b_all_x_links_becomes_no_external(self, tmp_path):
        """Tweet with only x.com links → 0 external links → Type C check (short → drop)."""
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/5",
                    "author": "Author",
                    "text": "short",
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "https://x.com/a/1, https://x.com/b/2",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
        )

        assert len(results) == 0

    # ── Type C (long-form tweet) ──────────────────────────────────────────────

    def test_type_c_long_form_200_words(self, tmp_path):
        """Tweet with exactly 200 words and no external links → 1 candidate."""
        long_text = " ".join(["word"] * 200)
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/6",
                    "author": "Essayist",
                    "text": long_text,
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
        )

        assert len(results) == 1
        # For Type C, body is the tweet text
        assert "word" in results[0].body
        # URL is the tweet URL itself
        assert results[0].url == "https://x.com/u/status/6"

    def test_type_c_boundary_199_words_dropped(self, tmp_path):
        """Tweet with 199 words and no links → below threshold → dropped."""
        short_text = " ".join(["word"] * 199)
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/status/7",
                    "author": "Author",
                    "text": short_text,
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
        )

        assert results == []

    def test_type_c_origin_id_is_tweet_url(self, tmp_path):
        """Type C candidates have origin_id = tweet URL."""
        long_text = " ".join(["word"] * 200)
        tweet_url = "https://x.com/u/status/8"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": tweet_url,
                    "author": "Author",
                    "text": long_text,
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
        )

        assert len(results) == 1
        assert results[0].origin_id == tweet_url

    def test_type_a_origin_id_is_tweet_url(self, tmp_path):
        """Type A candidates also carry the tweet URL as origin_id (for Step 5 tracking)."""
        tweet_url = "https://x.com/u/status/9"
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": tweet_url,
                    "author": "Author",
                    "text": "article link",
                    "timestamp": self._fresh_ts(),
                    "embedded_links": "https://example.com/art",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
        )

        assert len(results) == 1
        assert results[0].origin_id == tweet_url

    # ── Load tests ────────────────────────────────────────────────────────────

    def test_100_bookmarks_mixed_fresh_stale(self, tmp_path):
        """60 stale + 40 fresh tweets → exactly 40 candidates returned."""
        now = datetime.now(tz=timezone.utc)
        rows = []
        for i in range(60):
            old_ts = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            rows.append(
                {
                    "url": f"https://x.com/u/old/{i}",
                    "author": "Old",
                    "text": "stale",
                    "timestamp": old_ts,
                    "embedded_links": f"https://example.com/old/{i}",
                }
            )
        for i in range(40):
            fresh_ts = (now - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            rows.append(
                {
                    "url": f"https://x.com/u/new/{i}",
                    "author": "New",
                    "text": "fresh",
                    "timestamp": fresh_ts,
                    "embedded_links": f"https://example.com/new/{i}",
                }
            )

        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(rows, bookmarks)
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=14,
        )

        assert len(results) == 40

    def test_200_all_stale_bookmarks(self, tmp_path):
        """All-stale CSV → 0 candidates, no crash."""
        now = datetime.now(tz=timezone.utc)
        rows = [
            {
                "url": f"https://x.com/u/old/{i}",
                "author": "Old",
                "text": "stale",
                "timestamp": (now - timedelta(days=100)).strftime(
                    "%Y-%m-%dT%H:%M:%S.000Z"
                ),
                "embedded_links": f"https://example.com/{i}",
            }
            for i in range(200)
        ]
        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(rows, bookmarks)
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=14,
        )

        assert results == []

    def test_type_b_50_tweets_3_links_each(self, tmp_path):
        """50 Type B tweets × 3 external links each → 150 candidates."""
        now = datetime.now(tz=timezone.utc)
        rows = []
        for i in range(50):
            links = f"https://a.com/{i}, https://b.com/{i}, https://c.com/{i}"
            rows.append(
                {
                    "url": f"https://x.com/u/agg/{i}",
                    "author": "Curator",
                    "text": "three links",
                    "timestamp": (now - timedelta(days=1)).strftime(
                        "%Y-%m-%dT%H:%M:%S.000Z"
                    ),
                    "embedded_links": links,
                }
            )

        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(rows, bookmarks)
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        def fake_fetch(url):
            return ("Title", "Body")

        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=set(),
            bookmark_lookback_days=0,
            fetch_fn=fake_fetch,
        )

        assert len(results) == 150

    def test_large_considered_set_performance(self, tmp_path):
        """10 000-entry dedup set should still process a fresh tweet quickly."""
        import time

        now = datetime.now(tz=timezone.utc)
        # Big dedup set (all different URLs so the fresh tweet isn't in it)
        big_set = {f"https://x.com/u/old/{i}" for i in range(10_000)}

        bookmarks = tmp_path / "bookmarks.csv"
        _write_csv(
            [
                {
                    "url": "https://x.com/u/fresh/1",
                    "author": "A",
                    "text": "fresh",
                    "timestamp": (now - timedelta(days=1)).strftime(
                        "%Y-%m-%dT%H:%M:%S.000Z"
                    ),
                    "embedded_links": "https://example.com/art",
                }
            ],
            bookmarks,
        )
        likes = tmp_path / "likes.csv"
        _write_csv([], likes)

        start = time.monotonic()
        results = load_x_data(
            str(bookmarks),
            str(likes),
            considered_tweet_urls=big_set,
            bookmark_lookback_days=0,
        )
        elapsed = time.monotonic() - start

        assert len(results) == 1  # the fresh tweet is processed
        assert elapsed < 1.0  # sub-second even with 10K dedup set
