"""Newsletter Digest Agent — package entry point.

Pipeline Architecture (5-step)
================================
Step 1 — FILTER    Decide what is new and worth processing.
Step 2 — EXPAND    Turn each source into ArticleCandidate objects (links + bodies).
Step 3 — SCORE     Score candidates (score DB cache first, Claude for new ones).
Step 4 — SELECT    Pick today's newsletter (score ≥ min_threshold, top N articles).
Step 5 — PERSIST   Update Gmail labels, tweet DB, score DB, sent-digest state.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime

from .config import Settings, load_settings
from .dedup import (
    already_considered_tweets,
    already_processed_ids,
    already_used_urls,
    load_considered_tweets,
    load_sent_digests,
    record_considered_tweets,
    record_sent_digest,
    save_considered_tweets,
    save_sent_digests,
)
from .fetcher import extract_email_candidates, fetch_article as _fetch_article
from .gmail import (
    ensure_newsletter_label,
    fetch_newsletters,
    get_gmail_service,
    label_and_archive_messages,
    send_digest,
)
from .history import load_history, record_run, save_history
from .models import Article as Article  # noqa: F401 — public re-export
from .models import ArticleCandidate, ScoreBreakdown
from .ranker import generate_digest_text
from .renderer import build_html, build_plain_text
from .scorer import load_score_db, save_score_db, score_new_candidates
from .whitelist import build_whitelist_newsletters, fetch_gmail_whitelist_urls, load_whitelist_file
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
            fmt = '{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}'
            logging.basicConfig(level=level, format=fmt)
    else:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        )


# ── Helpers ───────────────────────────────────────────────────────────────────


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


def _dry_run_persist_log(
    all_email_ids: list[str],
    x_candidates: list[ArticleCandidate],
    all_scored: list[tuple[ArticleCandidate, float, ScoreBreakdown]],
    top: list[tuple[ArticleCandidate, float, ScoreBreakdown]],
    today_key: str,
    settings: Settings,
) -> None:
    """Log what Step 5 WOULD do in a live run (without writing anything)."""
    log.info("[DRY-RUN] Step 5 — PERSIST (simulation only, no writes):")
    log.info(
        "  [DRY-RUN] Would label %d Gmail message(s) with '%s' and archive from INBOX.",
        len(all_email_ids),
        settings.gmail_newsletter_label,
    )
    tweet_urls = list({c.origin_id for c in x_candidates})
    log.info(
        "  [DRY-RUN] Would append %d tweet URL(s) to considered_tweets.json under key '%s'.",
        len(tweet_urls),
        today_key,
    )
    new_score_urls = [
        c.url for c, _, _ in all_scored
    ]
    log.info(
        "  [DRY-RUN] Would write %d score record(s) to %s.",
        len(new_score_urls),
        settings.score_db_file,
    )
    article_urls = [c.url for c, _, _ in top]
    log.info(
        "  [DRY-RUN] Would update sent_digests.json with %d article URL(s).",
        len(article_urls),
    )
    log.info("  [DRY-RUN] Email send suppressed.")


# ── Main ───────────────────────────────────────────────────────────────────────


def main(dry_run: bool = False) -> None:
    """Run the full newsletter digest pipeline (5 explicit steps)."""
    settings = load_settings()
    _configure_logging(settings)

    run_start = time.monotonic()
    today_key = datetime.now().strftime("%Y-%m-%d")
    log.info(
        "=== Newsletter Agent run started | date=%s dry_run=%s ===",
        today_key,
        dry_run,
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 1 — FILTER: Load state, build exclusion sets
    # ═══════════════════════════════════════════════════════════════════════════
    log.info("[STEP 1 — FILTER]")

    # Sent-digest dedup (7-day rolling: Gmail message IDs + article URLs)
    digests = load_sent_digests(settings.sent_digests_file)
    already_processed = already_processed_ids(digests)
    used_urls = already_used_urls(digests)

    # Tweet consideration DB (permanent: tweet URLs seen by the pipeline)
    tweet_db = load_considered_tweets(settings.tweet_db_file)
    considered_tweet_urls = already_considered_tweets(tweet_db)

    # Article score DB (permanent: URL → cached score)
    score_db = load_score_db(settings.score_db_file)

    log.info(
        "  Dedup: %d email IDs | %d article URLs | %d considered tweet URLs | %d cached scores.",
        len(already_processed),
        len(used_urls),
        len(considered_tweet_urls),
        len(score_db),
    )

    # Gmail
    try:
        service = get_gmail_service(settings)
    except Exception as exc:
        log.error("Failed to connect to Gmail: %s", exc, exc_info=True)
        return

    raw_newsletters = fetch_newsletters(service, settings, already_processed)
    log.info(
        "  Emails from Gmail query: %d (label filter '-label:%s' applied).",
        len(raw_newsletters),
        settings.gmail_newsletter_label,
    )

    # X/Twitter scrape
    import asyncio
    try:
        asyncio.run(
            _scrape_x(
                headless=True,
                scroll_attempts=settings.x_scroll_attempts,
                bookmarks_out=settings.x_bookmarks_csv,
                likes_out=settings.x_likes_csv,
            )
        )
    except Exception as exc:
        log.warning("X scrape failed (skipping X content): %s", exc)

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 2 — EXPAND: Sources → ArticleCandidate list
    # ═══════════════════════════════════════════════════════════════════════════
    log.info("[STEP 2 — EXPAND]")

    all_candidates: list[ArticleCandidate] = []
    all_email_ids: list[str] = []  # all processed email IDs for Step 5 labelling

    # ── Email candidates (two-pass: body + links) ─────────────────────────────
    for nl in raw_newsletters:
        all_email_ids.append(nl.id)
        raw_candidates = extract_email_candidates(nl)
        # Article-level dedup: skip URLs already sent in a recent digest
        new_candidates = [c for c in raw_candidates if c.url not in used_urls]
        if len(raw_candidates) != len(new_candidates):
            log.debug(
                "  Email '%s': %d candidate(s) filtered by article dedup.",
                nl.subject[:50],
                len(raw_candidates) - len(new_candidates),
            )
        all_candidates.extend(new_candidates)

    log.info(
        "  Email expansion → %d candidate(s) from %d email(s).",
        sum(1 for c in all_candidates if c.source_type == "email"),
        len(raw_newsletters),
    )

    # ── X tweet candidates (tweet-URL dedup applied inside load_x_data) ───────
    x_candidates = load_x_data(
        settings.x_bookmarks_csv,
        settings.x_likes_csv,
        considered_tweet_urls=considered_tweet_urls,
        bookmark_lookback_days=settings.bookmark_lookback_days,
        fetch_fn=_fetch_article,
    )
    # Also filter by recently-used article URLs
    new_x = [c for c in x_candidates if c.url not in used_urls]
    if len(x_candidates) != len(new_x):
        log.debug(
            "  X tweets: %d candidate(s) filtered by article URL dedup.",
            len(x_candidates) - len(new_x),
        )
    all_candidates.extend(new_x)

    log.info(
        "  X tweet expansion → %d candidate(s) from %d tweet(s).",
        len(new_x),
        len(x_candidates),
    )

    # ── Whitelist candidates ───────────────────────────────────────────────────
    whitelist_urls = load_whitelist_file(settings.whitelist_file)
    whitelist_urls += fetch_gmail_whitelist_urls(service, settings.whitelist_label)
    whitelist_newsletters = build_whitelist_newsletters(
        whitelist_urls, used_urls, fetch_fn=_fetch_article
    )
    whitelist_candidates = [
        ArticleCandidate(
            url=nl.links[0] if nl.links else f"whitelist:{nl.id}",
            title=nl.subject,
            body=nl.body,
            source=nl.sender,
            source_type="whitelist",
            date=nl.date,
            origin_id=nl.id,
        )
        for nl in whitelist_newsletters
    ]
    all_candidates.extend(whitelist_candidates)
    log.info("  Whitelist → %d candidate(s).", len(whitelist_candidates))

    # ── Deduplicate by URL (across sources) ────────────────────────────────────
    seen_urls: set[str] = set()
    deduped: list[ArticleCandidate] = []
    for c in all_candidates:
        if c.url not in seen_urls:
            seen_urls.add(c.url)
            deduped.append(c)
    dedup_removed = len(all_candidates) - len(deduped)
    all_candidates = deduped

    log.info(
        "  Total candidates after cross-source dedup: %d (%d duplicate URL(s) removed).",
        len(all_candidates),
        dedup_removed,
    )

    if not all_candidates:
        log.info("No new content found from any source — nothing to send.")
        _finish_log(run_start, found=0, ranked=0, sent=False)
        return

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 3 — SCORE: Score candidates (DB cache + Claude for new ones)
    # ═══════════════════════════════════════════════════════════════════════════
    log.info("[STEP 3 — SCORE]")
    all_scored = score_new_candidates(all_candidates, score_db, settings)

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 4 — SELECT: Filter by threshold and pick top N
    # ═══════════════════════════════════════════════════════════════════════════
    log.info("[STEP 4 — SELECT]")

    min_score = settings.min_score_threshold
    max_articles = settings.max_articles

    eligible = [(c, s, sb) for c, s, sb in all_scored if s >= min_score]
    eligible.sort(key=lambda x: x[1], reverse=True)
    top = eligible[:max_articles]

    log.info(
        "  Eligible (score ≥ %.1f): %d | Selected (top %d): %d",
        min_score,
        len(eligible),
        max_articles,
        len(top),
    )
    for i, (c, score, _) in enumerate(top, 1):
        log.info(
            "    %d. %.1f — %s  [%s]",
            i,
            score,
            (c.title or c.url)[:70],
            c.source_type,
        )

    below = [(c, s) for c, s, _ in all_scored if s < min_score]
    for c, s in below:
        log.debug("  Below threshold: %.1f — %s", s, c.url)

    # ── Dry-run: log what WOULD happen in Step 5, then exit ──────────────────
    if dry_run:
        if top:
            log.info("[DRY-RUN] Would build digest with %d article(s).", len(top))
        else:
            log.info("[DRY-RUN] No articles above threshold — digest would be skipped.")
        _dry_run_persist_log(all_email_ids, x_candidates, all_scored, top, today_key, settings)
        _finish_log(run_start, found=len(all_candidates), ranked=len(top), sent=False)
        return

    if not top:
        log.info("No articles above threshold (%.1f) — nothing to send.", min_score)
        # Still persist: label emails and record tweets even on zero-article runs
        # so we don't reprocess the same sources next time.
        _persist_state(
            service=service,
            settings=settings,
            all_email_ids=all_email_ids,
            x_candidates=x_candidates,
            all_scored=all_scored,
            article_urls=[],
            tweet_db=tweet_db,
            score_db=score_db,
            digests=digests,
            today_key=today_key,
        )
        _finish_log(run_start, found=len(all_candidates), ranked=0, sent=False)
        return

    # ── Generate digest content (summaries, teaser, quote) ───────────────────
    articles, teaser, quote, quote_attribution = generate_digest_text(top, settings)

    if not articles:
        log.error("Digest text generation failed — nothing to send.")
        _finish_log(run_start, found=len(all_candidates), ranked=0, sent=False)
        return

    # ── Article history ───────────────────────────────────────────────────────
    run_history = load_history(settings.article_history_file)
    record_run(run_history, today_key, articles, [], teaser)
    save_history(settings.article_history_file, run_history)

    # ── Build and send digest ─────────────────────────────────────────────────
    html = build_html(articles, settings.gmail_sender, teaser, quote, quote_attribution)
    plain = build_plain_text(articles, teaser, quote, quote_attribution)

    try:
        send_digest(service, html, plain, settings)
        sent = True
    except Exception as exc:
        log.error("Failed to send digest: %s", exc, exc_info=True)
        sent = False

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 5 — PERSIST: Update all state files
    # ═══════════════════════════════════════════════════════════════════════════
    log.info("[STEP 5 — PERSIST]")

    # Resolve t.co shortlinks before storing article URLs in sent_digests.json
    from .fetcher import resolve_url as _resolve_url
    article_urls = [
        _resolve_url(a.url) if "t.co/" in a.url else a.url
        for a in articles
    ]

    _persist_state(
        service=service,
        settings=settings,
        all_email_ids=all_email_ids,
        x_candidates=x_candidates,
        all_scored=all_scored,
        article_urls=article_urls,
        tweet_db=tweet_db,
        score_db=score_db,
        digests=digests,
        today_key=today_key,
    )

    _finish_log(run_start, found=len(all_candidates), ranked=len(articles), sent=sent)
    log.info("=== Newsletter Agent run complete ===")


def _persist_state(
    *,
    service,
    settings: Settings,
    all_email_ids: list[str],
    x_candidates: list[ArticleCandidate],
    all_scored: list[tuple[ArticleCandidate, float, ScoreBreakdown]],
    article_urls: list[str],
    tweet_db: dict,
    score_db: dict,
    digests: dict,
    today_key: str,
) -> None:
    """Write all pipeline state updates (Step 5 — PERSIST).

    Called on both successful-send and zero-article-selected paths so sources
    are never re-processed in future runs regardless of whether a digest was sent.
    """
    # 1. Gmail: label all processed emails and archive from INBOX
    if all_email_ids:
        try:
            label_id = ensure_newsletter_label(service, settings.gmail_newsletter_label)
            label_and_archive_messages(service, all_email_ids, label_id)
            log.info(
                "  Labelled %d email(s) as '%s'.",
                len(all_email_ids),
                settings.gmail_newsletter_label,
            )
        except Exception as exc:
            log.warning("Gmail labelling failed (non-fatal): %s", exc)

    # 2. Tweet consideration DB: record all tweet URLs seen this run
    tweet_urls_this_run = list({c.origin_id for c in x_candidates})
    if tweet_urls_this_run:
        record_considered_tweets(tweet_db, today_key, tweet_urls_this_run)
        save_considered_tweets(settings.tweet_db_file, tweet_db)
        log.info(
            "  Recorded %d tweet URL(s) as considered in %s.",
            len(tweet_urls_this_run),
            settings.tweet_db_file,
        )

    # 3. Score DB: flush any new scores written in-place during Step 3
    save_score_db(settings.score_db_file, score_db)
    log.info("  Score DB saved: %d total entries.", len(score_db))

    # 4. Sent-digest dedup: record included article URLs + email IDs
    record_sent_digest(digests, today_key, all_email_ids, article_urls)
    save_sent_digests(settings.sent_digests_file, digests)
    if article_urls:
        log.info(
            "  sent_digests.json updated with %d article URL(s).", len(article_urls)
        )
