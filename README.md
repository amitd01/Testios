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

Each run (daily, automated):

1. **Fetches Gmail newsletters** — searches for emails from known newsletter senders (Substack, beehiiv, Ghost, Mailchimp, ConvertKit, Buttondown, etc.) received in the last 24 hours.
2. **Scrapes X/Twitter** — headlessly logs into X and scrapes your bookmarks and recent likes, extracting embedded article links.
3. **Deduplicates** — skips Gmail messages and article URLs already included in a previous digest (7-day rolling window).
4. **Sends to Claude** — passes all content to `claude-sonnet-4-20250514` which scores each article on four dimensions, writes summaries, generates an editorial teaser, and picks a quotable quote.
5. **Builds a styled HTML email** — dark-mode-safe, with score pills, source badges, anchor navigation, and the quote section.
6. **Sends the digest** via Gmail API.
7. **Saves dedup state** — commits `sent_digests.json` back to the repo so CI runs stay in sync.

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
┌─────────────────────────────────────────────────────────────┐
│  INPUTS                                                     │
│                                                             │
│  Gmail (OAuth2)               X/Twitter (Playwright)        │
│       │                              │                      │
│       ▼                              ▼                      │
│  fetch_newsletters()      scraper.main() ──► bookmarks.csv  │
│  (last 24h, deduped)                  └──► likes.csv        │
│       │                       load_x_data()                 │
│       └──────────────┬──────────────┘                      │
│                      │  merge + filter already-used URLs    │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │  Claude API            │
          │  claude-sonnet-4-...   │
          │                        │
          │  • Score 4 dimensions  │
          │  • Rank articles       │
          │  • Write summaries     │
          │  • Generate teaser     │
          │  • Pick quote          │
          └────────────┬───────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │  Build Digest          │
          │  build_html()          │
          │  build_plain_text()    │
          └────────────┬───────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │  Send via Gmail API    │
          │  send_digest()         │
          └────────────┬───────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │  Update Dedup State    │
          │  sent_digests.json     │
          │  (committed to repo)   │
          └────────────────────────┘
```

### Module Map

```
newsletter_agent/
├── agent/
│   ├── __init__.py          # Pipeline orchestration (main entry point)
│   ├── config.py            # Pydantic settings, .env loading
│   ├── models.py            # Data classes: Newsletter, Article, ScoreBreakdown
│   ├── gmail.py             # Gmail OAuth, fetch newsletters, send digest
│   ├── extractor.py         # MIME body parsing, URL extraction
│   ├── ranker.py            # Claude API call, JSON parsing, ranking
│   ├── dedup.py             # Deduplication state read/write
│   ├── renderer.py          # HTML and plain-text email builder
│   └── x_scraper/
│       ├── scraper.py       # Playwright automation for X bookmarks/likes
│       └── loader.py        # CSV → Newsletter objects
├── tests/
│   ├── test_ranker.py       # Claude API + JSON parsing tests
│   ├── test_extractor.py    # MIME/link extraction tests
│   └── test_renderer.py     # HTML/plain-text rendering tests
├── .github/workflows/
│   └── newsletter.yml       # GitHub Actions CI/CD workflow
├── run.py                   # CLI: python run.py [--dry-run]
├── run_scraper.py           # CLI: standalone X scraper (first-time login)
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

#### Key Functions

- `_build_system_prompt(max_words)` — instructs Claude to act as a high-standards newsletter curator
- `_build_user_template(max_words)` — template for the user message with rules, scoring rubric, and JSON output spec
- `_clean_json(raw)` — strips markdown code fences (` ```json ... ``` `) that Claude sometimes wraps around JSON
- `_parse_response(raw)` → `tuple[list[Article], list[ExcludedItem], str, str, str]` — parses JSON, constructs dataclass objects, returns 5-tuple
- `_call_claude(client, prompt, system_prompt, max_tokens)` — API call with tenacity retry (up to 3 attempts, 1–60s backoff, on `APIError` or `RateLimitError`)
- `summarise_and_rank(newsletters, settings)` — orchestrates everything; returns empty 5-tuple on error

---

### `agent/dedup.py` — Deduplication State

**Purpose:** Prevent the same newsletter or article from appearing in multiple digests.

