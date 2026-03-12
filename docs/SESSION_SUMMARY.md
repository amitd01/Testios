# PFM India — Complete Session Retrospective

**Project:** Personal Finance Manager (PFM) for Indian market
**Repository:** amitd01/Testios
**Branch:** `claude/pfm-gmail-integration-24H4a`
**Session Period:** March 10–12, 2026
**Commits:** 26 (d86729a → dfa2173)
**Final State:** 112 emails fetched, 91 parsed, 33 transactions (regex-only mode — ANTHROPIC_API_KEY not set on user's local machine)

---

## 1. Executive Summary

This session built a full-stack Personal Finance Manager that ingests Indian bank alert emails via Gmail API, parses transaction data using Claude Haiku LLM with regex fallback, and displays financial insights in a React dashboard. The build progressed through 5 major phases across 26 commits, encountering significant recurring issues with environment management, parsing accuracy, and the gap between development and production environments.

**Key Metrics:**
- Lines of code: ~15,000+ (backend + frontend)
- Test suite: 115 tests, all passing
- API endpoints: 40+ REST endpoints
- Database: 16 PostgreSQL tables across 4 migrations
- Parsing: LLM-first with regex cross-validation (8+ regex patterns)
- Categories: 16 financial categories with 200+ merchant keywords

---

## 2. Chronological Development Phases

### Phase 1: Initial Build (Commits d86729a → a55933c)
**What happened:** Complete app scaffolding — backend with Express/PostgreSQL, frontend with React 18, Gmail OAuth integration, email processing engine, 72 passing tests.

**Key decisions:**
- Regex-first parsing architecture (later changed to LLM-first)
- Sender domain whitelist approach (DB-driven, not hardcoded)
- Trust scoring system (100% statements, 80% alerts)
- Monorepo with npm workspaces

**Issues:** None significant — clean initial build.

### Phase 2: Setup & Environment Fixes (Commits 9b01d0a → 5303591)
**What happened:** Setup script created, then immediately required fixes for path resolution and startup commands.

**Issues encountered:**
1. `cd` in subshell not working due to background processes → Fixed with absolute paths
2. `npx react-scripts start` failing → Changed to `npm run dev`

**Pattern identified:** Environment assumptions don't hold across machines.

### Phase 3: Observability & LLM Integration (Commits 89f7faa → 28726e7)
**What happened:** Major architectural shift — added observability infrastructure, LLM-powered parsing, diagnostics admin panel, and hierarchical email parsing.

**Key changes:**
- sync_runs table for observability tracking
- Claude Haiku API integration with in-memory cache
- Regex became validator, LLM became primary parser
- Instrument type tracking (savings_account, credit_card, upi, etc.)
- 9 diagnostics endpoints added

**Issues:**
1. Migration 003 not registered in runner → Fix commit 646dce9
2. Merchant suffix stripping too aggressive → "Corp", "Tech" being removed from company names

### Phase 4: Parsing Accuracy Sprint (Commits d3347dc → bd24685)
**What happened:** 7 consecutive commits trying to fix email parsing accuracy. This was the most problematic phase — each fix introduced new edge cases.

**The parsing accuracy loop (7 iterations):**

| Commit | Issue Fixed | New Issue Introduced |
|--------|-----------|---------------------|
| d3347dc | Garbage merchant names (Know More, Click Here) | Dates still wrong, credit/debit misdetection |
| 162a3e0 | Reduced scan from 90→30 days for faster iteration | — |
| 7051911 | More garbage patterns, subject-like names | Over-aggressive stripping |
| a1d2661 | Company suffix stripping, date accuracy | LLM cache preventing updates |
| ad1b36d | LLM called when merchant missing, email date primary | LLM cache still stale |
| ea2647c-a623850 | Auto-reparse when emails already stored | — |
| 167c70b | Reparse endpoint (no Gmail re-fetch needed) | — |
| bd24685 | **Root cause found:** raw HTML sent to LLM | LLM receives clean text now |

**Key insight:** The fundamental issue was sending raw HTML to the LLM. All the merchant extraction heuristics were band-aids until this root cause was found at commit bd24685.

### Phase 5: Auth & Revoke Fixes (Commits af78125 → 9723a04)
**What happened:** 5 commits to fix a single feature — the "Revoke Access" / logout flow.

**The revoke access loop (5 iterations):**
1. af78125: User doesn't exist in DB → 500 error. Fix: return success if user not found.
2. 1fafab1: Revoke endpoint behind auth middleware → stale token can't authenticate. Fix: move before middleware.
3. 84c349c: Frontend 401 redirect interceptor catches revoke response. Fix: add `skipAuthRedirect` option.
4. ddb5fea: `jwt.verify()` rejects expired tokens. Fix: use `jwt.decode()` instead.
5. 9723a04: No logout button in UI. Fix: add sidebar logout button.

**Pattern identified:** Auth edge cases compound — each fix reveals the next layer.

### Phase 6: Testing & Integration (Commits 73fcc34 → 59d472c)
**What happened:** Major overhaul with test suite expansion, UX improvements, and fixing 16 test failures.

**Test failures root causes:**
- Parser tests used `result.amount` but parsers now return `{ data, meta }` envelope (11 tests)
- Dashboard mock provided 1 DB response but `RawEmail.getStats` makes 3 parallel queries (5 tests)
- Bill reminder parser couldn't extract biller from sender domain

### Phase 7: Production Debugging (Commits 3e390da → dfa2173)
**What happened:** User reported only 3 emails processed, 1 transaction on their local Mac. Investigation revealed multiple issues.

**Findings:**
1. Development DB was empty (no Gmail tokens, no real data)
2. User's local Mac running separate instance with real data
3. Subdomain whitelist filtering silently dropping emails (`alerts.hdfcbank.net` → rejected because `subdomains_allowed` defaults to FALSE)
4. ANTHROPIC_API_KEY not set on user's local machine → LLM completely non-functional, regex-only mode
5. Port 3001 repeatedly stuck (EADDRINUSE) requiring manual kill

---

## 3. Recurring Issues & Patterns

### Pattern 1: Environment Divergence (Critical)
The dev environment and user's local Mac were completely different:
- Dev: Empty DB, test user with no Gmail tokens
- Local: Real Gmail user, real emails, but missing API keys
- Code deployed to branch but user not pulling updates

**Impact:** Hours of debugging code that was already fixed but not deployed.

**Root cause:** No automated deploy/sync mechanism. Manual `git pull` required.

### Pattern 2: The Parsing Accuracy Spiral (7 commits)
Each parsing fix introduced new edge cases. The team went through 7 iterations before finding the root cause (HTML → LLM).

**Anti-pattern:** Fixing symptoms (merchant cleanup heuristics) instead of root cause (HTML noise in LLM input).

**What should have been done:**
1. Look at actual LLM input/output first
2. Strip HTML before LLM (the actual fix)
3. Then add heuristics for remaining edge cases

### Pattern 3: Auth/Revoke Cascade (5 commits)
Five commits to fix a single logout feature because each layer of the auth stack had different assumptions about token state.

**Root cause:** No integration test for the "expired token + revoke" scenario.

### Pattern 4: Silent Failures
Multiple issues were caused by silent drops with no logging:
- Whitelist filtering skipped emails silently (no log line)
- LLM cache served stale results (no "cache hit" log)
- Missing API key caused immediate failure but continued processing

**Fix needed:** Every skip/fallback/failure should log with reason.

### Pattern 5: Port Conflicts (EADDRINUSE)
The user encountered `EADDRINUSE: address already in use :::3001` at least 4 times during the session, requiring manual `lsof -ti:3001 | xargs kill -9`.

**Root cause:** nodemon doesn't always clean up previous processes on crash. No graceful shutdown handler.

### Pattern 6: Database State Confusion
- PostgreSQL went down multiple times between operations
- Migration 004 existed but wasn't applied → missing `hidden` column → 500 errors
- LLM in-memory cache (`parseCache`) not cleared between code changes

---

## 4. Architecture Decisions & Trade-offs

### Decision 1: LLM-First vs Regex-First
- **Initial:** Regex-first, LLM fallback (commit 89f7faa)
- **Changed to:** LLM-first, regex validation (commit 28726e7)
- **Trade-off:** Better accuracy but requires API key + costs money
- **Problem discovered:** Without API key, entire parsing degrades to regex-only mode with no warning

### Decision 2: Sender Domain Whitelist
- 44 Indian financial institution domains seeded in migration
- `subdomains_allowed` column defaults to FALSE
- **Problem:** Most banks send from subdomains (alerts.hdfcbank.net), causing near-total email rejection
- **Fix:** Always allow subdomains (commit 3e390da)

### Decision 3: { data, meta } Observability Envelope
- All parsers return `{ data, meta }` instead of raw results
- **Problem:** 11 tests broke because they accessed `result.amount` instead of `result.data.amount`
- **Lesson:** API shape changes need test migration strategy

### Decision 4: In-Memory LLM Cache
- `parseCache` keyed by content hash, max 500 entries
- **Problem:** Stale results persisted across code changes
- **Fix:** `runReparse()` calls `clearLLMCache()` before reprocessing
- **Deeper issue:** In-memory cache lost on server restart, no persistence

---

## 5. What Worked Well

1. **Test suite caught real bugs** — 16 failures pointed to legitimate API shape changes
2. **Regex cross-validation** — caught LLM hallucinations on amounts/dates
3. **Diagnostics dashboard** — sync runs, parser performance, sender stats all visible
4. **Incremental sync** — only fetches new emails since last sync
5. **Reparse endpoint** — allows testing parser improvements without re-fetching from Gmail
6. **Deduplication engine** — correctly merges duplicate transactions across sources
7. **Indian format handling** — ₹ formatting, DD/MM/YYYY dates, lakhs/crores notation

---

## 6. What Went Wrong

1. **No `.env` validation at startup** — app starts without ANTHROPIC_API_KEY, fails silently per-request
2. **No health check endpoint** — no way to verify all integrations are working
3. **Subdomain whitelist default** — silently dropped 95%+ of emails
4. **HTML sent to LLM** — fundamental bug hidden by layers of heuristic patches
5. **No integration tests** — unit tests passed but real email processing failed
6. **No sample data / seed script** — dev DB was always empty
7. **No deployment automation** — manual git pull + restart + port kill cycle
8. **Environment coupling** — code assumed PostgreSQL running, Redis available, API keys set

---

## 7. Technical Debt Inventory

| Area | Debt | Severity |
|------|------|----------|
| **Startup validation** | No check for required env vars (DB_URL, API keys) | High |
| **Error handling** | LLM failures don't propagate to user-visible status | High |
| **Logging** | Many code paths have no logging at all | Medium |
| **Caching** | In-memory only, no Redis integration for LLM cache | Medium |
| **Tests** | No integration tests, no E2E tests, no test data seeds | High |
| **Frontend** | No error boundaries, no loading states for some pages | Medium |
| **Auth** | JWT expiry handling fragile (5 commits to fix revoke) | Medium |
| **Deployment** | No CI/CD, no Docker for dev, manual everything | High |
| **PDF/Excel parsing** | Minimal test coverage (2% code coverage) | High |
| **Monitoring** | No alerts, no uptime checks, no error aggregation | Medium |

---

## 8. Files Modified (Complete List)

### Backend Services (Core Business Logic)
- `backend/src/services/emailProcessingEngine.js` — Main orchestrator (modified 10+ times)
- `backend/src/services/llmParser.js` — LLM integration with Claude Haiku
- `backend/src/services/categorizationEngine.js` — Merchant → category mapping
- `backend/src/services/senderService.js` — Domain whitelist management
- `backend/src/services/deduplicationEngine.js` — Transaction dedup
- `backend/src/services/gmailService.js` — Gmail API wrapper

### Backend Parsers
- `backend/src/parsers/htmlAlertParser.js` — HTML email parser
- `backend/src/parsers/billReminderParser.js` — Bill reminder parser

### Backend Utils
- `backend/src/utils/regexValidator.js` — Regex patterns for Indian bank emails
- `backend/src/utils/llmResponseValidator.js` — LLM output validation
- `backend/src/utils/indianFormats.js` — Currency/date formatting
- `backend/src/utils/logger.js` — Structured logging

### Backend Controllers
- `backend/src/controllers/syncController.js` — Sync/reparse endpoints
- `backend/src/controllers/authController.js` — OAuth + revoke
- `backend/src/controllers/dashboardController.js` — Dashboard aggregation

### Frontend
- `frontend/src/pages/Onboarding.js` — Email scan flow
- `frontend/src/pages/Dashboard.js` — Main dashboard
- `frontend/src/pages/Transactions.js` — Transaction list
- `frontend/src/pages/Settings.js` — Reparse trigger
- `frontend/src/components/Layout.js` — Sidebar + logout
- `frontend/src/components/TransactionDetailModal.js` — Transaction editing

### Tests (12 files, 115 tests)
- `backend/tests/parsers/htmlAlertParser.test.js`
- `backend/tests/parsers/billReminderParser.test.js`
- `backend/tests/api/dashboard.test.js`
- `backend/tests/api/sync.test.js`
- `backend/tests/api/auth.test.js`
- `backend/tests/api/transactions.test.js`
- `backend/tests/api/accounts.test.js`
- `backend/tests/services/categorizationEngine.test.js`
- `backend/tests/services/deduplicationEngine.test.js`
- `backend/tests/services/senderWhitelist.test.js`
- `backend/tests/utils/indianFormats.test.js`
- `backend/tests/logical/edge-cases.test.js`

---

## 9. Recommendations for Rebuild

1. **Validate env vars at startup** — fail fast with clear error messages
2. **Add `/health` endpoint** — checks DB, Redis, API key, Gmail token
3. **Strip HTML before any parsing** — never send raw HTML to LLM or regex
4. **Always allow subdomains** in whitelist — no `subdomains_allowed` flag
5. **Log every skip/fallback** — include reason, sender, subject
6. **Add integration tests** with real email fixtures (sanitized)
7. **Use Redis for LLM cache** — persist across restarts
8. **Add graceful shutdown** — clean up ports on SIGTERM/SIGINT
9. **Seed script for dev data** — never start with empty DB
10. **CI/CD pipeline** — auto-test, auto-deploy on push
11. **Regex-first for MVP** — LLM as quality enhancer, not required dependency
12. **Error boundaries in React** — catch and display errors gracefully
