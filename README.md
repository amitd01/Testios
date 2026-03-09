# Newsletter Digest Agent

A production-ready daily agent that scans your Gmail for newsletters, uses Claude to summarise and rank them, and emails you a clean HTML digest every morning.

---

## Overview

- **Fetches** newsletters from Gmail (Substack, beehiiv, Ghost, Mailchimp, ConvertKit, Kit, Buttondown, and more) from the last 24 hours
- **Ranks** articles using Claude with a four-dimension scoring rubric (originality, impact, writing quality, interestingness)
- **Sends** a styled HTML digest with dark-mode support and a plain-text fallback
- **Deduplicates** across runs using a local `sent_digests.json` state file
- **Resilient** — per-message error isolation, exponential backoff retries, graceful handling of Claude JSON errors
- **Observable** — structured logging, run summaries, `--dry-run` mode

---

## Quickstart

### 1. Get credentials

**Anthropic API key:**
1. Visit [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create a key and copy it

**Gmail OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project
2. Enable the Gmail API: APIs & Services → Library → search "Gmail API" → Enable
3. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app
4. Download the JSON and save it as `credentials.json` in the project root
5. Add your Gmail address as a test user: APIs & Services → OAuth consent screen → Test users

### 2. Install dependencies

```bash
git clone <your-repo>
cd newsletter_agent
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in the required values:
#   ANTHROPIC_API_KEY, DIGEST_RECIPIENT, GMAIL_SENDER
```

### 4. First run (OAuth consent)

The first run opens a browser window for Gmail authorisation. After approving, `token.json` is saved and all subsequent runs are fully automatic.

```bash
python run.py --dry-run    # prints HTML digest to stdout — no email sent
python run.py              # runs the full pipeline and sends the email
```

### 5. Schedule daily delivery

See the [Scheduling](#scheduling) section below.

---

## Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `DIGEST_RECIPIENT` | Yes | — | Email address that receives the digest |
| `GMAIL_SENDER` | Yes | — | Gmail account used to send |
| `MAX_NEWSLETTERS` | No | `20` | Max emails to process per run |
| `LOOKBACK_HOURS` | No | `24` | Hours back to fetch newsletters |
| `GMAIL_TOKEN_FILE` | No | `token.json` | Path to OAuth token file |
| `GMAIL_CREDS_FILE` | No | `credentials.json` | Path to OAuth credentials file |
| `LOG_LEVEL` | No | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `LOG_FORMAT` | No | `text` | `text` (human-readable) or `json` (structured) |
| `SENT_DIGESTS_FILE` | No | `sent_digests.json` | Deduplication state file |
| `BLOCKLIST_SENDERS` | No | `""` | Comma-separated sender addresses/domains to skip |

---

## Scheduling

### Path A — macOS (launchd, recommended)

```bash
# Edit deploy/com.newsletter.digest.plist:
#   Replace REPLACE_WITH_YOUR_KEY with your Anthropic key
# Then install:
make install
```

This copies the plist to `~/Library/LaunchAgents/` and loads it. The agent runs at **11:00 AM** every day.

To uninstall: `make uninstall`

### Path B — GitHub Actions (cloud, runs unattended)

1. Push this repository to GitHub
2. Add these secrets under Settings → Secrets → Actions:
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `GMAIL_TOKEN_JSON` — base64-encoded `token.json`: `base64 -i token.json | pbcopy`
   - `GMAIL_CREDS_JSON` — base64-encoded `credentials.json`: `base64 -i credentials.json | pbcopy`
3. The workflow in `.github/workflows/newsletter_digest.yml` runs at **5:30 UTC (= 11:00 IST)**
4. You can also trigger it manually from the Actions tab

### Path C — Docker with host cron

```bash
# Build the image
docker build -t newsletter-agent .

# Create secrets directory
mkdir -p secrets data
cp credentials.json secrets/
cp token.json secrets/

# Test run
docker compose run --rm newsletter-agent python run.py --dry-run

# Add to host crontab (runs at 11:00 AM)
# 0 11 * * * cd /path/to/newsletter_agent && docker compose run --rm newsletter-agent
```

---

## Development

```bash
pip install -r requirements-dev.txt

# Run tests
make test                # or: pytest tests/ -v

# Lint
make lint                # or: ruff check .

# Format
make format              # or: black .

# Dry run (no email sent)
make dry-run
```

---

## Troubleshooting

**`ANTHROPIC_API_KEY not set` error**
Set the env var: `export ANTHROPIC_API_KEY=sk-ant-...` or add it to `.env`.

**`OAuth credentials file not found: credentials.json`**
Download `credentials.json` from Google Cloud Console and place it in the project root.

**`Gmail token refresh failed`**
Delete `token.json` and run `python run.py` manually to re-authorise via browser.

**Claude returns malformed JSON**
Check the logs for the raw Claude response. The agent will skip sending rather than crash. Usually a transient issue — re-run resolves it.

**No newsletters found**
Verify your Gmail has newsletters in the last 24 hours. Try loosening the query or checking the `LOOKBACK_HOURS` setting. Also confirm you're not hitting `MAX_NEWSLETTERS` limit.

**Duplicate articles across days**
Check `sent_digests.json` — it stores processed message IDs for the last 7 days. If it's corrupted, delete it and the dedup state resets.

---

## Project structure

```
newsletter_agent/
├── agent/
│   ├── __init__.py      # Pipeline orchestration, deduplication, logging
│   ├── config.py        # Pydantic-settings config loading
│   ├── gmail.py         # Gmail auth, fetch, send + retry logic
│   ├── extractor.py     # Link extraction, body parsing
│   ├── ranker.py        # Claude API call + JSON parsing
│   ├── renderer.py      # HTML + plain-text email builder
│   └── models.py        # Article, Newsletter, ScoreBreakdown dataclasses
├── tests/
│   ├── test_extractor.py
│   ├── test_ranker.py
│   └── test_renderer.py
├── deploy/
│   └── com.newsletter.digest.plist   # macOS launchd schedule
├── .github/workflows/
│   └── newsletter_digest.yml         # GitHub Actions workflow
├── run.py               # CLI entry point
├── Makefile
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── requirements-dev.txt
└── .env.example
```
