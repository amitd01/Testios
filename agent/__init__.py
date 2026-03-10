"""Newsletter Digest Agent — package entry point."""

from __future__ import annotations

import logging
import time
from datetime import datetime

from .config import Settings, load_settings
from .dedup import (
    already_processed_ids,
    already_used_urls,
    load_sent_digests,
    record_sent_digest,
    save_sent_digests,
)
from .gmail import fetch_newsletters, get_gmail_service, send_digest
from .models import Article as Article  # noqa: F401 — public re-export
from .ranker import summarise_and_rank
from .renderer import build_html, build_plain_text
from .x_scraper.loader import load_x_data
from .x_scraper.scraper import main as _scrape_x

log = logging.getLogger(__name__)


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
    digests = load_sent_digests(settings.sent_digests_file)
    already_processed = already_processed_ids(digests)
    used_urls = already_used_urls(digests)
    log.info(
        "Dedup: %d message IDs, %d article URLs already processed.",
        len(already_processed),
        len(used_urls),
    )

    # ── Gmail ─────────────────────────────────────────────────────────────────
    try:
        service = get_gmail_service(settings)
    except Exception as exc:
        log.error("Failed to connect to Gmail: %s", exc, exc_info=True)
        return

    email_newsletters = fetch_newsletters(service, settings, already_processed)

    # ── X/Twitter scrape ─────────────────────────────────────────────────────
    import asyncio
    try:
        asyncio.run(_scrape_x(
            headless=True,
            scroll_attempts=settings.x_scroll_attempts,
            bookmarks_out=settings.x_bookmarks_csv,
            likes_out=settings.x_likes_csv,
        ))
    except Exception as exc:
        log.warning("X scrape failed (skipping X content): %s", exc)

    # ── X/Twitter data ────────────────────────────────────────────────────────
    x_newsletters = load_x_data(
        settings.x_bookmarks_csv,
        settings.x_likes_csv,
        used_urls,
    )

    # ── Merge sources ─────────────────────────────────────────────────────────
    all_newsletters = email_newsletters + x_newsletters

    if not all_newsletters:
        log.info("No content found from emails or X — nothing to send.")
        _finish_log(run_start, found=0, ranked=0, sent=False)
        return

    log.info(
        "Sources: %d email newsletters, %d X tweets.",
        len(email_newsletters),
        len(x_newsletters),
    )

    # ── Claude ────────────────────────────────────────────────────────────────
    articles, excluded, teaser, quote, quote_attribution = summarise_and_rank(all_newsletters, settings)

    if not articles:
        log.info("Claude found no substantive articles — nothing to send.")
        _finish_log(run_start, found=len(all_newsletters), ranked=0, sent=False)
        return

    # ── Build digest ──────────────────────────────────────────────────────────
    html = build_html(articles, settings.gmail_sender, teaser, quote, quote_attribution)
    plain = build_plain_text(articles, teaser, quote, quote_attribution)

    # ── Send or dry-run ───────────────────────────────────────────────────────
    if dry_run:
        print(html)
        log.info("Dry-run: HTML digest printed to stdout. No email sent.")
        _finish_log(run_start, found=len(all_newsletters), ranked=len(articles), sent=False)
        return

    try:
        send_digest(service, html, plain, settings)
        sent = True
    except Exception as exc:
        log.error("Failed to send digest: %s", exc, exc_info=True)
        sent = False

    # ── Update dedup state ────────────────────────────────────────────────────
    if sent:
        email_ids = [nl.id for nl in email_newsletters]
        article_urls = [a.url for a in articles]
        record_sent_digest(digests, today_key, email_ids, article_urls)
        save_sent_digests(settings.sent_digests_file, digests)

    _finish_log(run_start, found=len(all_newsletters), ranked=len(articles), sent=sent)
    log.info("=== Newsletter Agent run complete ===")


def _finish_log(
    run_start: float,
    found: int,
    ranked: int,
    sent: bool,
) -> None:
    duration = time.monotonic() - run_start
    log.info(
        "Run summary | items_found=%d articles_ranked=%d email_sent=%s duration_s=%.1f",
        found,
        ranked,
        sent,
        duration,
    )
