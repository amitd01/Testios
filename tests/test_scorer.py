"""Tests for agent/scorer.py — persistent score DB and batch scoring."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from agent.models import ArticleCandidate, ScoreBreakdown
from agent.scorer import (
    load_score_db,
    lookup_score,
    save_score_db,
    score_new_candidates,
    store_score,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_candidate(
    url: str = "https://example.com/article",
    title: str = "Test Article",
    body: str = "Article body text.",
    source_type: str = "email",
) -> ArticleCandidate:
    return ArticleCandidate(
        url=url,
        title=title,
        body=body,
        source="Test Newsletter",
        source_type=source_type,
        date="2026-03-14",
        origin_id="msg123",
    )


def _make_settings(api_key: str = "test-key") -> MagicMock:
    settings = MagicMock()
    settings.anthropic_api_key = api_key
    return settings


def _make_score_record(score: float = 7.5) -> dict:
    return {
        "score": score,
        "scores": {
            "originality": 8.0,
            "real_world_impact": 7.0,
            "writing_quality": 8.0,
            "interestingness": 7.0,
        },
        "title": "Test Article",
        "source_type": "email",
        "date_scored": "2026-03-14",
    }


# ── TestScoreDbBasics ─────────────────────────────────────────────────────────


class TestScoreDbBasics:
    def test_lookup_returns_none_for_missing_url(self):
        db: dict = {}
        assert lookup_score(db, "https://missing.com") is None

    def test_lookup_returns_record_for_known_url(self):
        db: dict = {"https://example.com": _make_score_record(7.5)}
        record = lookup_score(db, "https://example.com")
        assert record is not None
        assert record["score"] == 7.5

    def test_store_score_adds_entry(self):
        db: dict = {}
        breakdown = ScoreBreakdown(
            originality=8, real_world_impact=7, writing_quality=8, interestingness=7
        )
        store_score(db, "https://example.com", "Title", 7.5, breakdown, "email", "2026-03-14")
        assert len(db) == 1

    def test_store_score_fields_present(self):
        db: dict = {}
        breakdown = ScoreBreakdown(
            originality=8, real_world_impact=7, writing_quality=8, interestingness=7
        )
        store_score(db, "https://example.com", "Title", 7.5, breakdown, "email", "2026-03-14")
        record = db["https://example.com"]
        for key in ("score", "scores", "title", "source_type", "date_scored"):
            assert key in record, f"Missing key: {key}"

    def test_store_score_sub_scores_stored(self):
        db: dict = {}
        breakdown = ScoreBreakdown(
            originality=9, real_world_impact=6, writing_quality=7, interestingness=8
        )
        store_score(db, "https://example.com", "T", 7.5, breakdown, "x", "2026-03-14")
        scores = db["https://example.com"]["scores"]
        assert scores["originality"] == 9
        assert scores["real_world_impact"] == 6
        assert scores["writing_quality"] == 7
        assert scores["interestingness"] == 8

    def test_load_missing_file_returns_empty_dict(self, tmp_path):
        db = load_score_db(str(tmp_path / "nonexistent.json"))
        assert db == {}

    def test_load_corrupt_file_returns_empty_dict(self, tmp_path):
        p = tmp_path / "scores.json"
        p.write_text("NOT VALID JSON")
        db = load_score_db(str(p))
        assert db == {}

    def test_save_and_reload_roundtrip(self, tmp_path):
        p = tmp_path / "scores.json"
        db = {
            "https://a.com": _make_score_record(7.5),
            "https://b.com": _make_score_record(8.0),
            "https://c.com": _make_score_record(6.0),
        }
        save_score_db(str(p), db)
        reloaded = load_score_db(str(p))
        assert reloaded == db

    def test_save_score_db_no_pruning(self, tmp_path):
        """Score DB is never pruned — all entries persist forever."""
        p = tmp_path / "scores.json"
        db = {f"https://example.com/{i}": _make_score_record() for i in range(50)}
        save_score_db(str(p), db)
        reloaded = load_score_db(str(p))
        assert len(reloaded) == 50


# ── TestScoreNewCandidates ────────────────────────────────────────────────────


class TestScoreNewCandidates:
    def test_empty_candidates_returns_empty(self):
        score_db: dict = {}
        settings = _make_settings()
        result = score_new_candidates([], score_db, settings)
        assert result == []

    def test_all_cached_skips_claude(self):
        """When all URLs are in DB, Claude is never called."""
        url = "https://example.com/article"
        score_db = {url: _make_score_record(7.5)}
        candidates = [_make_candidate(url=url)]
        settings = _make_settings()

        with patch("agent.scorer.anthropic.Anthropic") as mock_anthropic:
            result = score_new_candidates(candidates, score_db, settings)
            mock_anthropic.assert_not_called()

        assert len(result) == 1
        _, score, _ = result[0]
        assert score == 7.5

    def test_cached_score_value_unchanged(self):
        """Cached score is returned verbatim — not recomputed."""
        url = "https://example.com/article"
        score_db = {url: _make_score_record(8.3)}
        candidates = [_make_candidate(url=url)]
        settings = _make_settings()

        with patch("agent.scorer.anthropic.Anthropic"):
            result = score_new_candidates(candidates, score_db, settings)

        _, score, _ = result[0]
        assert score == 8.3

    def test_partial_cache_one_claude_call(self):
        """For 3 new + 2 cached candidates, Claude is called exactly once."""
        cached_url = "https://cached.com/article"
        score_db = {cached_url: _make_score_record(7.0)}

        candidates = [
            _make_candidate(url="https://new1.com"),
            _make_candidate(url="https://new2.com"),
            _make_candidate(url="https://new3.com"),
            _make_candidate(url=cached_url),
        ]

        claude_response = json.dumps(
            {
                "scores": [
                    {
                        "url": "https://new1.com",
                        "title": "New1",
                        "originality": 8,
                        "real_world_impact": 7,
                        "writing_quality": 8,
                        "interestingness": 7,
                        "score": 7.5,
                    },
                    {
                        "url": "https://new2.com",
                        "title": "New2",
                        "originality": 7,
                        "real_world_impact": 7,
                        "writing_quality": 7,
                        "interestingness": 7,
                        "score": 7.0,
                    },
                    {
                        "url": "https://new3.com",
                        "title": "New3",
                        "originality": 6,
                        "real_world_impact": 6,
                        "writing_quality": 6,
                        "interestingness": 6,
                        "score": 6.0,
                    },
                ]
            }
        )

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=claude_response)]

        settings = _make_settings()
        call_count = []

        with patch("agent.scorer.anthropic.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_anthropic_cls.return_value = mock_client
            mock_client.messages.create.side_effect = lambda **kw: (
                call_count.append(1) or mock_message
            )

            result = score_new_candidates(candidates, score_db, settings)

        # Exactly one Claude call for the 3 new candidates
        assert len(call_count) == 1
        # All 4 candidates returned
        assert len(result) == 4

    def test_new_score_stored_in_db(self):
        """After scoring, the new URL appears in the score DB."""
        url = "https://new.com/article"
        score_db: dict = {}
        candidates = [_make_candidate(url=url)]

        claude_response = json.dumps(
            {
                "scores": [
                    {
                        "url": url,
                        "title": "New Article",
                        "originality": 8,
                        "real_world_impact": 7,
                        "writing_quality": 8,
                        "interestingness": 7,
                        "score": 7.5,
                    }
                ]
            }
        )
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=claude_response)]

        settings = _make_settings()
        with patch("agent.scorer.anthropic.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = mock_message
            score_new_candidates(candidates, score_db, settings)

        assert url in score_db

    def test_invalid_claude_json_assigns_zero(self):
        """Malformed Claude response: all new candidates get score 0, no crash."""
        url = "https://new.com/article"
        score_db: dict = {}
        candidates = [_make_candidate(url=url)]

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="NOT JSON AT ALL")]

        settings = _make_settings()
        with patch("agent.scorer.anthropic.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = mock_message
            result = score_new_candidates(candidates, score_db, settings)

        assert len(result) == 1
        _, score, _ = result[0]
        assert score == 0.0

    def test_score_clamped_to_valid_range(self):
        """Sub-scores averaging > 10 are clamped to 10.0."""
        url = "https://extreme.com"
        score_db: dict = {}
        candidates = [_make_candidate(url=url)]

        claude_response = json.dumps(
            {
                "scores": [
                    {
                        "url": url,
                        "title": "X",
                        "originality": 10,
                        "real_world_impact": 10,
                        "writing_quality": 10,
                        "interestingness": 10,
                        "score": 11.0,  # hallucinated score > 10
                    }
                ]
            }
        )
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=claude_response)]

        settings = _make_settings()
        with patch("agent.scorer.anthropic.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = mock_message
            result = score_new_candidates(candidates, score_db, settings)

        _, score, _ = result[0]
        assert score <= 10.0

    def test_output_order_matches_input_order(self):
        """Results preserve the input candidate order."""
        urls = [f"https://example.com/{i}" for i in range(5)]
        # 3 cached, 2 new
        score_db = {
            urls[0]: _make_score_record(7.0),
            urls[2]: _make_score_record(8.0),
            urls[4]: _make_score_record(6.0),
        }
        candidates = [_make_candidate(url=u) for u in urls]

        claude_response = json.dumps(
            {
                "scores": [
                    {
                        "url": urls[1],
                        "title": "B",
                        "originality": 7,
                        "real_world_impact": 7,
                        "writing_quality": 7,
                        "interestingness": 7,
                        "score": 7.0,
                    },
                    {
                        "url": urls[3],
                        "title": "D",
                        "originality": 8,
                        "real_world_impact": 8,
                        "writing_quality": 8,
                        "interestingness": 8,
                        "score": 8.0,
                    },
                ]
            }
        )
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=claude_response)]

        settings = _make_settings()
        with patch("agent.scorer.anthropic.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = mock_message
            result = score_new_candidates(candidates, score_db, settings)

        # Output URLs must match input order
        result_urls = [c.url for c, _, _ in result]
        assert result_urls == urls


# ── Load tests ────────────────────────────────────────────────────────────────


class TestScoreDbLoad:
    def test_load_1000_entry_db(self, tmp_path):
        p = tmp_path / "scores.json"
        big_db = {f"https://example.com/{i}": _make_score_record() for i in range(1000)}
        p.write_text(json.dumps(big_db))
        loaded = load_score_db(str(p))
        assert len(loaded) == 1000

    def test_lookup_1000_entry_db(self, tmp_path):
        p = tmp_path / "scores.json"
        big_db = {f"https://example.com/{i}": _make_score_record(float(i % 10)) for i in range(1000)}
        save_score_db(str(p), big_db)
        loaded = load_score_db(str(p))
        # Spot-check a few entries
        assert lookup_score(loaded, "https://example.com/500") is not None
        assert lookup_score(loaded, "https://example.com/999") is not None
        assert lookup_score(loaded, "https://notexistent.com") is None

    def test_save_reload_1000_entries_preserves_all_fields(self, tmp_path):
        p = tmp_path / "scores.json"
        big_db = {
            f"https://example.com/{i}": {
                "score": round(i / 100, 4),
                "scores": {
                    "originality": i % 10,
                    "real_world_impact": (i + 1) % 10,
                    "writing_quality": (i + 2) % 10,
                    "interestingness": (i + 3) % 10,
                },
                "title": f"Article {i}",
                "source_type": "email",
                "date_scored": "2026-03-14",
            }
            for i in range(1000)
        }
        save_score_db(str(p), big_db)
        reloaded = load_score_db(str(p))
        assert reloaded == big_db
