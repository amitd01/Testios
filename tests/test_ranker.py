"""Tests for agent.ranker — Claude API call and JSON parsing."""

import json
from unittest.mock import MagicMock

import pytest

from agent.models import Newsletter
from agent.ranker import _clean_json, _parse_response, summarise_and_rank


# ── _clean_json ───────────────────────────────────────────────────────────────


class TestCleanJson:
    def test_strips_json_fence(self):
        raw = "```json\n{}\n```"
        assert _clean_json(raw) == "{}"

    def test_strips_plain_fence(self):
        raw = "```\n{}\n```"
        assert _clean_json(raw) == "{}"

    def test_passthrough_when_no_fence(self):
        raw = '{"key": "value"}'
        assert _clean_json(raw) == raw

    def test_strips_whitespace(self):
        raw = "  \n{}\n  "
        assert _clean_json(raw) == "{}"


# ── _parse_response ───────────────────────────────────────────────────────────


VALID_RESPONSE = {
    "articles": [
        {
            "rank": 1,
            "title": "Test Article",
            "url": "https://example.com/article",
            "source": "Test Newsletter",
            "date": "March 9, 2026",
            "summary": "A " * 50 + "summary.",
            "tags": ["tech", "ai"],
            "score": 8.0,
            "scores": {
                "originality": 8,
                "real_world_impact": 8,
                "writing_quality": 8,
                "interestingness": 8,
            },
        }
    ],
    "excluded": [
        {
            "subject": "Weekly Sale",
            "exclude_reason": "Purely promotional, no substantive content.",
        }
    ],
}


class TestParseResponse:
    def test_parses_valid_response(self):
        articles, excluded = _parse_response(json.dumps(VALID_RESPONSE))
        assert len(articles) == 1
        assert len(excluded) == 1

    def test_article_fields(self):
        articles, _ = _parse_response(json.dumps(VALID_RESPONSE))
        a = articles[0]
        assert a.rank == 1
        assert a.title == "Test Article"
        assert a.url == "https://example.com/article"
        assert a.score == 8.0
        assert a.tags == ["tech", "ai"]

    def test_score_breakdown(self):
        articles, _ = _parse_response(json.dumps(VALID_RESPONSE))
        s = articles[0].scores
        assert s.originality == 8.0
        assert s.real_world_impact == 8.0
        assert s.writing_quality == 8.0
        assert s.interestingness == 8.0

    def test_excluded_item_fields(self):
        _, excluded = _parse_response(json.dumps(VALID_RESPONSE))
        assert excluded[0].subject == "Weekly Sale"
        assert "promotional" in excluded[0].reason.lower()

    def test_handles_missing_excluded_key(self):
        data = {"articles": VALID_RESPONSE["articles"]}
        articles, excluded = _parse_response(json.dumps(data))
        assert len(articles) == 1
        assert excluded == []

    def test_handles_missing_articles_key(self):
        articles, excluded = _parse_response('{"excluded": []}')
        assert articles == []

    def test_parses_response_with_json_fence(self):
        raw = "```json\n" + json.dumps(VALID_RESPONSE) + "\n```"
        articles, _ = _parse_response(raw)
        assert len(articles) == 1

    def test_raises_on_malformed_json(self):
        with pytest.raises(json.JSONDecodeError):
            _parse_response("not valid json at all")


# ── summarise_and_rank ────────────────────────────────────────────────────────


def _make_newsletters(n: int = 2) -> list[Newsletter]:
    return [
        Newsletter(
            id=f"msg-{i}",
            subject=f"Newsletter {i}",
            sender=f"sender{i}@substack.com",
            date="Mon, 09 Mar 2026 08:00:00 +0000",
            body="This is newsletter body content. " * 20,
            links=[f"https://example.com/article-{i}"],
        )
        for i in range(n)
    ]


def _make_settings():
    """Return a minimal Settings-like object for tests."""
    settings = MagicMock()
    settings.anthropic_api_key = "test-key"
    settings.digest_recipient = "test@example.com"
    settings.gmail_sender = "sender@gmail.com"
    settings.summary_max_words = 250
    return settings


class TestSummariseAndRank:
    def test_returns_empty_for_no_newsletters(self, mocker):
        settings = _make_settings()
        articles, excluded = summarise_and_rank([], settings)
        assert articles == []
        assert excluded == []

    def test_parses_valid_claude_response(self, mocker):
        settings = _make_settings()
        mock_create = mocker.patch("agent.ranker._call_claude")
        mock_create.return_value = json.dumps(VALID_RESPONSE)

        articles, excluded = summarise_and_rank(_make_newsletters(), settings)
        assert len(articles) == 1
        assert articles[0].title == "Test Article"
        assert len(excluded) == 1

    def test_returns_empty_on_malformed_json(self, mocker):
        settings = _make_settings()
        mocker.patch("agent.ranker._call_claude", return_value="INVALID JSON {{{{")

        articles, excluded = summarise_and_rank(_make_newsletters(), settings)
        assert articles == []
        assert excluded == []

    def test_returns_empty_on_api_error(self, mocker):
        import anthropic

        settings = _make_settings()
        mocker.patch(
            "agent.ranker._call_claude",
            side_effect=anthropic.APIError(
                message="Service unavailable",
                request=MagicMock(),
                body=None,
            ),
        )

        articles, excluded = summarise_and_rank(_make_newsletters(), settings)
        assert articles == []

    def test_truncates_body_to_max_chars(self, mocker):
        """Verify that only MAX_BODY_CHARS of each body are sent."""
        from agent import ranker as ranker_module

        settings = _make_settings()
        captured_prompts: list[str] = []

        def capture(client, prompt, system_prompt, max_tokens):
            captured_prompts.append(prompt)
            return json.dumps(VALID_RESPONSE)

        mocker.patch("agent.ranker._call_claude", side_effect=capture)

        long_body = "x" * 10_000
        newsletters = [
            Newsletter(
                id="msg-1",
                subject="Long Newsletter",
                sender="a@substack.com",
                date="Mon, 09 Mar 2026",
                body=long_body,
                links=[],
            )
        ]
        summarise_and_rank(newsletters, settings)

        assert captured_prompts, "Expected _call_claude to be called"
        prompt = captured_prompts[0]
        # The truncated body should not contain the full 10,000 x's
        assert "x" * (ranker_module.MAX_BODY_CHARS + 1) not in prompt
