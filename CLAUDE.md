# CLAUDE.md — Newsletter Agent

This file is read automatically by Claude Code on every session. It provides full project context so work can resume seamlessly from any device.

---

## Project Overview

**newsletter_agent** is an autonomous daily newsletter digest called **"Amit's Reading List"**. It fetches Gmail newsletters and X/Twitter bookmarks/likes, uses Claude AI to score and rank content, and emails a curated HTML digest every morning at 11 AM IST via GitHub Actions.

**Owner:** Amit Das (`amitd01` on GitHub)
**Primary repo:** `amitd01/newsletter-agent` (private) — `origin` remote
**Mirror repo:** `amitd01/Testios` (public) — secondary push target
**Local path (primary dev machine):** `/Users/amitdas/Downloads/Code-Projects/newsletter_agent`

---

## Architecture — 5-Step Pipeline

```
STEP 1 — FILTER    Gmail: -label:Newsletter-Reviewed query
                   X:     considered_tweets.json dedup
         │
STEP 2 — EXPAND    Email Pass 1: body as candidate (>800 chars, ≤2 links)
                   Email Pass 2: fetch each link (cap 10/email)
                   X Type A: single external link → fetch article
                   X Type B: multi-link → fetch each → multiple candidates
                   X Type C: long-form tweet ≥200 words → tweet body is article
                   → list[ArticleCandidate]
         │
STEP 3 — SCORE     article_scores.json cache lookup first
                   New items → Claude batch call (temperature=0.3)
                   Same URL always returns same score (deterministic)
         │
STEP 4 — SELECT    Filter score ≥ 6.5 → sort desc → top 8
                   generate_digest_text() → teaser + quote (separate Claude call)
         │
STEP 5 — PERSIST   Label + archive Gmail messages ("Newsletter-Reviewed")
                   Write considered_tweets.json (30-day retention)
                   Write article_scores.json (permanent cache)
                   Send HTML + plain-text email via Gmail API
                   Commit state files back to repo [skip ci]
```

---

## Key Files

### Core pipeline
| File | Purpose |
|---|---|
| `agent/__init__.py` | 5-step pipeline orchestration — main entry point |
| `agent/config.py` | Pydantic settings — all env vars with defaults |
| `agent/models.py` | `ArticleCandidate`, `Newsletter`, `Article`, `ScoreBreakdown` dataclasses |
| `agent/gmail.py` | Gmail OAuth, fetch, label management, send digest |
| `agent/fetcher.py` | Two-pass email expansion, article body fetching |
| `agent/scorer.py` | Persistent score DB: load/save/lookup/store, Claude batch scoring |
| `agent/ranker.py` | `score_candidates()` (scoring) + `generate_digest_text()` (teaser/quote) |
| `agent/dedup.py` | `sent_digests` + `considered_tweets` state management |
| `agent/renderer.py` | HTML + plain-text email builder |
| `agent/extractor.py` | MIME body parsing, URL extraction |
| `agent/x_scraper/scraper.py` | Playwright automation for X bookmarks/likes |
| `agent/x_scraper/loader.py` | CSV → ArticleCandidate (tweet-URL dedup, Type A/B/C) |

### Entry points
| File | Usage |
|---|---|
| `run.py` | `python run.py` (live) or `python run.py --dry-run` |
| `run_scraper.py` | `python run_scraper.py` — standalone X session setup |

### Persistent state (committed to repo by CI after each run)
| File | What it tracks | Retention |
|---|---|---|
| `article_scores.json` | URL → score cache | Permanent |
| `considered_tweets.json` | Tweet URLs seen by pipeline | 30 days |
| `sent_digests.json` | Included article URLs + Gmail msg IDs | 7 days |
| `article_history.json` | Per-run article log | 30 days |
| `whitelist.txt` | Manually curated URLs (bypass score gate) | Permanent |

### CI/CD
| File | Purpose |
|---|---|
| `.github/workflows/newsletter.yml` | GitHub Actions: runs daily at 05:30 UTC (11:00 AM IST), also `workflow_dispatch` |

---

## Branches

| Branch | Role |
|---|---|
| `main` | Production — what GitHub Actions runs against |
| `dev` | Active development — merge to main when stable |

Workflow: develop on `dev` → test with dry-run → merge `dev → main` → GitHub Actions runs on `main`.

---

## CI Run History

| Date | Duration | Result | Notes |
|---|---|---|---|
| 2026-03-15 | 4m 2s | ✓ Success | 4 candidates, 1 selected (score 6.8), email sent, commit `bcc492d` |

---

## Tests

**128 tests across 8 files.** Run with: `python -m pytest tests/ -v`

| File | Tests | Focus |
|---|---|---|
| `tests/test_ranker.py` | 17 | Claude API, JSON parsing, scoring |
| `tests/test_extractor.py` | 17 | MIME parsing, link extraction |
| `tests/test_renderer.py` | 22 | HTML/plain-text email rendering |
| `tests/test_scorer.py` | 20 | Score DB cache, batch scoring |
| `tests/test_loader.py` | 25 | Tweet Type A/B/C, stale filtering, tweet-URL dedup |
| `tests/test_dedup.py` | 17 | `considered_tweets` 30-day retention |
| `tests/test_gmail_labels.py` | 10 | Label creation, archive |

---

## Working Conventions

- **Always confirm before `git push`, `git push --force`, or `gh workflow run`** — even if it was part of an agreed plan. Each push needs explicit confirmation.
- **Plan before execute** — write and review a plan before making code changes. User approves before implementation starts.
- **Targeted changes only** — do not refactor surrounding code, add docstrings, or make "improvements" beyond what was asked.
- **Branch discipline** — new features on `dev`, merge to `main` when ready.
- **State files are owned by CI** — `article_scores.json`, `considered_tweets.json`, `sent_digests.json`, `article_history.json` are committed by the GitHub Actions bot after each run. Do not manually commit these unless specifically asked.

---

## Secrets & Credentials (never commit these)

| Secret | Location |
|---|---|
| `ANTHROPIC_API_KEY` | `.env` locally; GitHub secret in CI |
| `DIGEST_RECIPIENT` | `.env` locally; GitHub secret |
| `GMAIL_SENDER` | `.env` locally; GitHub secret |
| `GMAIL_TOKEN_JSON` | `token.json` locally; GitHub secret |
| `GMAIL_CREDENTIALS_JSON` | `credentials.json` locally; GitHub secret |
| `X_STATE_JSON` | `state.json` locally; GitHub secret |

Files `token.json`, `credentials.json`, `state.json` are in `.gitignore`.

---

## Quick Commands

```bash
# Dry run (no email sent, no files written)
python run.py --dry-run

# Full local run
python run.py

# Run tests
python -m pytest tests/ -v

# Refresh X session (if scraping fails with auth error)
python run_scraper.py

# Trigger CI manually
gh workflow run "Daily Newsletter Digest" --ref main

# Check last CI run
gh run list --limit 5
```
