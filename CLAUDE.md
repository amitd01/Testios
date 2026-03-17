# CLAUDE.md — AI Agent Instructions for PFM India

## Project Overview

PFM India is a Personal Finance Manager web app for the Indian market. It ingests bank transaction alert emails via Gmail API, parses transactions using regex (primary) + Claude Haiku LLM (optional enhancer), and displays financial insights in a React dashboard.

**Repository:** amitd01/Testios
**Branch:** claude/pfm-gmail-integration-24H4a

## Architecture

- **Monorepo** with npm workspaces: `backend/` (Express, port 3001) + `frontend/` (React, port 3000)
- **Database:** PostgreSQL 16 — 16 tables across 4 migrations
- **Cache:** Redis (optional, in-memory fallback)
- **Auth:** Google OAuth 2.0 → JWT tokens
- **Email:** Gmail API with sender domain whitelist (45+ Indian financial institutions)
- **LLM:** Anthropic Claude Haiku via `@anthropic-ai/sdk` — optional, app works without it

## Key Commands

```bash
npm install                    # Install all dependencies
npm run dev                    # Start backend:3001 + frontend:3000
npm test                       # Run Jest test suite (115 tests)
npm run migrate                # Run database migrations
docker-compose up -d           # Start PostgreSQL + Redis
```

## Critical Rules (Learned from 26+ commits of debugging)

1. **NEVER send raw HTML to parsers or LLM** — always strip to plain text first using cheerio. This was the #1 bug in v1 (7 commits to discover).

2. **Regex parser must work standalone** — the app must be fully functional without `ANTHROPIC_API_KEY`. LLM is an optional quality enhancer, not a requirement.

3. **Always allow subdomain matching** — if `hdfcbank.net` is whitelisted, `alerts.hdfcbank.net` must be accepted automatically. No `subdomains_allowed` flag.

4. **Sanitize ALL merchant names** — reject >50 chars, bank boilerplate ("Click Here", "Know More", "Terms and Conditions"), card descriptions, and placeholder values. Run `sanitizeMerchant()` on both regex and LLM outputs.

5. **Validate env vars at startup** — fail fast with clear error messages for required vars (DATABASE_URL, GOOGLE_CLIENT_ID/SECRET). Log warnings for optional vars (ANTHROPIC_API_KEY, REDIS_URL).

6. **Log every decision point** — every skip, fallback, and error must be logged with structured JSON including reason, sender, subject, email_id.

7. **Parsers return `{ data, meta }` envelope** — all parser outputs use the observability envelope format. Tests must access `result.data.amount`, not `result.amount`.

8. **Clear LLM cache on reparse** — `runReparse()` must call `clearLLMCache()` before reprocessing stored emails.

9. **Auth edge cases** — the revoke endpoint must be placed before auth middleware, use `jwt.decode()` (not `verify()`) for expired tokens, and frontend must skip 401 redirect during revoke.

10. **Port conflict handling** — detect `EADDRINUSE` at startup and show PID. Register SIGTERM/SIGINT handlers for graceful shutdown.

## File Layout

### Backend — Key Files
- `backend/src/index.js` — Server entry, startup validation, graceful shutdown
- `backend/src/services/emailProcessingEngine.js` — Main email processing orchestrator (most-modified file)
- `backend/src/services/llmParser.js` — Claude Haiku LLM integration with in-memory cache
- `backend/src/services/categorizationEngine.js` — 16 categories, 200+ merchant keywords
- `backend/src/services/deduplicationEngine.js` — Transaction deduplication
- `backend/src/services/senderService.js` — Domain whitelist with subdomain matching
- `backend/src/services/gmailService.js` — Gmail API wrapper
- `backend/src/parsers/htmlAlertParser.js` — HTML email → transaction parser
- `backend/src/parsers/billReminderParser.js` — Bill reminder parser
- `backend/src/utils/regexValidator.js` — 8+ regex patterns for Indian bank email formats
- `backend/src/utils/indianFormats.js` — INR formatting, DD/MM/YYYY dates
- `backend/src/controllers/syncController.js` — Sync, onboarding, reparse endpoints
- `backend/src/controllers/authController.js` — OAuth + revoke flow
- `backend/src/migrations/` — 4 migration files (16 tables)

### Frontend — Key Files
- `frontend/src/pages/Dashboard.js` — Main dashboard with charts
- `frontend/src/pages/Transactions.js` — Filterable transaction list
- `frontend/src/pages/Onboarding.js` — Initial 30-day email scan flow
- `frontend/src/components/Layout.js` — Sidebar navigation + logout

### Tests — 12 files, 115 tests
- `backend/tests/parsers/` — Parser unit tests
- `backend/tests/api/` — API endpoint tests
- `backend/tests/services/` — Service layer tests
- `backend/tests/utils/` — Utility tests
- `backend/tests/logical/` — Edge case tests

## Email Processing Pipeline

```
Gmail API → check dedup (gmail_id) → whitelist check (with subdomains)
→ strip HTML to plain text → classify email type
→ store in raw_emails → regex parse → (optional) LLM enhance
→ sanitize merchant → categorize → dedup → store in transactions
```

## Common Pitfalls

- **Port 3001 stuck**: `lsof -ti:3001 | xargs kill -9` — nodemon doesn't always clean up
- **Empty dashboard**: Need to run Gmail sync first or seed dev data
- **LLM not working**: Check `ANTHROPIC_API_KEY` is set; app falls back to regex-only silently
- **Emails being skipped**: Check sender domain is in whitelist; check subdomain matching
- **Stale parse results**: Use reparse endpoint (`POST /api/sync/reparse`) — clears LLM cache automatically
- **Migration not applied**: Run `npm run migrate` — check migration 004 for `hidden` column

## Testing Notes

- Tests use mock DB and mock Gmail API — no external dependencies needed
- Dashboard tests must mock 3 parallel DB queries from `RawEmail.getStats`
- Parser tests must use `result.data.*` (observability envelope), not `result.*`
