"""Article history store — persist per-run results to a rolling JSON file.

Each run is keyed by date (YYYY-MM-DD).  Data older than 30 days is pruned
on every save to keep the file small.

Schema per entry:
{
  "2026-03-13": {
    "run_at":   "2026-03-13T11:00:17",
    "teaser":   "...",
    "included": [
      {
        "rank": 1, "title": "...", "url": "...", "source": "...",
        "score": 7.5,
        "scores": {"originality": 8, "real_world_impact": 7,
                   "writing_quality": 8, "interestingness": 7},
        "summary": "...", "tags": ["ai", "llm"], "source_type": "email"
      }
    ],
    "excluded": [
      {"subject": "...", "reason": "..."}
    ]
  }
}
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Article, ExcludedItem

log = logging.getLogger(__name__)

RETENTION_DAYS = 30


def load_history(path: str) -> dict:
    """Load history JSON from disk; returns empty dict if file missing or corrupt."""
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("Could not load history file %s: %s — starting fresh.", path, exc)
        return {}


def record_run(
    history: dict,
    run_key: str,
    articles: list[Article],
    excluded: list[ExcludedItem],
    teaser: str,
) -> None:
    """Write this run's results into the history dict (in-place).

    Args:
        history: Dict loaded by load_history(); mutated in place.
        run_key: Date string 'YYYY-MM-DD'.
        articles: Ranked Article objects from Claude.
        excluded: ExcludedItem objects from Claude.
        teaser: Editorial teaser string.
    """
    included_records = []
    for a in articles:
        included_records.append(
            {
                "rank": a.rank,
                "title": a.title,
                "url": a.url,
                "source": a.source,
                "score": a.score,
                "scores": {
                    "originality": a.scores.originality,
                    "real_world_impact": a.scores.real_world_impact,
                    "writing_quality": a.scores.writing_quality,
                    "interestingness": a.scores.interestingness,
                },
                "summary": a.summary,
                "tags": a.tags,
                "source_type": a.source_type,
            }
        )

    excluded_records = [
        {"subject": ex.subject, "reason": ex.reason} for ex in excluded
    ]

    history[run_key] = {
        "run_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "teaser": teaser,
        "included": included_records,
        "excluded": excluded_records,
    }
    log.debug(
        "History: recorded run %s (%d included, %d excluded).",
        run_key,
        len(included_records),
        len(excluded_records),
    )


def save_history(path: str, data: dict) -> None:
    """Prune entries older than RETENTION_DAYS and write to disk."""
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    pruned = {
        k: v
        for k, v in data.items()
        if _parse_run_key(k) >= cutoff
    }
    removed = len(data) - len(pruned)
    if removed:
        log.debug("History: pruned %d run(s) older than %d days.", removed, RETENTION_DAYS)

    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(pruned, fh, indent=2, ensure_ascii=False)
        log.info("History saved to %s (%d run(s)).", path, len(pruned))
    except OSError as exc:
        log.warning("Could not save history to %s: %s", path, exc)


def _parse_run_key(key: str) -> datetime:
    """Parse 'YYYY-MM-DD' key; return epoch on failure so bad keys are kept."""
    try:
        return datetime.strptime(key, "%Y-%m-%d")
    except ValueError:
        return datetime.min
