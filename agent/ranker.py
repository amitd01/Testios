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
from .models import Article, ArticleCandidate, ExcludedItem, ScoreBreakdown, Newsletter

log = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAX_BODY_CHARS_EMAIL = 3000        # Token budget per email body
MAX_BODY_CHARS_TWEET = 3000        # X items: raised from 500 now that fetch_article()
                                   # populates body with real article content (~32 KB source,
                                   # ~5-8 KB extracted text). Use same budget as emails.
MAX_BODY_CHARS_LONG_TWEET = 1500   # Long-form tweets used as articles (no external content)


def _build_system_prompt(max_words: int) -> str:
    min_words = max_words - 50
    return (
        "You are a sharp newsletter curator with high editorial standards.\n"
        "Given a mix of newsletter emails and X/Twitter bookmarks/likes,\n"
        f"identify substantive articles, write {min_words}–{max_words} word\n"
        "summaries, craft a punchy editorial teaser, pick a quotable quote,\n"
        "and return ONLY valid JSON (no markdown fences, no backticks, no extra text)."
    )


def _build_user_template(max_words: int, max_articles: int = 8, min_score: float = 6.5) -> str:
    min_words = max_words - 50
    return (
        "Analyse these {n} item(s) from the last 24 hours.\n"
        "Items come from three sources:\n"
        "- EMAIL: Newsletter emails with full article content and links.\n"
        "- X/TWITTER: Bookmarked or liked tweets with embedded article links.\n"
        "- WHITELIST: Manually curated articles — treat these as high-priority candidates.\n"
        "\n"
        "Rules:\n"
        "- Skip pure promotional emails, political campaigns, bounce notifications, or empty digests.\n"
        "- For X/TWITTER items, the tweet text provides context about the linked article.\n"
        "  Use the embedded link as the article URL. Skip tweets with no substantive article link.\n"
        "- For long-form tweets where the LINKS field points to twitter.com/x.com (no external article),\n"
        "  the tweet text IS the article — summarise the tweet content directly.\n"
        "- One entry per substantive article (a newsletter may contain multiple).\n"
        f"- Keep summaries between {min_words} and {max_words} words.\n"
        "- Use the best article URL found in the email body or tweet links;\n"
        "  fall back to the newsletter's web-view URL.\n"
        "- In the 'source' field, preserve whether it came from a newsletter or X bookmark/like.\n"
        "- Rank 1 = best overall.\n"
        f"- Only include articles whose average score is ≥ {min_score}. Exclude anything below this threshold.\n"
        f"- Return at most {max_articles} ranked articles.\n"
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
        '  "teaser": "5-6 sentence editorial intro — tease today\'s picks with energy and voice, without naming articles explicitly. Give the reader a reason to keep scrolling.",\n'
        '  "quote": "A single verbatim, memorable, thought-provoking sentence from one of the ranked articles. Must be a direct quote, not a paraphrase.",\n'
        '  "quote_attribution": "Short attribution — article title or author name",\n'
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
        "ITEMS:\n"
        "{newsletters}"
    )


