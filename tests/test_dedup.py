"""Tests for agent/dedup.py — tweet consideration tracking (new functions)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from agent.dedup import (
    already_considered_tweets,
    load_considered_tweets,
    record_considered_tweets,
    save_considered_tweets,
)


# ── TestTweetConsiderationTracking ────────────────────────────────────────────


class TestTweetConsiderationTracking:
    # ── load / save ──────────────────────────────────────────────────────────

    def test_load_missing_file_returns_empty(self, tmp_path):
        db = load_considered_tweets(str(tmp_path / "nonexistent.json"))
        assert db == {}

    def test_load_corrupt_file_returns_empty(self, tmp_path):
        p = tmp_path / "tweets.json"
        p.write_text("NOT VALID JSON !!!")
        db = load_considered_tweets(str(p))
        assert db == {}

    def test_save_and_reload_preserves_all(self, tmp_path):
        p = tmp_path / "tweets.json"
        original = {
            "2026-03-01": ["https://x.com/a/1", "https://x.com/a/2"],
            "2026-03-10": ["https://x.com/b/1"],
            "2026-03-14": ["https://x.com/c/1", "https://x.com/c/2", "https://x.com/c/3"],
        }
        save_considered_tweets(str(p), original)
        reloaded = load_considered_tweets(str(p))
        assert reloaded == original

    # ── already_considered_tweets ─────────────────────────────────────────────

    def test_already_considered_empty_db(self):
        assert already_considered_tweets({}) == set()

    def test_already_considered_flattens_all_dates(self):
        db = {
            "2026-03-10": ["https://x.com/a/1", "https://x.com/a/2"],
            "2026-03-11": ["https://x.com/b/1", "https://x.com/b/2"],
            "2026-03-12": ["https://x.com/c/1", "https://x.com/c/2"],
        }
        result = already_considered_tweets(db)
        assert len(result) == 6
        assert "https://x.com/a/1" in result
        assert "https://x.com/c/2" in result

    def test_tweet_url_in_considered_returns_true(self):
        url = "https://x.com/user/status/123"
        db = {"2026-03-14": [url, "https://x.com/user/status/456"]}
        assert url in already_considered_tweets(db)

    def test_tweet_url_not_in_considered_returns_false(self):
        db = {"2026-03-14": ["https://x.com/other/status/999"]}
        assert "https://x.com/missing/status/1" not in already_considered_tweets(db)

    def test_already_considered_skips_non_list_entries(self):
        """Gracefully ignores malformed entries (not lists)."""
        db = {
            "2026-03-10": ["https://x.com/a/1"],
            "bad-key": "this-is-not-a-list",
        }
        result = already_considered_tweets(db)
        assert "https://x.com/a/1" in result

    # ── record_considered_tweets ──────────────────────────────────────────────

    def test_record_adds_today_key(self):
        db: dict = {}
        urls = ["https://x.com/user/status/1", "https://x.com/user/status/2"]
        record_considered_tweets(db, "2026-03-14", urls)
        assert "2026-03-14" in db
        assert db["2026-03-14"] == urls

    def test_record_appends_to_existing_today(self):
        db: dict = {"2026-03-14": ["https://x.com/user/status/1"]}
        record_considered_tweets(db, "2026-03-14", ["https://x.com/user/status/2"])
        assert len(db["2026-03-14"]) == 2
        assert "https://x.com/user/status/2" in db["2026-03-14"]

    def test_record_no_duplicates_within_same_day(self):
        db: dict = {}
        url = "https://x.com/user/status/1"
        record_considered_tweets(db, "2026-03-14", [url, url])
        assert db["2026-03-14"].count(url) == 1

    def test_record_empty_list_creates_empty_entry(self):
        db: dict = {}
        record_considered_tweets(db, "2026-03-14", [])
        assert db["2026-03-14"] == []

    # ── 30-day retention ──────────────────────────────────────────────────────

    def test_30_day_retention_prunes_old_entries(self, tmp_path):
        p = tmp_path / "tweets.json"
        old_key = (datetime.now() - timedelta(days=31)).strftime("%Y-%m-%d")
        recent_key = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        db = {
            old_key: ["https://x.com/old/1"],
            recent_key: ["https://x.com/recent/1"],
        }
        save_considered_tweets(str(p), db)
        reloaded = load_considered_tweets(str(p))
        assert old_key not in reloaded
        assert recent_key in reloaded

    def test_30_day_retention_keeps_day_29(self, tmp_path):
        p = tmp_path / "tweets.json"
        day_29_key = (datetime.now() - timedelta(days=29)).strftime("%Y-%m-%d")
        db = {day_29_key: ["https://x.com/near/1"]}
        save_considered_tweets(str(p), db)
        reloaded = load_considered_tweets(str(p))
        assert day_29_key in reloaded

    def test_30_day_retention_keeps_today(self, tmp_path):
        p = tmp_path / "tweets.json"
        today_key = datetime.now().strftime("%Y-%m-%d")
        db = {today_key: ["https://x.com/today/1"]}
        save_considered_tweets(str(p), db)
        reloaded = load_considered_tweets(str(p))
        assert today_key in reloaded

    # ── Integration: record → already_considered ──────────────────────────────

    def test_recorded_url_in_already_considered(self):
        db: dict = {}
        url = "https://x.com/user/status/999"
        record_considered_tweets(db, "2026-03-14", [url])
        assert url in already_considered_tweets(db)

    def test_multiple_days_all_searchable(self):
        db: dict = {}
        urls_day1 = ["https://x.com/u/1", "https://x.com/u/2"]
        urls_day2 = ["https://x.com/u/3", "https://x.com/u/4"]
        record_considered_tweets(db, "2026-03-13", urls_day1)
        record_considered_tweets(db, "2026-03-14", urls_day2)
        all_urls = already_considered_tweets(db)
        assert all(u in all_urls for u in urls_day1 + urls_day2)