Two independent dedup dimensions:
1. **Gmail message IDs** — prevents re-fetching and re-processing the same email
2. **Article URLs** — prevents the same article appearing across different emails or X posts

State is stored in `sent_digests.json` (JSON file committed to the repo):

```json
{
  "2026-03-10": {
    "message_ids": ["18f4a...", "18f4b..."],
    "article_urls": ["https://example.com/article-1", "https://example.com/article-2"]
  },
  "2026-03-09": { ... }
}
```

**7-day rolling window**: `save_sent_digests()` prunes entries older than 7 days before writing, keeping the file small.

**Why committed to the repo**: GitHub Actions runs on ephemeral Ubuntu containers. The only way to persist state across daily runs is to commit the file back to the repo. The workflow bot commits with `[skip ci]` to prevent triggering another run.

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

**Purpose:** Convert X scraper CSV output into `Newsletter` objects for the ranking pipeline.

Reads `bookmarks.csv` and `likes.csv` (columns: `url, author, text, timestamp, embedded_links`).

For each tweet:
1. Skips if no embedded links
2. Filters out links already in `used_urls` (URL-level dedup)
3. Skips the tweet entirely if all its links are already used
4. Creates `Newsletter` with:
   - `id`: `f"x:{tweet_url}"` — `x:` prefix prevents collision with Gmail message IDs
   - `subject`: `f"[Bookmarks] {author}"` or `f"[Likes] {author}"`
   - `sender`: `f"{author} (via Bookmarks)"` etc.
   - `body`: Tweet text
   - `links`: Only new (not-yet-used) embedded links

---

### `agent/__init__.py` — Pipeline Orchestration

**Purpose:** Entry point for the full pipeline. Coordinates all modules.

```python
def main(dry_run: bool = False) -> None:
    settings = load_settings()
    _configure_logging(settings)

    # 1. Load dedup state
    digests = load_sent_digests(settings.sent_digests_file)
    already_processed = already_processed_ids(digests)   # set of Gmail message IDs
    used_urls = already_used_urls(digests)                # set of article URLs

    # 2. Gmail
    service = get_gmail_service(settings)
    email_newsletters = fetch_newsletters(service, settings, already_processed)

    # 3. X scrape (async, runs headlessly; errors are non-fatal)
    try:
        asyncio.run(_scrape_x(headless=True, scroll_attempts=..., ...))
    except Exception as exc:
        log.warning("X scrape failed (skipping X content): %s", exc)

    x_newsletters = load_x_data(settings.x_bookmarks_csv, settings.x_likes_csv, used_urls)

    # 4. Merge
    all_newsletters = email_newsletters + x_newsletters

    # 5. Claude
    articles, excluded, teaser, quote, quote_attribution = summarise_and_rank(all_newsletters, settings)

    # 6. Build
    html = build_html(articles, settings.gmail_sender, teaser, quote, quote_attribution)
    plain = build_plain_text(articles, teaser, quote, quote_attribution)

    # 7. Send (or dry-run)
    if dry_run:
        print(html)
        return

    send_digest(service, html, plain, settings)

    # 8. Update dedup state
    record_sent_digest(digests, today_key, email_ids, article_urls)
    save_sent_digests(settings.sent_digests_file, digests)
```

**`asyncio.run(_scrape_x(...))`**: The Playwright scraper is async; the main pipeline is synchronous. `asyncio.run()` creates an event loop, runs the coroutine, and returns — bridging async into sync without requiring the entire pipeline to be async.

**Error isolation**: X scrape failures are caught and logged as warnings; the pipeline continues with email-only content. Gmail failures abort the run (no service = nothing to send).

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

**56 unit tests across 3 files.** Run with:

```bash
make test          # recommended
pytest tests/ -v   # verbose output
```

| File | What's Tested |
|---|---|
| `tests/test_ranker.py` | JSON fence stripping, 5-tuple return from `_parse_response`, Claude API mocking, empty input, API errors, body truncation, teaser/quote extraction |
| `tests/test_extractor.py` | Base64 decoding with padding, recursive MIME walking, plain-text preference over HTML, tracker URL filtering, Substack canonical URL preference, URL cap, trailing punctuation stripping |
| `tests/test_renderer.py` | HTML structure (title, URL, rank badge, source badge, score pills, tags, nav), dark-mode CSS presence, plain-text formatting, teaser and quote sections |

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
