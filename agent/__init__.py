"""Newsletter Digest Agent — package entry point."""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta

from .config import Settings, load_settings
from .gmail import fetch_newsletters, get_gmail_service, send_digest
from .models import Article as Article  # noqa: F401 — public re-export
from .ranker import summarise_and_rank
from .renderer import build_html, build_plain_text

log = logging.getLogger(__name__)

_DEDUP_RETENTION_DAYS = 7


# ── Deduplication ─────────────────────────────────────────────────────────────


def _load_sent_digests(path: str) -> dict:
    if os.path.exists(path):
        try:
            with open(path) as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("Could not read %s: %s — starting fresh.", path, exc)
    return {}


def _save_sent_digests(path: str, data: dict) -> None:
    # Prune entries older than retention window
    cutoff = (datetime.now() - timedelta(days=_DEDUP_RETENTION_DAYS)).strftime("%Y-%m-%d")
    pruned = {k: v for k, v in data.items() if k >= cutoff}
    with open(path, "w") as fh:
        json.dump(pruned, fh, indent=2)


def _already_processed_ids(digests: dict) -> set[str]:
    ids: set[str] = set()
    for entry in digests.values():
        ids.update(entry.get("message_ids", []))
    return ids


# ── Logging setup ──────────────────────────────────────────────────────────────


def _configure_logging(settings: Settings) -> None:
    level = getattr(logging, settings.log_level, logging.INFO)

    if settings.log_format == "json":
        try:
            import structlog  # noqa: PLC0415

            structlog.configure(
                wrapper_class=structlog.make_filtering_bound_logger(level),
                logger_factory=structlog.PrintLoggerFactory(),
            )
        except ImportError:
            # structlog not installed — fall back to stdlib JSON-ish format
            fmt = '{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}'
            logging.basicConfig(level=level, format=fmt)
    else:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        )


# ── Main ───────────────────────────────────────────────────────────────────────


def main(dry_run: bool = False) -> None:
    """Run the full newsletter digest pipeline."""
    settings = load_settings()
    _configure_logging(settings)

    run_start = time.monotonic()
    today_key = datetime.now().strftime("%Y-%m-%d")
    log.info(
        "=== Newsletter Agent run started | date=%s dry_run=%s ===",
        today_key,
        dry_run,
    )

    # ── Deduplication state ───────────────────────────────────────────────────
    digests = _load_sent_digests(settings.sent_digests_file)
    already_processed = _already_processed_ids(digests)
    log.info("Dedup: %d message IDs already processed.", len(already_processed))

    # ── Gmail ─────────────────────────────────────────────────────────────────
    try:
        service = get_gmail_service(settings)
    except Exception as exc:
        log.error("Failed to connect to Gmail: %s", exc, exc_info=True)
        return

    newsletters = fetch_newsletters(service, settings, already_processed)

    if not newsletters:
        log.info("No newsletters found — nothing to send.")
        _finish_log(run_start, found=0, ranked=0, sent=False)
        return

    # ── Claude ────────────────────────────────────────────────────────────────
    articles, excluded = summarise_and_rank(newsletters, settings)

    if not articles:
        log.info("Claude found no substantive articles — nothing to send.")
        _finish_log(run_start, found=len(newsletters), ranked=0, sent=False)
        return

    # ── Build digest ──────────────────────────────────────────────────────────
    html = build_html(articles, settings.gmail_sender)
    plain = build_plain_text(articles)

    # ── Send or dry-run ───────────────────────────────────────────────────────
    if dry_run:
        print(html)
        log.info("Dry-run: HTML digest printed to stdout. No email sent.")
        _finish_log(run_start, found=len(newsletters), ranked=len(articles), sent=False)
        return

    try:
        send_digest(service, html, plain, settings)
        sent = True
    except Exception as exc:
        log.error("Failed to send digest: %s", exc, exc_info=True)
        sent = False

    # ── Update dedup state ────────────────────────────────────────────────────
    if sent:
        processed_ids = [nl.id for nl in newsletters]
        digests.setdefault(today_key, {"message_ids": []})
        digests[today_key]["message_ids"].extend(processed_ids)
        _save_sent_digests(settings.sent_digests_file, digests)

    _finish_log(run_start, found=len(newsletters), ranked=len(articles), sent=sent)
    log.info("=== Newsletter Agent run complete ===")


def _finish_log(
    run_start: float,
    found: int,
    ranked: int,
    sent: bool,
) -> None:
    duration = time.monotonic() - run_start
    log.info(
        "Run summary | newsletters_found=%d articles_ranked=%d email_sent=%s duration_s=%.1f",
        found,
        ranked,
        sent,
        duration,
    )