def _clean_json(raw: str) -> str:
    """Strip markdown fences and leading/trailing whitespace."""
    # Remove ```json ... ``` or ``` ... ``` fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _parse_response(raw: str) -> tuple[list[Article], list[ExcludedItem], str, str, str]:
    """Parse Claude's JSON response into Article and ExcludedItem lists plus teaser/quote."""
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
        source_str = str(item.get("source", ""))
        src_lower = source_str.lower()
        if any(tag in src_lower for tag in ("x bookmark", "x like", "via x")):
            source_type = "x"
        elif "whitelist" in src_lower:
            source_type = "whitelist"
        else:
            source_type = "email"
        articles.append(
            Article(
                rank=int(item.get("rank", 0)),
                title=str(item.get("title", "")),
                url=str(item.get("url", "")),
                source=source_str,
                date=str(item.get("date", "")),
                summary=str(item.get("summary", "")),
                source_type=source_type,
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

    teaser = str(data.get("teaser", ""))
    quote = str(data.get("quote", ""))
    quote_attribution = str(data.get("quote_attribution", ""))

    return articles, excluded, teaser, quote, quote_attribution


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
        # Low temperature for consistent, reproducible scoring across runs.
        # Default temperature=1 caused borderline articles to flip include/exclude
        # depending on sampling noise. 0.3 retains editorial judgment while
        # stabilising numeric scores near the threshold.
        temperature=0.3,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def summarise_and_rank(
    newsletters: list[Newsletter],
    settings: Settings,
) -> tuple[list[Article], list[ExcludedItem], str, str, str]:
    """Send newsletters to Claude; return (ranked articles, excluded items, teaser, quote, quote_attribution)."""
    if not newsletters:
        return [], [], "", "", ""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    max_words = settings.summary_max_words
    max_articles = settings.max_articles
    min_score = settings.min_score_threshold
    system_prompt = _build_system_prompt(max_words)
    user_template = _build_user_template(max_words, max_articles=max_articles, min_score=min_score)
    max_tokens = max(4096, max_words * 30)

    blocks: list[str] = []
    for i, nl in enumerate(newsletters, 1):
        links_str = "; ".join(nl.links) if nl.links else "none"
        is_x = nl.id.startswith("x:")
        is_whitelist = nl.id.startswith("whitelist::")
        # Long-form tweets have a single x.com link (the tweet itself as article)
        is_long_tweet = (
            is_x
            and len(nl.links) == 1
            and ("x.com" in nl.links[0] or "twitter.com" in nl.links[0])
        )
        if is_whitelist:
            source_type = "WHITELIST"
        elif is_x:
            source_type = "X/TWITTER"
        else:
            source_type = "EMAIL"
        if is_long_tweet:
            body_limit = MAX_BODY_CHARS_LONG_TWEET
        elif is_x:
            body_limit = MAX_BODY_CHARS_TWEET
        else:
            body_limit = MAX_BODY_CHARS_EMAIL
        blocks.append(
            f"[{i}] TYPE: {source_type}\n"
            f"FROM: {nl.sender}\n"
            f"SUBJECT: {nl.subject}\n"
            f"DATE: {nl.date}\n"
            f"LINKS: {links_str}\n\n"
            f"{nl.body[:body_limit]}\n"
        )

    prompt = user_template.format(n=len(newsletters), newsletters="\n---\n".join(blocks))

    try:
        raw = _call_claude(client, prompt, system_prompt, max_tokens)
    except anthropic.APIError as exc:
        log.error("Claude API error after retries: %s", exc, exc_info=True)
        return [], [], "", "", ""

    try:
        articles, excluded, teaser, quote, quote_attribution = _parse_response(raw)
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        log.error(
            "Claude returned malformed JSON — skipping send. Error: %s\nRaw response:\n%s",
            exc,
            raw,
        )
        return [], [], "", "", ""

    if excluded:
        for item in excluded:
            log.info("Excluded by Claude: '%s' — %s", item.subject, item.reason)

    # Python-side safety filters: enforce score threshold and article cap.
    before = len(articles)
    articles = [a for a in articles if a.score >= min_score]
    articles = articles[:max_articles]
    if len(articles) < before:
        log.info(
            "Post-filter: %d → %d article(s) (threshold=%.1f, cap=%d).",
            before, len(articles), min_score, max_articles,
        )

    log.info("Claude ranked %d article(s), excluded %d.", len(articles), len(excluded))
    return articles, excluded, teaser, quote, quote_attribution


# ── New 5-step architecture: digest text generation ───────────────────────────


def _build_digest_prompt(
    top_articles: list[tuple[ArticleCandidate, float, ScoreBreakdown]],
    max_words: int,
) -> str:
    """Build the digest-text prompt for the already-selected top articles."""
    min_words = max_words - 50
    blocks: list[str] = []
    for i, (c, score, _) in enumerate(top_articles, 1):
        body_snippet = c.body[:MAX_BODY_CHARS_EMAIL]
        blocks.append(
            f"[{i}] URL: {c.url}\n"
            f"TITLE: {c.title or '(untitled)'}\n"
            f"SOURCE: {c.source} ({c.source_type})\n"
            f"SCORE: {score:.1f}\n"
            f"DATE: {c.date}\n\n"
            f"{body_snippet}"
        )
    items_text = "\n---\n".join(blocks)
    return (
        f"These {len(top_articles)} articles have been selected for today's newsletter digest "
        f"(already scored; do NOT re-score).\n\n"
        f"For each article:\n"
        f"  - Write a {min_words}–{max_words} word editorial summary (insightful, not a mere paraphrase).\n"
        f"  - Assign 3–5 relevant tags.\n\n"
        f"Also produce:\n"
        f"  - teaser: A punchy 5–6 sentence editorial intro for the digest.  "
        f"Tease today's picks with energy and voice WITHOUT naming articles explicitly.\n"
        f"  - quote: A single verbatim, memorable, thought-provoking sentence from one of the articles "
        f"(direct quote, not a paraphrase).\n"
        f"  - quote_attribution: Short attribution — article title or author name.\n\n"
        f"Return ONLY this JSON (no markdown fences, no extra text):\n"
        '{{\n'
        '  "teaser": "5-6 sentence editorial intro",\n'
        '  "quote": "A verbatim memorable sentence",\n'
        '  "quote_attribution": "Short attribution",\n'
        '  "articles": [\n'
        '    {{\n'
        '      "url":     "https://...",\n'
        '      "title":   "Article title",\n'
        '      "rank":    1,\n'
        f'      "summary": "{min_words}-{max_words} word summary",\n'
        '      "tags":    ["tag1", "tag2"]\n'
        '    }}\n'
        '  ]\n'
        '}}\n\n'
        f"ARTICLES:\n{items_text}"
    )


def _parse_digest_response(
    raw: str,
    top_articles: list[tuple[ArticleCandidate, float, ScoreBreakdown]],
) -> tuple[list[Article], str, str, str]:
    """Parse Claude's digest JSON and assemble Article objects."""
    cleaned = _clean_json(raw)
    data = json.loads(cleaned)

    teaser = str(data.get("teaser", ""))
    quote = str(data.get("quote", ""))
    quote_attribution = str(data.get("quote_attribution", ""))

    # Build URL → (candidate, score, breakdown) lookup
    url_map = {c.url: (c, score, sb) for c, score, sb in top_articles}

    articles: list[Article] = []
    for item in data.get("articles", []):
        url = str(item.get("url", ""))
        entry = url_map.get(url)
        if entry is None:
            # Try index fallback if Claude changed the URL slightly
            idx = len(articles)
            if idx < len(top_articles):
                entry = top_articles[idx]

        if entry is None:
            continue

        c, score, breakdown = entry
        src_lower = c.source_type.lower()
        if src_lower == "x":
            source_type = "x"
        elif src_lower == "whitelist":
            source_type = "whitelist"
        else:
            source_type = "email"

        articles.append(
            Article(
                rank=int(item.get("rank", len(articles) + 1)),
                title=str(item.get("title", c.title or "")),
                url=url or c.url,
                source=c.source,
                date=c.date,
                summary=str(item.get("summary", "")),
                source_type=source_type,
                tags=list(item.get("tags", [])),
                score=score,
                scores=breakdown,
            )
        )

    return articles, teaser, quote, quote_attribution


def generate_digest_text(
    top_articles: list[tuple[ArticleCandidate, float, ScoreBreakdown]],
    settings: Settings,
) -> tuple[list[Article], str, str, str]:
    """Generate article summaries, editorial teaser, and quote for selected articles.

    Called ONLY for the top-selected articles (Step 4 output) so Claude sees a
    compact, already-curated set rather than all scored candidates.  Scores are
    not re-computed here — they come from the scorer's DB.

    Args:
        top_articles: Ordered list of ``(ArticleCandidate, score, ScoreBreakdown)``
                      representing today's selected articles.
        settings:     Pipeline settings.

    Returns:
        ``(articles, teaser, quote, quote_attribution)`` where *articles* is a
        list of fully-populated ``Article`` objects ready for the renderer.
    """
    if not top_articles:
        return [], "", "", ""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    max_words = settings.summary_max_words
    system_prompt = _build_system_prompt(max_words)
    prompt = _build_digest_prompt(top_articles, max_words)
    max_tokens = max(4096, max_words * 30)

    try:
        raw = _call_claude(client, prompt, system_prompt, max_tokens)
    except anthropic.APIError as exc:
        log.error("Claude digest-text API error after retries: %s", exc, exc_info=True)
        return [], "", "", ""

    try:
        articles, teaser, quote, quote_attribution = _parse_digest_response(
            raw, top_articles
        )
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        log.error(
            "Claude digest-text response malformed: %s\nRaw:\n%s", exc, raw
        )
        return [], "", "", ""

    log.info(
        "generate_digest_text: %d article summary/summaries generated.",
        len(articles),
    )
    return articles, teaser, quote, quote_attribution
