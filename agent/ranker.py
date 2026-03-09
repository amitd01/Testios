"""Claude API call, prompt construction, and JSON parsing for article ranking."""

from __future__ import annotations

import json
import logging
import re

import anthropic
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import Settings
from .models import Article, ExcludedItem, ScoreBreakdown, Newsletter

log = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAX_BODY_CHARS = 3000  # Token budget per email body

def _build_system_prompt(max_words: int) -> str:
    min_words = max_words - 50
    return (
        "You are a sharp newsletter curator with high editorial standards.\n"
        f"Given newsletter emails, identify substantive articles, write {min_words}–{max_words} word\n"
        "summaries, and return ONLY valid JSON (no markdown fences, no backticks, no extra text)."
    )


def _build_user_template(max_words: int) -> str:
    min_words = max_words - 50
    return (
        "Analyse these {n} newsletter(s) from the last 24 hours.\n"
        "\n"
        "Rules:\n"
        "- Skip pure promotional emails, political campaigns, bounce notifications, or empty digests.\n"
        "- One entry per substantive article (a newsletter may contain multiple).\n"
        f"- Keep summaries between {min_words} and {max_words} words.\n"
        "- Use the best article URL found in the email body; fall back to the newsletter's web-view URL.\n"
        "- Rank 1 = best overall.\n"
        "\n"
        "Scoring rubric (0–10 each):\n"
        "  - originality: Novel angle or non-obvious insight — not just restating existing coverage\n"
        "  - real_world_impact: Relevance to business, tech, policy, or daily life\n"
        "  - writing_quality: Clarity, voice, and structure\n"
        "  - interestingness: Would a smart generalist want to read this?\n"
        "\n"
        "score = average of the four dimensions.\n"
        "\n"
        "Return ONLY this JSON structure (no markdown, no commentary):\n"
        "{{\n"
        '  "articles": [\n'
        "    {{\n"
        '      "rank":    1,\n'
        '      "title":   "Article title",\n'
        '      "url":     "https://...",\n'
        '      "source":  "Newsletter / author name",\n'
        '      "date":    "e.g. March 4, 2026",\n'
        f'      "summary": "{min_words}-{max_words} word summary",\n'
        '      "tags":    ["tag1", "tag2"],\n'
        '      "score":   7.5,\n'
        '      "scores": {{\n'
        '        "originality":       8,\n'
        '        "real_world_impact": 7,\n'
        '        "writing_quality":   8,\n'
        '        "interestingness":   7\n'
        "      }}\n"
        "    }}\n"
        "  ],\n"
        '  "excluded": [\n'
        "    {{\n"
        '      "subject":       "Newsletter subject line",\n'
        '      "exclude_reason": "One-line reason"\n'
        "    }}\n"
        "  ]\n"
        "}}\n"
        "\n"
        "NEWSLETTERS:\n"
        "{newsletters}"
    )


def _clean_json(raw: str) -> str:
    """Strip markdown fences and leading/trailing whitespace."""
    # Remove ```json ... ``` or ``` ... ``` fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _parse_response(raw: str) -> tuple[list[Article], list[ExcludedItem]]:
    """Parse Claude's JSON response into Article and ExcludedItem lists."""
    cleaned = _clean_json(raw)
    data = json.loads(cleaned)

    articles: list[Article] = []
    for item in data.get("articles", []):
        scores_raw = item.get("scores", {})
        breakdown = ScoreBreakdown(
            originality=float(scores_raw.get("originality", 0)),
            real_world_impact=float(scores_raw.get("real_world_impact", 0)),
            writing_quality=float(scores_raw.get("writing_quality", 0)),
            interestingness=float(scores_raw.get("interestingness", 0)),
        )
        articles.append(
            Article(
                rank=int(item.get("rank", 0)),
                title=str(item.get("title", "")),
                url=str(item.get("url", "")),
                source=str(item.get("source", "")),
                date=str(item.get("date", "")),
                summary=str(item.get("summary", "")),
                tags=list(item.get("tags", [])),
                score=float(item.get("score", breakdown.average)),
                scores=breakdown,
            )
        )

    excluded: list[ExcludedItem] = []
    for item in data.get("excluded", []):
        excluded.append(
            ExcludedItem(
                subject=str(item.get("subject", "")),
                reason=str(item.get("exclude_reason", "")),
            )
        )

    return articles, excluded


@retry(
    retry=retry_if_exception_type((anthropic.APIError, anthropic.RateLimitError)),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def _call_claude(
    client: anthropic.Anthropic,
    prompt: str,
    system_prompt: str,
    max_tokens: int,
) -> str:
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def summarise_and_rank(
    newsletters: list[Newsletter],
    settings: Settings,
) -> tuple[list[Article], list[ExcludedItem]]:
    """Send newsletters to Claude; return (ranked articles, excluded items)."""
    if not newsletters:
        return [], []

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    max_words = settings.summary_max_words
    system_prompt = _build_system_prompt(max_words)
    user_template = _build_user_template(max_words)
    max_tokens = max(4096, max_words * 30)

    blocks: list[str] = []
    for i, nl in enumerate(newsletters, 1):
        links_str = "; ".join(nl.links) if nl.links else "none"
        blocks.append(
            f"[{i}] FROM: {nl.sender}\n"
            f"SUBJECT: {nl.subject}\n"
            f"DATE: {nl.date}\n"
            f"LINKS: {links_str}\n\n"
            f"{nl.body[:MAX_BODY_CHARS]}\n"
        )

    prompt = user_template.format(n=len(newsletters), newsletters="\n---\n".join(blocks))

    try:
        raw = _call_claude(client, prompt, system_prompt, max_tokens)
    except anthropic.APIError as exc:
        log.error("Claude API error after retries: %s", exc, exc_info=True)
        return [], []

    try:
        articles, excluded = _parse_response(raw)
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        log.error(
            "Claude returned malformed JSON — skipping send. Error: %s\nRaw response:\n%s",
            exc,
            raw,
        )
        return [], []

    if excluded:
        for item in excluded:
            log.info("Excluded by Claude: '%s' — %s", item.subject, item.reason)

    log.info("Claude ranked %d article(s), excluded %d.", len(articles), len(excluded))
    return articles, excluded
