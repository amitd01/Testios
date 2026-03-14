"""Persistent article score database and Claude-based batch scoring.

Articles are scored once and the result is cached forever by URL.  This means:

- Same article URL → same score on every future run (deterministic).
- Claude is only called for URLs that are genuinely new to the pipeline.
- No re-scoring due to sampling variance; temperature=0.3 still used for
  the initial score to keep editorial judgement consistent.

Score DB schema (article_scores.json)
--------------------------------------
{
  "https://example.com/article": {
    "score": 7.5,
    "scores": {
      "originality": 8,
      "real_world_impact": 7,
      "writing_quality": 8,
      "interestingness": 7
    },
    "title": "Article Title",
    "source_type": "email",
    "date_scored": "2026-03-14"
  },
  ...
}
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import TYPE_CHECKING

import anthropic
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .models import ArticleCandidate, ScoreBreakdown

if TYPE_CHECKING:
    from .config import Settings

log = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-20250514"

# Max body chars sent to Claude for scoring (prevents huge prompts)
MAX_BODY_CHARS_SCORE = 3000

# ── DB I/O ────────────────────────────────────────────────────────────────────


def load_score_db(path: str) -> dict:
    """Load the persistent score DB from disk.  Returns ``{}`` if missing."""
    if os.path.exists(path):
        try:
            with open(path) as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            log.warning(
                "Could not read score DB %s: %s — starting fresh.", path, exc
            )
    return {}


def save_score_db(path: str, db: dict) -> None:
    """Write the score DB to disk.  No pruning — scores are permanent."""
    with open(path, "w") as fh:
        json.dump(db, fh, indent=2)
    log.debug("Score DB saved: %d entries in %s.", len(db), path)


# ── Lookup / store ────────────────────────────────────────────────────────────


def lookup_score(db: dict, url: str) -> dict | None:
    """Return the cached score record for *url*, or ``None`` if not found."""
    return db.get(url)


def store_score(
    db: dict,
    url: str,
    title: str,
    score: float,
    scores: ScoreBreakdown,
    source_type: str,
    date_scored: str,
) -> None:
    """Add (or overwrite) a score record for *url* in *db* (in-place)."""
    db[url] = {
        "score": round(score, 4),
        "scores": {
            "originality": scores.originality,
            "real_world_impact": scores.real_world_impact,
            "writing_quality": scores.writing_quality,
            "interestingness": scores.interestingness,
        },
        "title": title,
        "source_type": source_type,
        "date_scored": date_scored,
    }


# ── Claude scoring call ───────────────────────────────────────────────────────

_SCORE_SYSTEM_PROMPT = (
    "You are a senior editorial analyst. Given article excerpts, score each one "
    "on four dimensions (0–10 integers) and return ONLY valid JSON — no markdown "
    "fences, no backticks, no extra text."
)


def _build_score_prompt(candidates: list[ArticleCandidate]) -> str:
    """Build the scoring prompt for a batch of article candidates."""
    blocks: list[str] = []
    for i, c in enumerate(candidates, 1):
        body_snippet = c.body[:MAX_BODY_CHARS_SCORE]
        blocks.append(
            f"[{i}] URL: {c.url}\n"
            f"TITLE: {c.title or '(untitled)'}\n"
            f"SOURCE: {c.source} ({c.source_type})\n\n"
            f"{body_snippet}"
        )
    items_text = "\n---\n".join(blocks)
    return (
        f"Score each of these {len(candidates)} article(s) on the rubric below.\n\n"
        "Scoring rubric (0–10 integers each):\n"
        "  originality:       Novel angle or non-obvious insight (not just restating existing coverage)\n"
        "  real_world_impact: Relevance to business, tech, policy, or daily life\n"
        "  writing_quality:   Clarity, voice, and structure\n"
        "  interestingness:   Would a smart generalist want to read this?\n\n"
        "score = average of the four dimensions (float, 1 decimal place).\n\n"
        "Return ONLY this JSON structure (no markdown, no commentary):\n"
        '{"scores": [\n'
        "  {\n"
        '    "url": "exact URL as given above",\n'
        '    "title": "article title",\n'
        '    "originality": 8,\n'
        '    "real_world_impact": 7,\n'
        '    "writing_quality": 8,\n'
        '    "interestingness": 7,\n'
        '    "score": 7.5\n'
        "  }\n"
        "]}\n\n"
        f"ARTICLES:\n{items_text}"
    )


@retry(
    retry=retry_if_exception_type((anthropic.APIError, anthropic.RateLimitError)),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def _call_claude_score(client: anthropic.Anthropic, prompt: str) -> str:
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        temperature=0.3,
        system=_SCORE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def _parse_score_response(
    raw: str,
    candidates: list[ArticleCandidate],
) -> list[tuple[ArticleCandidate, float, ScoreBreakdown]]:
    """Parse Claude's scoring JSON and match results to candidates by URL.

    Falls back to index order if a URL is not found in the URL map
    (guards against Claude hallucinating slightly different URLs).
    """
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    data = json.loads(cleaned)

    score_items = data.get("scores", [])

    # Build URL → candidate lookup
    url_to_candidate: dict[str, ArticleCandidate] = {c.url: c for c in candidates}

    results: list[tuple[ArticleCandidate, float, ScoreBreakdown]] = []
    matched: set[str] = set()

    def _make_result(
        candidate: ArticleCandidate, item: dict
    ) -> tuple[ArticleCandidate, float, ScoreBreakdown]:
        breakdown = ScoreBreakdown(
            originality=float(item.get("originality", 0)),
            real_world_impact=float(item.get("real_world_impact", 0)),
            writing_quality=float(item.get("writing_quality", 0)),
            interestingness=float(item.get("interestingness", 0)),
        )
        # Recompute score from breakdown for reliability
        score = max(0.0, min(10.0, round(breakdown.average, 4)))
        return candidate, score, breakdown

    # Pass 1: URL-based matching
    for item in score_items:
        url = str(item.get("url", ""))
        candidate = url_to_candidate.get(url)
        if candidate and candidate.url not in matched:
            matched.add(candidate.url)
            results.append(_make_result(candidate, item))

    # Pass 2: Index fallback for any unmatched candidates
    unmatched_candidates = [c for c in candidates if c.url not in matched]
    unmatched_items = [
        item
        for item in score_items
        if str(item.get("url", "")) not in url_to_candidate
    ]
    for candidate, item in zip(unmatched_candidates, unmatched_items):
        log.warning(
            "URL mismatch in score response — using index fallback for %s", candidate.url
        )
        matched.add(candidate.url)
        results.append(_make_result(candidate, item))

    # Pass 3: Any remaining unmatched get score 0
    for c in candidates:
        if c.url not in matched:
            log.warning("Candidate not scored by Claude — assigning 0: %s", c.url)
            results.append((c, 0.0, ScoreBreakdown()))

    return results


# ── Public scoring API ────────────────────────────────────────────────────────


def score_new_candidates(
    candidates: list[ArticleCandidate],
    score_db: dict,
    settings: "Settings",
) -> list[tuple[ArticleCandidate, float, ScoreBreakdown]]:
    """Score all candidates, using the DB cache for known URLs.

    For candidates whose URL is already in *score_db*, the cached score is
    returned immediately without calling Claude.  All other candidates are
    scored in a single Claude batch call and their results are stored in
    *score_db* (in-place).

    Args:
        candidates: ArticleCandidate list from Step 2 (EXPAND).
        score_db:   Mutable score DB dict — updated in-place for new scores.
        settings:   Pipeline settings (API key, etc.).

    Returns:
        List of ``(ArticleCandidate, score, ScoreBreakdown)`` in the same
        order as *candidates*.
    """
    if not candidates:
        return []

    today = datetime.now().strftime("%Y-%m-%d")
    new_to_score: list[ArticleCandidate] = []
    cache_hits: dict[str, tuple[ArticleCandidate, float, ScoreBreakdown]] = {}

    for c in candidates:
        cached = lookup_score(score_db, c.url)
        if cached is not None:
            s_data = cached.get("scores", {})
            breakdown = ScoreBreakdown(
                originality=float(s_data.get("originality", 0)),
                real_world_impact=float(s_data.get("real_world_impact", 0)),
                writing_quality=float(s_data.get("writing_quality", 0)),
                interestingness=float(s_data.get("interestingness", 0)),
            )
            score = float(cached.get("score", breakdown.average))
            cache_hits[c.url] = (c, score, breakdown)
            log.debug(
                "Score cache HIT: %.1f [%s]  %s",
                score,
                cached.get("date_scored", "unknown"),
                c.url,
            )
        else:
            new_to_score.append(c)

    log.info(
        "[STEP 3 — SCORE] Cache hits: %d / %d  |  New to score via Claude: %d",
        len(cache_hits),
        len(candidates),
        len(new_to_score),
    )

    # ── Claude batch call for new candidates ──────────────────────────────────
    if new_to_score:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        prompt = _build_score_prompt(new_to_score)
        try:
            raw = _call_claude_score(client, prompt)
        except anthropic.APIError as exc:
            log.error("Claude scoring API error after retries: %s", exc)
            # Assign 0 so pipeline can still select from cache hits
            for c in new_to_score:
                cache_hits[c.url] = (c, 0.0, ScoreBreakdown())
        else:
            try:
                scored = _parse_score_response(raw, new_to_score)
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                log.error(
                    "Claude scoring response malformed: %s\nRaw:\n%s", exc, raw
                )
                for c in new_to_score:
                    cache_hits[c.url] = (c, 0.0, ScoreBreakdown())
            else:
                for c, score, breakdown in scored:
                    log.info(
                        "  %.1f  (O:%.0f R:%.0f W:%.0f I:%.0f)  %s",
                        score,
                        breakdown.originality,
                        breakdown.real_world_impact,
                        breakdown.writing_quality,
                        breakdown.interestingness,
                        c.url,
                    )
                    store_score(
                        score_db,
                        c.url,
                        c.title,
                        score,
                        breakdown,
                        c.source_type,
                        today,
                    )
                    cache_hits[c.url] = (c, score, breakdown)

    # Reconstruct in original candidate order
    results: list[tuple[ArticleCandidate, float, ScoreBreakdown]] = []
    for c in candidates:
        entry = cache_hits.get(c.url)
        if entry is not None:
            results.append(entry)
        else:
            results.append((c, 0.0, ScoreBreakdown()))

    return results
