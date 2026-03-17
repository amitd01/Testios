# Newsletter Digest Agent

A production-ready autonomous pipeline that fetches Gmail newsletters and X/Twitter bookmarks & likes, uses Claude AI to rank and summarise them, and emails a curated daily HTML digest — **"Amit's Reading List"** — every morning at 11 AM IST via GitHub Actions.

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Requirements](#2-requirements)
3. [One-Time Setup](#3-one-time-setup)
4. [Environment Variables](#4-environment-variables)
5. [GitHub Secrets (CI)](#5-github-secrets-ci)
6. [Running Locally](#6-running-locally)
7. [Architecture & Data Flow](#7-architecture--data-flow)
8. [Codebase Commentary](#8-codebase-commentary)
9. [CI/CD: GitHub Actions](#9-cicd-github-actions)
10. [macOS launchd (Local Fallback)](#10-macos-launchd-local-fallback)
11. [Credential Renewal](#11-credential-renewal)
12. [Tests](#12-tests)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What It Does

Each run (daily, automated) executes a **5-step pipeline**:

1. **FILTER** — Queries Gmail with `-label:Newsletter-Reviewed` (emails already processed are excluded at the API level). Loads `considered_tweets.json` to skip X/Twitter tweet URLs already seen in previous runs.
2. **EXPAND** — Converts raw sources into `ArticleCandidate` objects. For emails: two passes per email — Pass 1 treats the email body itself as a candidate (if > 800 chars and ≤ 2 links); Pass 2 fetches each link in the body (cap: 10 per email). For X tweets: three types — Type A (single external link → fetch article), Type B (multiple links → fetch each → multiple candidates), Type C (long-form tweet ≥ 200 words → tweet body is the article).
3. **SCORE** — Each candidate is looked up in `article_scores.json` (persistent cache). Cache hits return the stored score immediately — same URL always gets the same score. New candidates are sent to Claude in a single batch call (`temperature=0.3`), scored on four dimensions (originality, real-world impact, writing quality, interestingness), and written to the cache.
4. **SELECT** — Filters candidates with score ≥ 6.5, sorts descending, takes top 8. A separate Claude call generates the editorial teaser and closing quote for only the selected articles.
5. **PERSIST** — Labels all processed Gmail messages `Newsletter-Reviewed` and archives them. Appends tweet URLs to `considered_tweets.json` (30-day retention). Updates `article_scores.json`. Sends the HTML + plain-text digest via Gmail API. Commits `sent_digests.json`, `article_history.json`, and `whitelist.txt` back to the repo.

**Key features:**
- 4-dimension article scoring: originality, real-world impact, writing quality, interestingness
- AI-generated editorial teaser (5–6 sentences) and closing quotable quote
- Source badges distinguishing newsletter vs X/Twitter content
- Dark-mode HTML email with inline CSS
- Exponential backoff retries on all network calls (Gmail, Claude)
- Graceful degradation: X scrape failure doesn't block email send

---

## 2. Requirements

### 2a. Python

**Python 3.12 or higher** is required.

- GitHub Actions CI uses Python 3.12 (set in `newsletter.yml`)
- macOS development uses Python 3.14 (configured in `com.newsletter.digest.plist`)

Install Python: [python.org/downloads](https://www.python.org/downloads/) or via Homebrew:
```bash
brew install python@3.12
```

### 2b. Python Libraries

Install with: `pip install -r requirements.txt`

| Package | Version | Purpose |
|---|---|---|
| `anthropic` | `>=0.40.0` | Claude API client — used to call `claude-sonnet-4-20250514` |
| `google-auth` | `>=2.28.0` | Gmail OAuth2 core library |
| `google-auth-oauthlib` | `>=1.2.0` | OAuth2 desktop app flow (browser-based consent) |
| `google-auth-httplib2` | `>=0.2.0` | HTTP transport adapter for Google APIs |
| `google-api-python-client` | `>=2.120.0` | Gmail REST API wrapper (fetch, send) |
| `pydantic-settings` | `>=2.2.0` | Config management — reads env vars and `.env` files |
| `python-dotenv` | `>=1.0.0` | `.env` file parsing (used by pydantic-settings) |
| `tenacity` | `>=8.2.0` | Retry logic with configurable exponential backoff |
| `structlog` | `>=24.1.0` | Structured JSON logging (optional; falls back to stdlib) |
| `playwright` | `>=1.40.0` | Headless Chromium automation for X/Twitter scraping |

### 2c. Development Dependencies

Install with: `pip install -r requirements-dev.txt`

| Package | Purpose |
|---|---|
| `pytest` | Test runner |
| `pytest-mock` | Mocking fixtures for unit tests |
| `black` | Code formatter |
| `ruff` | Fast Python linter |

### 2d. System Binaries

#### Playwright Chromium Browser

Playwright requires a Chromium binary (~300 MB) and system libraries. Install once after `pip install playwright`:

```bash
playwright install chromium --with-deps
```

- `--with-deps` installs OS-level dependencies (libglib, libnss, libasound, etc.) needed on Ubuntu/CI
- On macOS, system libs are already present; `--with-deps` is a no-op but harmless
- GitHub Actions runs `playwright install chromium --with-deps` automatically in the workflow

### 2e. Gmail API Access (One-Time)

See [Section 3a](#3a-google-cloud--gmail-api) below.

### 2f. X/Twitter Session (One-Time)

See [Section 3b](#3b-xtwitter-session) below.

---

## 3. One-Time Setup

### 3a. Google Cloud & Gmail API

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) → create or select a project.
2. Enable the Gmail API: **APIs & Services → Library → search "Gmail API" → Enable**.
3. Create OAuth credentials: **APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app**.
4. Download the JSON and save it as `credentials.json` in the project root.
5. Add your Gmail address as a test user: **OAuth consent screen → Test users → Add Users**.
6. Run the agent once to trigger the browser OAuth flow:

```bash
python run.py --dry-run
```

A browser window opens asking you to sign in and grant the scope `https://www.googleapis.com/auth/gmail.modify`. After approval, `token.json` is saved to the project root. All subsequent runs are fully automatic — the `refresh_token` inside is stable and does not expire.

### 3b. X/Twitter Session

The scraper uses Playwright to log into X and save cookies to `state.json`:

```bash
python run_scraper.py      # opens Chromium — log in to X, then press Enter
```

After login, `state.json` is created. Keep it secret — it contains your X session cookies.

**For GitHub Actions CI:** upload the session file as a secret:
```bash
cat state.json | gh secret set X_STATE_JSON -R your-username/newsletter-agent
```

**Renewing the session:** If X scraping fails with an authentication error, repeat the `run_scraper.py` step locally and update the secret.

---

## 4. Environment Variables

Create a `.env` file in the project root (copy `.env.example` as a template).

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | — | Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `DIGEST_RECIPIENT` | **Yes** | — | Email address that receives the digest |
| `GMAIL_SENDER` | **Yes** | — | Gmail account used to send (must match OAuth credentials) |
| `GMAIL_TOKEN_FILE` | No | `token.json` | Path to OAuth token file |
| `GMAIL_CREDS_FILE` | No | `credentials.json` | Path to OAuth credentials file |
| `MAX_NEWSLETTERS` | No | `20` | Max Gmail messages to process per run |
| `LOOKBACK_HOURS` | No | `24` | Hours back to search for newsletters |
| `SUMMARY_MAX_WORDS` | No | `250` | Target word count for Claude-generated summaries |
| `SENT_DIGESTS_FILE` | No | `sent_digests.json` | Deduplication state file path |
| `X_BOOKMARKS_CSV` | No | `bookmarks.csv` | Output path for X bookmarks CSV |
| `X_LIKES_CSV` | No | `likes.csv` | Output path for X likes CSV |
| `X_USERNAME` | No | `""` | X/Twitter handle — required to scrape likes |
| `X_SCROLL_ATTEMPTS` | No | `25` | Number of scroll iterations when scraping X |
| `NEWSLETTER_SENDERS` | No | `""` | Extra sender emails/domains to include (comma-separated) |
| `BLOCKLIST_SENDERS` | No | `""` | Sender emails/domains to skip (comma-separated) |
| `LOG_LEVEL` | No | `INFO` | Logging level: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `LOG_FORMAT` | No | `text` | Log format: `text` (human-readable) or `json` (structured via structlog) |
| `GMAIL_NEWSLETTER_LABEL` | No | `Newsletter-Reviewed` | Gmail label applied to every processed email; used in the `-label:` filter to prevent re-processing |
| `TWEET_DB_FILE` | No | `considered_tweets.json` | Permanent log of all tweet URLs that have entered the pipeline (30-day retention) |
| `SCORE_DB_FILE` | No | `article_scores.json` | Persistent per-URL article score cache — same URL always returns the same score |
| `MIN_SCORE_THRESHOLD` | No | `6.5` | Minimum average score (0–10) an article must reach to be included in the digest |
| `MAX_ARTICLES` | No | `8` | Maximum number of articles per digest |
| `WHITELIST_FILE` | No | `whitelist.txt` | Plain-text file with one manually curated URL per line; these bypass the score gate |

**Note on `ANTHROPIC_API_KEY`:** Claude Desktop exports this variable as an empty string into child processes. The `load_settings()` function detects and temporarily removes the empty variable before loading settings so the value in `.env` takes precedence.

---

## 5. GitHub Secrets (CI)

Configure these in your repo under **Settings → Secrets and variables → Actions**:

| Secret | How to Get |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `DIGEST_RECIPIENT` | Your email address |
| `GMAIL_SENDER` | Your Gmail address |
| `GMAIL_TOKEN_JSON` | `cat token.json` (generated after first OAuth run) |
| `GMAIL_CREDENTIALS_JSON` | `cat credentials.json` (downloaded from Google Cloud) |
| `X_STATE_JSON` | `cat state.json` (generated after first `run_scraper.py` run) |

Set secrets via the GitHub CLI:
```bash
cat token.json        | gh secret set GMAIL_TOKEN_JSON        -R user/repo
cat credentials.json  | gh secret set GMAIL_CREDENTIALS_JSON  -R user/repo
cat state.json        | gh secret set X_STATE_JSON            -R user/repo
```

---

## 6. Running Locally

```bash
# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Copy and fill in environment variables
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, DIGEST_RECIPIENT, GMAIL_SENDER

# First-time Gmail OAuth (opens browser)
python run.py --dry-run

# First-time X login (opens browser, save session)
python run_scraper.py

# Dry-run: prints HTML digest to stdout, no email sent
python run.py --dry-run

# Full run: send the digest
python run.py

# Run tests
make test                # or: pytest tests/ -v

# Lint / format
make lint                # ruff check .
make format              # black .
```

---

## 7. Architecture & Data Flow

```
INPUTS: Gmail (OAuth2)           X/Twitter (Playwright)
             │                          │
             ▼                          ▼
        fetch_newsletters()     scraper.main() ──► bookmarks.csv / likes.csv
             │                  load_x_data()
             └──────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  STEP 1 — FILTER        │
                    │  Gmail: -label:         │
                    │    Newsletter-Reviewed  │
                    │  X: considered_tweets   │
                    │     .json dedup         │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  STEP 2 — EXPAND        │
                    │  Email Pass 1: body     │
                    │    as candidate         │
                    │  Email Pass 2: fetch    │
                    │    each link (cap 10)   │
                    │  X Type A/B/C tweets    │
                    │  → ArticleCandidate[]   │
                    └───────────┬────────────┘
                                │
          article_scores.json ──►
                    ┌───────────▼────────────┐
                    │  STEP 3 — SCORE         │
                    │  Cache hits: reuse DB   │
                    │  New items: Claude API  │
                    │    batch (temp=0.3)     │
                    │  Write new scores → DB  │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  STEP 4 — SELECT        │
                    │  Filter score ≥ 6.5     │
                    │  Sort desc → top 8      │
                    │  generate_digest_text() │
                    │  (teaser + quote)        │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  STEP 5 — PERSIST       │
                    │  Label + archive Gmail  │
                    │  Write tweet DB         │
                    │  Write score DB         │
                    │  Send email digest      │
                    │  Commit state to repo   │
                    └────────────────────────┘
```

### Module Map

```
newsletter_agent/
├── agent/
│   ├── __init__.py          # 5-step pipeline orchestration (main entry point)
│   ├── config.py            # Pydantic settings, .env loading
│   ├── models.py            # Data classes: ArticleCandidate, Newsletter, Article, ScoreBreakdown
│   ├── gmail.py             # Gmail OAuth, fetch newsletters, label management, send digest
│   ├── extractor.py         # MIME body parsing, URL extraction
│   ├── fetcher.py           # Two-pass email expansion, article body fetching (cap 10/email)
│   ├── scorer.py            # Persistent score DB: load/save/lookup/store, Claude batch scoring
│   ├── ranker.py            # score_candidates() + generate_digest_text() (separate Claude call)
│   ├── dedup.py             # sent_digests + considered_tweets state read/write
│   ├── renderer.py          # HTML and plain-text email builder
│   └── x_scraper/
│       ├── scraper.py       # Playwright automation for X bookmarks/likes
│       └── loader.py        # CSV → ArticleCandidate objects (tweet-URL-based dedup, Type A/B/C)
├── tests/
│   ├── test_ranker.py       # Claude API + JSON parsing tests
│   ├── test_extractor.py    # MIME/link extraction tests
│   ├── test_renderer.py     # HTML/plain-text rendering tests
│   ├── test_scorer.py       # Score DB: cache hits, new scoring, DB roundtrip
│   ├── test_loader.py       # X tweet type classification (A/B/C), stale filtering
│   ├── test_dedup.py        # considered_tweets tracking, 30-day retention
│   └── test_gmail_labels.py # ensure_newsletter_label, label_and_archive_messages
├── .github/workflows/
│   └── newsletter.yml       # GitHub Actions CI/CD workflow
├── run.py                   # CLI: python run.py [--dry-run]
├── run_scraper.py           # CLI: standalone X scraper (first-time login)
├── article_scores.json      # Persistent score cache (committed to repo)
├── considered_tweets.json   # Permanent tweet URL log (committed to repo)
├── sent_digests.json        # 7-day article dedup state (committed to repo)
├── requirements.txt
├── requirements-dev.txt
└── Makefile
```

---

## 8. Codebase Commentary

### `agent/config.py` — Settings & Config Loading

**Purpose:** Load and validate all configuration from environment variables and `.env`.

Uses `pydantic-settings` (`BaseSettings`) which automatically reads env vars and `.env` files. All fields map directly to the environment variables listed in [Section 4](#4-environment-variables).

**Key design note — `load_settings()`:**

```python
def load_settings() -> Settings:
    """Load settings, working around Claude Desktop's empty ANTHROPIC_API_KEY."""
    import os
    _sentinel = object()
    raw = os.environ.get("ANTHROPIC_API_KEY", _sentinel)
    _removed = raw is not _sentinel and not str(raw).strip()
    if _removed:
        del os.environ["ANTHROPIC_API_KEY"]
    try:
        return Settings()
    finally:
        if _removed:
            os.environ["ANTHROPIC_API_KEY"] = ""
```

Claude Desktop exports `ANTHROPIC_API_KEY=""` (empty string) into the environment of all child processes. Since env vars take precedence over `.env` in pydantic-settings, this would override the real key from `.env`. The workaround: if the env var is present but empty, temporarily delete it before constructing `Settings()`, then restore it in `finally`.

**Helper properties on `Settings`:**
- `newsletter_senders_list` — splits `NEWSLETTER_SENDERS` on commas, strips whitespace
- `blocklist` — splits `BLOCKLIST_SENDERS`, lowercases for case-insensitive matching

---

### `agent/models.py` — Data Classes

**Purpose:** Typed data containers used across the pipeline.

```python
@dataclass
class ArticleCandidate:
    url: str          # Canonical article URL (t.co resolved for X items)
    title: str        # From fetched page <title> or tweet subject
    body: str         # Fetched article text (or tweet text for Type C)
    source: str       # "Author / Newsletter Name"
    source_type: str  # "email" | "x" | "whitelist"
    date: str         # Tweet timestamp or email date
    origin_id: str    # Gmail message ID or tweet URL (used in Step 5 for labelling/tracking)
```

```python
@dataclass
class Newsletter:
    id: str           # Gmail message ID (e.g. "18f4a...") or X tweet URL prefixed with "x:"
    subject: str      # Email subject or "[Bookmarks] @author"
    sender: str       # Sender email or "@author (via Bookmarks)"
    date: str         # Date string
    body: str         # Extracted plain text body
    links: list[str]  # Extracted article URLs (up to 6 per email)
```

```python
@dataclass
class ScoreBreakdown:
    originality: float        # Novel angle or non-obvious insight (0–10)
    real_world_impact: float  # Relevance to business/tech/policy/life (0–10)
    writing_quality: float    # Clarity, voice, structure (0–10)
    interestingness: float    # Would a smart generalist want to read this? (0–10)

    @property
    def average(self) -> float: ...  # Mean of the four scores
```

```python
@dataclass
class Article:
    rank: int                 # Position in digest (1 = best)
    title: str                # Article title
    url: str                  # Article URL
    source: str               # Newsletter name or X author
    date: str                 # Date string
    summary: str              # Claude-generated summary
    source_type: str          # "email" or "x"
    tags: list[str]           # Topic tags generated by Claude
    score: float              # Overall score (average of 4 dimensions)
    scores: ScoreBreakdown    # Per-dimension breakdown
```

```python
@dataclass
class ExcludedItem:
    subject: str   # Email subject Claude rejected
    reason: str    # Why it was excluded (promotional, no article, etc.)
```

---

### `agent/gmail.py` — Gmail Integration

**Purpose:** OAuth2 authentication, newsletter fetching, and digest sending.

#### Label Management — `ensure_newsletter_label(service)` / `label_and_archive_messages(service, msg_ids, label_id)`

Two new functions added as part of the Step 5 PERSIST logic:

- **`ensure_newsletter_label(service)`** — Calls `labels.list()` to find an existing label named `"Newsletter-Reviewed"`. If not found, calls `labels.create()` to create it. Returns the label ID. Idempotent — safe to call on every run.
- **`label_and_archive_messages(service, msg_ids, label_id)`** — For each message ID, calls `messages.modify()` with `addLabelIds=[label_id]` and `removeLabelIds=["INBOX"]`. Labels the email AND archives it in one API call. Called with ALL processed email IDs at Step 5 — even emails that contributed no selected articles.

These two functions are what enable the Gmail `-label:Newsletter-Reviewed` filter in Step 1: once an email is labelled here, it can never re-enter the pipeline.

#### Authentication — `get_gmail_service(settings)`

OAuth2 token lifecycle:
1. Load existing `token.json` if present.
2. If credentials are invalid/expired → call `creds.refresh(Request())`.
3. If no valid credentials exist → run `InstalledAppFlow` (opens browser).
4. Save refreshed credentials back to `token.json`.
5. Return a `googleapiclient.discovery.Resource` (Gmail service).

The `refresh_token` inside `token.json` is stable — it does not change when the access token is refreshed, so the file only needs to be created once.

#### Newsletter Fetching — `fetch_newsletters(service, settings, already_processed)`

Builds a Gmail search query combining:
- **Newsletter platform domains** (9 domains): `substack.com`, `beehiiv.com`, `ghost.io`, `mailchimp.com`, `convertkit.com`, `kit.com`, `buttondown.email`, `sendgrid.net`, `sparkpostmail.com`
- **Known newsletter senders** (6 specific addresses): Farnam Street, Benedict Evans, Morning Brew, a16z, TLDR, Lenny's Newsletter
- **Label filter**: `label:newsletters`
- **User-provided** `NEWSLETTER_SENDERS` extra senders
- **Exclusions**: promotions, bounce/delivery failure keywords
- **Date filter**: `after:{since}` (24 hours ago by default)

For each fetched message:
- Skips if message ID is in `already_processed` set (dedup)
- Extracts From/Subject/Date headers
- Checks sender against blocklist (case-insensitive substring match)
- Extracts body via `extract_body()`
- Extracts links via `extract_article_links()`
- Creates a `Newsletter` object

All Gmail API calls (`list`, `get`, `send`) are decorated with `@retry` from tenacity:
- Up to 3 attempts
- Exponential backoff: 2–30 seconds between retries
- Retries on `HttpError`

#### Sending — `send_digest(service, html, plain_text, settings)`

Creates a MIME multipart message:
- `multipart/alternative` with both `text/plain` and `text/html` parts
- Subject: `"Amit's Top Reads — {date}"`
- From/To from settings
- Base64url-encodes the raw message, sends via `users.messages.send()`

---

### `agent/extractor.py` — Body Parsing & Link Extraction

**Purpose:** Extract readable text and article URLs from Gmail's MIME payloads.

#### `extract_body(payload)` — MIME Walking

Gmail delivers messages as a nested MIME tree. The function recursively walks this tree:
- For `text/plain` parts: decodes base64 body, accumulates text
- For `text/html` parts: stores as fallback if no plain text found
- For `multipart/alternative` and `multipart/mixed`: recurses into sub-parts

Plain text is preferred; HTML is used only if no plain text exists.

#### `extract_article_links(body, cap=6)` — URL Extraction

1. **Substack special case**: Looks for canonical web-view URL pattern (`"View this ... on the web at https://..."`) — returns it first if found, as it's the canonical article link.
2. **General extraction**: Finds all `http://` / `https://` URLs in the body via regex.
3. **Filtering**: Removes URLs matching `_SKIP_PATTERNS` — a regex covering tracking and utility links: `unsubscribe`, `track`, `redirect`, `pixel`, `beacon`, `manage`, `preferences`, `open.php`, `click.php`, etc.
4. **Deduplication**: Removes duplicate URLs.
5. **Cap**: Returns at most `cap` (default 6) URLs.

---

### `agent/scorer.py` — Persistent Score Database

**Purpose:** Maintain a permanent per-URL article score cache so the same article always gets the same score across runs.

#### Score DB format (`article_scores.json`)

```json
{
  "https://example.com/article": {
    "score": 7.5,
    "scores": {"originality": 8, "real_world_impact": 7, "writing_quality": 8, "interestingness": 7},
    "title": "Article Title",
    "date_scored": "2026-03-13",
    "source_type": "email"
  }
}
```

#### Key Functions

- **`load_score_db(path)`** — Reads `article_scores.json`; returns `{}` if the file doesn't exist (first run).
- **`save_score_db(path, db)`** — Writes the DB to disk. No pruning — the cache is permanent.
- **`lookup_score(db, url)`** — Returns the stored record for a URL, or `None` if not found.
- **`store_score(db, url, title, score, scores, source_type, date_scored)`** — Adds or updates a record in the in-memory DB (caller must call `save_score_db()` to persist).
- **`score_new_candidates(candidates, score_db, settings)`** — Splits candidates into cached vs new. Cached ones return their stored score immediately. New ones are sent to Claude in a **single batch call** (`temperature=0.3`), scored, stored in the DB, and returned. Returns `list[tuple[ArticleCandidate, float, ScoreBreakdown]]` for all candidates.

**Why `temperature=0.3`:** Low temperature makes Claude's scoring more deterministic. Combined with the DB cache (same URL → same score), this means score comparisons across days are meaningful — a 7.8 today is genuinely better than a 7.2 from last week.

---

### `agent/ranker.py` — Claude AI Integration

**Purpose:** Send newsletter content to Claude, parse the JSON response, and return ranked articles.

#### Model & Limits

- **Model**: `claude-sonnet-4-20250514`
- **Email body truncation**: 3,000 characters (token budget control)
- **Tweet body truncation**: 500 characters (tweets are short by design)
- **Max tokens**: `max(4096, SUMMARY_MAX_WORDS * 30)` — scales with requested summary length

#### Claude's JSON Schema

Claude is instructed to return **only** a JSON object (no markdown) with this structure:

```json
{
  "teaser": "5–6 sentence editorial intro previewing today's picks with energy and voice",
  "quote": "A single verbatim, thought-provoking sentence from one of the ranked articles",
  "quote_attribution": "Short attribution — article title or author name",
  "articles": [
    {
      "rank": 1,
      "title": "Article title",
      "url": "https://...",
      "source": "Newsletter or @author name",
      "date": "March 10, 2026",
      "summary": "200–250 word summary...",
      "tags": ["AI", "startups"],
      "score": 8.5,
      "scores": {
        "originality": 9.0,
        "real_world_impact": 8.0,
        "writing_quality": 8.5,
        "interestingness": 8.5
      }
    }
  ],
  "excluded": [
    { "subject": "Weekly Digest #42", "exclude_reason": "Promotional email with no substantive article" }
  ]
}
```

#### Scoring Rubric

Each article is scored 0–10 on four dimensions:

| Dimension | Description |
|---|---|
| **Originality** | Novel angle or non-obvious insight — not restating existing coverage |
| **Real World Impact** | Relevance to business, technology, policy, or daily life |
| **Writing Quality** | Clarity, voice, and structure |
| **Interestingness** | Would a smart, curious generalist want to read this? |

Final ranking is by the average of all four dimensions.

#### Two Separate Claude Calls (Architecture Change)

The old `summarise_and_rank()` function did everything in one call — scoring AND generating the teaser/quote. This has been split into two concerns:

- **`score_candidates(candidates, settings)`** — Scoring only. Sends `ArticleCandidate` objects to Claude, gets back per-article scores on four dimensions. Called by `scorer.py`'s `score_new_candidates()`. No teaser, no summary prose — just numbers.
- **`generate_digest_text(top_articles, settings)`** — Digest generation only. Receives only the selected articles (≤ 8) and generates the editorial teaser (5–6 sentences) and closing quotable quote. Called after Step 4 SELECT, so Claude only writes prose for articles that will actually appear in the digest.

**Why split?** Scoring is evaluation; it should be deterministic (`temperature=0.3`) and cacheable. Digest text is creative writing; it runs only on the final selection. Keeping them separate prevents the cache from storing summaries alongside scores, and ensures the teaser always reflects today's specific selection.

#### Key Functions

- `_build_system_prompt(max_words)` — instructs Claude to act as a high-standards newsletter curator
- `_build_user_template(max_words)` — template for the user message with rules, scoring rubric, and JSON output spec
- `_clean_json(raw)` — strips markdown code fences (` ```json ... ``` `) that Claude sometimes wraps around JSON
- `_parse_response(raw)` → `tuple[list[Article], list[ExcludedItem], str, str, str]` — parses JSON, constructs dataclass objects, returns 5-tuple
- `_call_claude(client, prompt, system_prompt, max_tokens)` — API call with tenacity retry (up to 3 attempts, 1–60s backoff, on `APIError` or `RateLimitError`)
- `generate_digest_text(top_articles, settings)` — orchestrates digest generation; returns empty strings on error (digest is sent without teaser/quote rather than crashing)

---

### `agent/dedup.py` — Deduplication State

**Purpose:** Prevent the same newsletter or article from appearing in multiple digests. Also tracks all tweet URLs that have entered the pipeline — not just those whose articles were included.

#### `sent_digests.json` — Article dedup (7-day rolling window)

```json
{
  "2026-03-10": {
    "message_ids": ["18f4a...", "18f4b..."],
    "article_urls": ["https://example.com/article-1", "https://example.com/article-2"]
  },
  "2026-03-09": { ... }
}
```

`save_sent_digests()` prunes entries older than 7 days before writing.

#### `considered_tweets.json` — Tweet consideration log (30-day retention)

```json
{
  "2026-03-13": ["https://x.com/user/status/123", "https://x.com/user/status/456"],
  "2026-03-12": ["https://x.com/user/status/111"]
}
```

New functions added to `dedup.py`:
- **`load_considered_tweets(path)`** — Loads the file; returns `{}` if missing.
- **`save_considered_tweets(path, db)`** — Prunes entries older than 30 days before writing.
- **`already_considered_tweets(db)`** — Returns a flat `set[str]` of all tweet URLs across all date keys. Used in Step 1 to filter the X scraper output.
- **`record_considered_tweets(db, today_key, tweet_urls)`** — Appends this run's tweet URLs under today's date key. Called at Step 5 for ALL tweet URLs that entered the pipeline — regardless of whether their articles scored above threshold.

**Why 30 days (not 7)?** X bookmarks can be up to 14 days old. A 7-day window would fail to exclude a bookmark from 10 days ago. 30 days provides a wide enough margin.

**Why committed to the repo**: GitHub Actions runs on ephemeral Ubuntu containers. All three state files (`sent_digests.json`, `considered_tweets.json`, `article_scores.json`) are committed back after each run so the next day's CI starts with the correct state.

---

### `agent/renderer.py` — Email Builder

**Purpose:** Render ranked articles as a polished HTML email and plain-text fallback.

#### HTML Email (`build_html`)

Full HTML5 document with inline `<style>` CSS. Key design elements:

- **Header**: Dark navy (`#1a1a2e`) bar with "Amit's Reading List" branding
- **Anchor navigation**: Rendered for digests with 5+ articles; each article has an `id="article-N"` anchor
- **Editorial teaser**: Optional intro block shown before articles if Claude generated one
- **Article cards**: Each shows:
  - Rank badge (`# 1 BEST READ` or `# N`)
  - Source badge (`from Newsletter` in blue or `from X` in grey)
  - Linked title
  - Source & date meta line
  - Claude summary
  - Score pills: **O** (originality, blue) · **I** (impact, green) · **W** (writing, brown) · **X** (interestingness, purple) · **avg**
  - Topic tags
- **Quote section**: Blockquote with left-border accent, attribution line
- **Dark mode**: Full `@media (prefers-color-scheme: dark)` overrides for all elements
- **Max width**: 680px, centred, white background, subtle shadow

#### Plain Text (`build_plain_text`)

Minimal fallback for email clients without HTML support. Includes:
- Title and date
- Optional teaser
- Per-article block: rank, title, source/date, score, URL, summary
- Optional quote block

Both functions accept `teaser`, `quote`, `quote_attribution` parameters (default to `""` — omitted if empty).

---

### `agent/x_scraper/scraper.py` — X/Twitter Scraper

**Purpose:** Headless Playwright automation to scrape X bookmarks and likes.

#### Browser Setup

Launches Chromium with `--disable-blink-features=AutomationControlled` and `--no-sandbox` to avoid bot detection. Uses `persistent_context` with `state.json` for session persistence.

#### Session Management

On startup, checks if `auth_token` cookie is present:
- **Cookie found**: Proceeds headlessly (normal CI path)
- **No cookie + GitHub Actions**: Raises `RuntimeError` — CI cannot interactively log in
- **No cookie + local**: Opens browser, waits for `input("Press Enter after logging in...")`, saves session

#### Link Extraction

For each tweet, extracts embedded external links:
```python
link_elements = await tweet.query_selector_all("a[href^='http']")
```
Then filters out X-internal domains (`twitter.com`, `x.com`, `t.co`):
```python
_x_internal = {"twitter.com", "x.com", "t.co"}
domain = urlparse(link_href).netloc.lstrip("www.")
is_x_internal = any(domain == d or domain.endswith("." + d) for d in _x_internal)
```

**Why this approach:** X pre-expands some URLs (e.g., GitHub links) directly in the DOM instead of keeping them as `t.co` shortlinks. Using `a[href^='http']` with domain filtering captures both expanded and shortened URLs correctly.

#### Scroll Behaviour

Scrolls the page `scroll_attempts` times (default 25), collecting tweet data on each iteration. Deduplicates by tweet URL. For bookmarks: no age filter (all bookmarks collected). For likes: 14-day age filter.

#### `main(headless, scroll_attempts, bookmarks_out, likes_out)`

Accepts parameters for integration with the main pipeline:
- `bookmarks_out` / `likes_out`: CSV file paths (passed from `Settings`)
- `scroll_attempts`: configurable via `Settings.x_scroll_attempts`

---

### `agent/x_scraper/loader.py` — X CSV Loader

**Purpose:** Convert X scraper CSV output into `ArticleCandidate` objects for the pipeline.

Reads `bookmarks.csv` and `likes.csv` (columns: `url, author, text, timestamp, embedded_links`).

#### Tweet dedup (tweet-URL-based, not article-URL-based)

The dedup input is now `considered_tweet_urls: set[str]` — the set of **tweet URLs** that have previously entered the pipeline. A tweet is skipped if `tweet_url in considered_tweet_urls`. This is more correct than article-URL dedup: the same article can be shared by multiple different tweets, and the article-URL approach would silently skip the second tweet even if it was a different, fresher share.

#### Three tweet types

For each tweet that passes the dedup gate:

| Type | Condition | Treatment |
|---|---|---|
| **A — Single link** | Exactly 1 non-x.com embedded link | `fetch_article(url)` → 1 `ArticleCandidate` |
| **B — Multi-link** | ≥ 2 embedded links | Fetch each non-x.com link → multiple `ArticleCandidate` objects (one per link) |
| **C — Long-form** | 0 links AND tweet text ≥ 200 words | Tweet body is the article → 1 `ArticleCandidate` |
| **Dropped** | 0 links AND < 200 words | Skipped silently |

Type B treats multi-link tweets as aggregators (like a curated thread of resources). Each link is fetched independently and becomes its own candidate, scored on its own merits.

---

### `agent/__init__.py` — Pipeline Orchestration

**Purpose:** Entry point for the full 5-step pipeline. Coordinates all modules.

```python
def main(dry_run: bool = False) -> None:
    settings = load_settings()
    _configure_logging(settings)

    # ── STEP 1 — FILTER ───────────────────────────────────────────────────────
    digests = load_sent_digests(settings.sent_digests_file)
    already_processed = already_processed_ids(digests)     # Gmail msg ID fallback
    score_db = load_score_db(settings.score_db_file)
    tweet_db = load_considered_tweets(settings.tweet_db_file)
    considered_tweet_urls = already_considered_tweets(tweet_db)

    service = get_gmail_service(settings)
    # Gmail query already excludes -label:Newsletter-Reviewed at the API level
    raw_emails = fetch_newsletters(service, settings, already_processed)

    try:
        asyncio.run(_scrape_x(...))
    except Exception as exc:
        log.warning("X scrape failed (skipping X content): %s", exc)

    # ── STEP 2 — EXPAND ───────────────────────────────────────────────────────
    candidates: list[ArticleCandidate] = []
    for email in raw_emails:
        candidates.extend(extract_email_candidates(email, settings))   # Pass 1 + Pass 2

    x_candidates = load_x_data(
        settings.x_bookmarks_csv, settings.x_likes_csv,
        considered_tweet_urls=considered_tweet_urls,   # tweet-URL dedup
    )
    candidates.extend(x_candidates)

    # ── STEP 3 — SCORE ────────────────────────────────────────────────────────
    all_scored = score_new_candidates(candidates, score_db, settings)
    # score_db now contains new entries; save happens at Step 5

    # ── STEP 4 — SELECT ───────────────────────────────────────────────────────
    eligible = [(c, s) for c, s, _ in all_scored if s >= settings.min_score_threshold]
    eligible.sort(key=lambda x: x[1], reverse=True)
    top_articles = eligible[:settings.max_articles]

    teaser, quote, quote_attribution = generate_digest_text(
        [c for c, _ in top_articles], settings
    )

    # ── STEP 5 — PERSIST ──────────────────────────────────────────────────────
    html = build_html(...)
    plain = build_plain_text(...)

    if not dry_run:
        send_digest(service, html, plain, settings)

        label_id = ensure_newsletter_label(service)
        label_and_archive_messages(service, email_msg_ids, label_id)

        record_considered_tweets(tweet_db, today_key, all_tweet_urls)
        save_considered_tweets(settings.tweet_db_file, tweet_db)

        save_score_db(settings.score_db_file, score_db)

        record_sent_digest(digests, today_key, email_ids, article_urls)
        save_sent_digests(settings.sent_digests_file, digests)
```

**`asyncio.run(_scrape_x(...))`**: The Playwright scraper is async; the main pipeline is synchronous. `asyncio.run()` creates an event loop, runs the coroutine, and returns.

**Error isolation**: X scrape failures are caught and logged as warnings; the pipeline continues with email-only content. Gmail failures abort the run.

---

### `run.py` — CLI Entry Point

```bash
python run.py             # Full pipeline, sends email
python run.py --dry-run   # Prints HTML to stdout, no email sent
```

Parses `--dry-run` flag via `argparse`, calls `agent.main(dry_run=...)`. Catches unexpected exceptions, logs them at ERROR level, exits with code 1.

### `run_scraper.py` — Standalone X Scraper

```bash
python run_scraper.py             # Browser opens for X login (first-time setup)
python run_scraper.py --headless  # Headless (requires saved state.json)
```

Runs only the X scraping step. Used for initial X session setup and for refreshing `state.json` when the session expires.

---

## 9. CI/CD: GitHub Actions

**File:** `.github/workflows/newsletter.yml`

```yaml
on:
  schedule:
    - cron: '30 5 * * *'   # 05:30 UTC = 11:00 AM IST
  workflow_dispatch:         # manual trigger from GitHub Actions UI
```

**Steps:**
1. `actions/checkout@v4` — checks out the repo (including `sent_digests.json`)
2. `actions/setup-python@v5` — Python 3.12 with pip cache
3. `pip install -r requirements.txt && playwright install chromium --with-deps`
4. **Restore secrets to files** — writes GitHub secrets into `token.json`, `credentials.json`, `state.json`
5. `python3 run.py` — full pipeline
6. **Commit dedup state** — if `sent_digests.json` changed, commits with `[skip ci]` and pushes

The `[skip ci]` tag in the commit message prevents GitHub Actions from triggering another run on the state update commit.

**Permissions:** `contents: write` is required for the bot to push the updated `sent_digests.json` back to the repo.

---

## 10. macOS launchd (Local Fallback)

**File:** `~/Library/LaunchAgents/com.newsletter.digest.plist`

Runs `python3 run.py` at **11:00 AM** daily (local time). The `WorkingDirectory` is set to the project root so that `.env` is found by pydantic-settings.

```bash
make install     # copies plist to ~/Library/LaunchAgents/, loads it
make uninstall   # unloads and removes the plist
```

The plist uses a fixed Python path — update it if your Python installation location differs:
```xml
<string>/Library/Frameworks/Python.framework/Versions/3.14/bin/python3</string>
```

---

## 11. Credential Renewal

| Credential | Renewal Procedure |
|---|---|
| **Gmail OAuth token** | Automatic — `refresh_token` in `token.json` is stable and does not require rotation |
| **X session** | When X scraping fails with auth error: run `python run_scraper.py` locally → `cat state.json \| gh secret set X_STATE_JSON -R user/repo` |
| **Anthropic API key** | Update in `.env` and re-set `ANTHROPIC_API_KEY` GitHub secret |
| **Gmail credentials** | If you revoke OAuth credentials in Google Cloud Console: delete `token.json`, download new `credentials.json`, run `python run.py --dry-run` to re-authorise |

---

## 12. Tests

**128 unit tests across 8 files.** Run with:

```bash
make test          # recommended
pytest tests/ -v   # verbose output
```

| File | Tests | What's Tested |
|---|---|---|
| `tests/test_ranker.py` | 17 | JSON fence stripping, `_parse_response` structure, Claude API mocking, empty input, API errors, body truncation, teaser/quote extraction |
| `tests/test_extractor.py` | 17 | Base64 decoding with padding, recursive MIME walking, plain-text preference over HTML, tracker URL filtering, Substack canonical URL preference, URL cap |
| `tests/test_renderer.py` | 22 | HTML structure (rank badge, source badge, score pills, tags, nav), dark-mode CSS presence, plain-text formatting, teaser and quote sections |
| `tests/test_scorer.py` | 20 | Score DB load/save/lookup/store, cache hits skip Claude, partial cache → single batch call, score roundtrip, invalid JSON handling |
| `tests/test_loader.py` | 25 | Tweet Type A/B/C classification, stale bookmark filtering (14-day), tweet-URL-based dedup, multi-link Type B expansion, short-tweet drop |
| `tests/test_dedup.py` | 17 | `considered_tweets` load/save/record, 30-day retention pruning, flat set from multi-date DB, `already_considered_tweets` correctness |
| `tests/test_gmail_labels.py` | 10 | `ensure_newsletter_label` creates missing / returns existing, `label_and_archive_messages` calls `modify()` per message with correct body |

---

## 13. Troubleshooting

**`ANTHROPIC_API_KEY not set` or empty**
- If running from Claude Desktop's terminal: the key in `.env` should win via `load_settings()`. If it doesn't, set the key explicitly: `export ANTHROPIC_API_KEY=sk-ant-...`

**`OAuth credentials file not found: credentials.json`**
- Download `credentials.json` from Google Cloud Console (see [Section 3a](#3a-google-cloud--gmail-api)).

**`Gmail token refresh failed`**
- Delete `token.json` and run `python run.py --dry-run` to re-authorise via browser.

**X scrape fails with authentication error**
- Re-run `python run_scraper.py` (no `--headless`) to refresh the session, then update the `X_STATE_JSON` GitHub secret.

**Claude returns malformed JSON**
- Usually transient. The pipeline skips sending rather than crashing and logs the raw response. Re-running typically resolves it.

**No newsletters found**
- Check `LOOKBACK_HOURS` (default 24) and `MAX_NEWSLETTERS` (default 20).
- Ensure your Gmail has emails matching newsletter domains in the last 24 hours.
- Try `LOG_LEVEL=DEBUG` to see the exact Gmail search query being used.

**Duplicate articles across days**
- Check `sent_digests.json`. Entries older than 7 days are pruned automatically. If the file is corrupted, delete it and the dedup state resets cleanly.

**GitHub Actions workflow not triggering**
- Ensure the repo is not archived and GitHub Actions is enabled under Settings → Actions → General.
- GitHub may disable scheduled workflows if the repo has no activity for 60 days — trigger manually once to re-enable.
