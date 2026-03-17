# memory.md — Project Context & Session History

## Project Identity

- **App:** PFM India — Personal Finance Manager for the Indian market
- **Repo:** amitd01/Testios
- **Branch:** claude/pfm-gmail-integration-24H4a
- **Owner:** amitd01
- **Started:** March 10, 2026
- **Total commits:** 30 (d86729a → 6a47eb9)

## Current State (as of March 17, 2026)

- **Backend:** Express.js on port 3001 — fully functional
- **Frontend:** React 18 on port 3000 — fully functional
- **Database:** PostgreSQL with 16 tables across 4 migrations
- **Tests:** 115 tests, all passing
- **API endpoints:** 40+ REST endpoints
- **Parsing mode:** Regex-only on user's local machine (ANTHROPIC_API_KEY not set)
- **Email stats (last sync):** 112 emails fetched, 91 parsed, 33 transactions extracted

## Development Timeline

| Phase | Commits | Summary |
|-------|---------|---------|
| 1. Initial Build | d86729a → a55933c | Full app scaffolding, 72 tests |
| 2. Environment Fixes | 9b01d0a → 5303591 | Setup script, path resolution |
| 3. Observability + LLM | 89f7faa → 28726e7 | sync_runs, Claude Haiku, diagnostics panel |
| 4. Parsing Accuracy | d3347dc → bd24685 | 7 commits fixing parsing — root cause was HTML sent to LLM |
| 5. Auth/Revoke Fixes | af78125 → 9723a04 | 5 commits fixing logout/revoke flow |
| 6. Testing Overhaul | 73fcc34 → 59d472c | Fixed 16 test failures, UX improvements |
| 7. Production Debug | 3e390da → dfa2173 | Subdomain whitelist fix, merchant quality |

## Hard-Won Lessons

1. **HTML → LLM = garbage output.** Always strip HTML to plain text before any parser. This took 7 commits to discover.
2. **Subdomain matching must be automatic.** Banks send from `alerts.hdfcbank.net`, not `hdfcbank.net`. The `subdomains_allowed` flag defaulting to FALSE silently dropped 95%+ of emails.
3. **Auth revoke is a 5-layer onion.** Endpoint placement (before auth middleware), token decoding (decode vs verify), frontend interceptor (skip 401 redirect), user existence check, and UI button — all must align.
4. **API shape changes break tests silently.** The `{ data, meta }` observability envelope broke 11 tests that used `result.amount` instead of `result.data.amount`.
5. **In-memory LLM cache causes stale results.** Must clear cache before reparse. Redis would solve this but is optional.
6. **Port 3001 gets stuck constantly.** nodemon doesn't always clean up. Need graceful shutdown handlers.
7. **Dev environment ≠ user's local.** Dev had empty DB; user's Mac had real data but missing API keys. Hours lost debugging already-fixed code.

## Known Technical Debt

| Priority | Issue |
|----------|-------|
| High | No CI/CD pipeline |
| High | PDF/Excel parser has minimal test coverage |
| High | No integration/E2E tests with real DB |
| Medium | In-memory LLM cache only (no Redis integration) |
| Medium | No frontend error boundaries on all pages |
| Medium | JWT expiry handling is fragile |
| Medium | No monitoring/alerting infrastructure |
| Low | No dev seed script for sample data |

## Key File Modification Frequency

Most-modified files during development (highest churn = highest risk):
1. `backend/src/services/emailProcessingEngine.js` — 10+ modifications
2. `backend/src/controllers/authController.js` — 5 modifications
3. `backend/src/utils/regexValidator.js` — 4 modifications
4. `backend/src/services/llmParser.js` — 4 modifications
5. `backend/tests/parsers/htmlAlertParser.test.js` — 3 modifications

## User Environment Notes

- User runs on a Mac locally
- PostgreSQL and app running on local machine
- `ANTHROPIC_API_KEY` is NOT set on user's local — app runs in regex-only mode
- Gmail OAuth is configured and working with real emails
- User has real Indian bank email data (HDFC, ICICI, SBI, etc.)

## What Works Well

- Regex cross-validation catches LLM hallucinations on amounts/dates
- Diagnostics dashboard provides full visibility into sync runs and parser performance
- Incremental sync only fetches new emails since last sync
- Reparse endpoint allows testing parser improvements without re-fetching from Gmail
- Deduplication engine correctly merges duplicates across sources
- Indian locale formatting (₹, DD/MM/YYYY, lakhs/crores)

## Next Steps / Backlog

- [ ] Add CI/CD pipeline (GitHub Actions: lint + test on push)
- [ ] Add integration tests with real DB (test database)
- [ ] Implement Redis-backed LLM cache
- [ ] Add frontend error boundaries
- [ ] Create dev seed script with sample data
- [ ] Improve PDF/Excel statement parsing coverage
- [ ] Add monitoring and alerting
- [ ] Docker setup for full local development
