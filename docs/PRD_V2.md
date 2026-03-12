# PFM India v2 — Product Requirements Document

## Rebuild Prompt

> Build a Personal Finance Manager (PFM) web application for the Indian market that automatically ingests bank transaction alerts from Gmail, extracts transaction data, and displays financial insights. The app must work in **regex-only mode** (no LLM dependency) with LLM as an optional quality enhancer. Apply every lesson from the v1 session log below.

---

## 1. Problem Statement

Indian consumers receive 10–50+ bank alert emails per week (debits, credits, bill reminders, investment confirmations) but have no unified view of their finances. Manual entry into budget apps has <10% retention. This app eliminates manual entry by parsing these emails automatically.

---

## 2. Core Architecture Principles (Lessons from v1)

### 2.1 Fail Fast, Fail Loud
Every required dependency must be validated at startup. The app must NOT start if:
- `DATABASE_URL` is missing or unreachable
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are missing
- Port is already in use (detect and show clear error with PID)

Optional dependencies (ANTHROPIC_API_KEY, REDIS_URL) should log a WARNING at startup but not block:
```
[WARN] ANTHROPIC_API_KEY not set — LLM parsing disabled, using regex-only mode
[WARN] REDIS_URL not set — using in-memory cache (not recommended for production)
```

### 2.2 Regex-First, LLM-Optional
The v1 app was unusable without the LLM API key. The v2 app must be **fully functional with regex alone**:
- Regex parser is the primary parser, always runs first
- LLM is an optional enhancer that improves merchant names and categorization
- If LLM is unavailable, the app works at ~70% accuracy instead of 0%

### 2.3 Never Send Raw HTML to Parsers
ALL email content must be stripped to plain text before any processing:
```
Gmail API → raw message → extract body → strip HTML to text → parse
```
This was the single biggest bug in v1 (7 commits to discover).

### 2.4 Log Every Decision Point
Every skip, fallback, and error must be logged with context:
```json
{"action": "skip_email", "reason": "sender_not_whitelisted", "sender": "promo@random.com", "subject": "Sale!"}
{"action": "fallback_regex", "reason": "llm_api_key_missing", "email_id": "abc123"}
{"action": "merchant_sanitized", "original": "Any Time At The Sole...", "cleaned": "Unknown", "reason": "too_long"}
```

### 2.5 Subdomain Matching Always On
If `hdfcbank.net` is whitelisted, then `alerts.hdfcbank.net`, `notifications.hdfcbank.net`, and any `*.hdfcbank.net` is automatically accepted. No `subdomains_allowed` flag needed.

### 2.6 Graceful Shutdown & Port Management
- Register SIGTERM/SIGINT handlers to close DB connections and free ports
- On startup, detect if port is in use and provide the PID to kill
- nodemon config should handle clean restarts

---

## 3. Tech Stack

### Backend
- **Runtime:** Node.js 20 LTS (not bleeding edge like v25 which had deprecation warnings)
- **Framework:** Express.js
- **Database:** PostgreSQL 16 with proper connection pooling
- **Cache:** Redis (optional, in-memory fallback)
- **Auth:** Google OAuth 2.0 + JWT
- **Email:** Gmail API via googleapis
- **LLM (optional):** Anthropic Claude Haiku via @anthropic-ai/sdk
- **PDF parsing:** pdf-parse
- **HTML stripping:** cheerio (convert HTML to text)
- **Testing:** Jest + supertest
- **Process management:** nodemon (dev), pm2 (prod)

### Frontend
- **Framework:** React 18 with React Router v6
- **Charts:** Recharts
- **Icons:** Lucide React
- **Styling:** CSS modules or Tailwind (not inline styles)
- **Date formatting:** date-fns

### Infrastructure
- **Monorepo:** npm workspaces (root + backend + frontend)
- **Dev:** docker-compose with PostgreSQL + Redis
- **CI:** GitHub Actions (lint + test on every push)

---

## 4. Database Schema

### 4.1 Tables (consolidated from v1's 4 migrations into 1 clean schema)

```sql
-- Core
users (id, email, name, avatar_url, gmail_refresh_token_encrypted, last_sync_at, created_at)
accounts (id, user_id, institution_name, account_type, instrument_type, last4, balance, hidden, created_at)

-- Email Ingestion
sender_domains (id, domain, institution_name, institution_type, email_template_hint, is_active, created_at)
pending_senders (id, domain, sample_sender, sample_subject, occurrence_count, status, last_seen)
raw_emails (id, user_id, gmail_id, sender, subject, body_text, body_html, received_at, email_category, sync_run_id, processing_status, processing_time_ms, parser_used, confidence_score, error_type, error_message, created_at)

-- Transactions
raw_transactions (id, user_id, email_id, amount, date, merchant, merchant_raw, transaction_type, financial_type, instrument_type, account_last4, payment_method, account_id, category, date_source, confidence, source, metadata, dedup_status, created_at)
transactions (id, user_id, amount, date, merchant, transaction_type, financial_type, instrument_type, account_id, category, payment_method, balance_after, source, trust_score, is_verified, metadata, user_notes, user_merchant_override, user_category_override, created_at)

-- Features
bills (id, user_id, biller_name, bill_type, amount, due_date, status, recurrence, email_id, created_at)
investments (id, user_id, instrument_name, instrument_type, amount, date, folio_number, email_id, created_at)
goals (id, user_id, name, target_amount, current_amount, target_date, category, created_at)
budgets (id, user_id, category, amount, period, month, year, created_at)

-- Observability
sync_runs (id, user_id, run_type, status, started_at, completed_at, emails_fetched, emails_parsed, emails_failed, emails_skipped, transactions_created, llm_tokens_used, error_summary, metadata)
document_passwords (id, user_id, institution_name, password_encrypted, created_at)
```

### 4.2 Key Indexes
- `raw_emails(gmail_id)` UNIQUE — prevent duplicate fetches
- `raw_emails(user_id, received_at)` — timeline queries
- `transactions(user_id, date)` — dashboard/spending queries
- `sender_domains(domain)` UNIQUE — whitelist lookups
- `sync_runs(user_id, started_at)` — observability

### 4.3 Seed Data
The migration MUST seed `sender_domains` with 45+ Indian financial institution domains:
- Banks: hdfcbank.net, icicibank.com, sbi.co.in, axisbank.com, kotak.com, yesbank.in, indusind.com, etc.
- Cards: americanexpress.com, hdfcbankcc.com
- Payments: paytm.com, phonepe.com, razorpay.com
- Insurance: licindia.in, hdfclife.com, iciciprulife.com
- Investments: zerodha.com, groww.in, cams-kra.com, kfintech.com
- Utilities: bescom.co.in, mahadiscom.in

---

## 5. Email Processing Pipeline

### 5.1 Flow (v2 architecture)

```
Gmail API fetch (paginated, max 500)
    ↓
For each email:
    ↓
[1] Check raw_emails for gmail_id → skip if exists (increment skipped counter, LOG)
    ↓
[2] Extract sender domain → check whitelist (with subdomain matching)
    → If not whitelisted: LOG reason, check if financial keywords in subject, record as pending_sender
    ↓
[3] Parse message: extract sender, subject, body_html, body_text, attachments
    → CRITICAL: Always strip HTML to text BEFORE any parsing
    ↓
[4] Classify email: transaction_alert | bill_reminder | statement_attachment | marketing | other
    ↓
[5] Store in raw_emails (body_text AND body_html for audit trail)
    ↓
[6] Parse based on category:
    a. Transaction alerts → regex parser → (optional) LLM enhancement
    b. Bill reminders → bill parser → bills table
    c. Statements → PDF/Excel parser → multiple transactions
    ↓
[7] Sanitize merchant name (reject garbage, normalize)
    ↓
[8] Categorize transaction (type-aware + merchant keywords)
    ↓
[9] Store in raw_transactions
    ↓
[10] Run deduplication → store in transactions
```

### 5.2 Regex Parser (PRIMARY — must work without LLM)

Extract from plain text body using these patterns (priority order):

```javascript
// Amount extraction
/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{2})?)/i
/(?:debited|credited|paid|received|amount)\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i

// Merchant extraction (8+ patterns for Indian bank formats)
/(?:to\s+)?VPA[\s:]+([a-zA-Z0-9._-]+)@/i                          // UPI VPA
/\bat\s+(?:POS\s+)?([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d)/i  // "at <merchant> on <date>"
/(?:paid|transferred|sent)\s+to\s+([A-Za-z].*?)\s+(?:on\s+\d)/i     // "paid to <merchant>"
/towards\s+([A-Za-z].*?)\s+(?:on\s+\d|for\s+(?:Rs|INR|₹))/i        // "towards <merchant>"
/(?:received|credited)\s+(?:from|by)\s+([A-Za-z].*?)(?:\s+on\s+\d)/i // "credited from <merchant>"
/Info:\s*UPI\/[^/]+\/[^/]+\/([a-zA-Z][a-zA-Z0-9._-]*?)(?:@|\s)/i   // UPI Info line
/(?:debited\s+for|purchase\s+at)\s+([A-Za-z].*?)\s+(?:on\s+\d)/i    // "debited for <merchant>"
/(?:ATM\s+(?:cash\s+)?withdraw)/i                                    // ATM → "ATM Withdrawal"

// Date extraction
/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/                                   // DD/MM/YYYY or DD-MM-YYYY
/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i

// Transaction type
/debited|deducted|spent|purchase|paid|withdrawn/i → debit
/credited|received|refund|cashback|deposited|salary/i → credit

// Account identification
/(?:a\/c|account|card)\s*(?:no\.?|ending|xx)?\s*(\d{4})/i
```

### 5.3 Merchant Sanitization (MUST run on every merchant, LLM or regex)

```javascript
function sanitizeMerchant(name) {
  if (!name || name === 'Unknown') return 'Unknown';

  // Reject: too long (sentence fragments, bank disclaimers)
  if (name.length > 50) return 'Unknown';

  // Reject: bank boilerplate text
  if (/discretion|group companies|terms and conditions|click here|know more|pay now|customer care|toll free/i.test(name))
    return 'Unknown';

  // Reject: card/account descriptions
  if (/(?:debit|credit)\s*card\s*(?:linked|ending)|using your|linked to account/i.test(name))
    return 'Unknown';

  // Reject: placeholder values (Xxx, xxx, XXX)
  if (/^x{2,}$/i.test(name)) return 'Unknown';

  // Normalize: ATM descriptions → "ATM Withdrawal"
  if (/\batm\b/i.test(name) && /withdraw|using|linked|card/i.test(name))
    return 'ATM Withdrawal';

  // Strip: company suffixes
  name = name
    .replace(/\s*(?:Pvt|Private|Pte|Ltd|Limited|LLP|Inc|Corp)\b\.?/gi, '')
    .replace(/\s*(?:India|Payments?|Services?|Solutions?|Technologies)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return name.length >= 2 ? name : 'Unknown';
}
```

### 5.4 LLM Enhancement (OPTIONAL — only if ANTHROPIC_API_KEY is set)

When LLM is available, use it to:
1. Extract merchant name from complex email bodies (regex couldn't)
2. Determine financial_type (salary, investment, loan_emi, insurance_premium)
3. Extract payment_method (UPI, NEFT, IMPS, Card, NetBanking)
4. Extract balance_after transaction

**Important LLM rules:**
- Always send **plain text** (never HTML)
- Always run `sanitizeMerchant()` on LLM output
- Always cross-validate LLM amount against regex-extracted amount
- Cache results by content hash (Redis preferred, in-memory fallback)
- Clear cache on reparse

---

## 6. Categorization Engine

### 6.1 Two-Tier Categorization

**Tier 1: Financial type override** (highest priority)
```
salary → Salary
investment/mutual_fund/sip → Investments
insurance_premium → Insurance
loan_emi → Loan Payments
transfer (self) → Transfer
```

**Tier 2: Merchant keyword matching**
```
Food & Dining: swiggy, zomato, dominos, mcdonald, starbucks, kfc, subway, pizza, restaurant, cafe, hotel, biryani, burger king, freshmenu, box8, ...
Groceries: bigbasket, blinkit, zepto, instamart, jiomart, dunzo, dmart, nature basket, grocery, supermarket, ...
Transportation: uber, ola, rapido, petrol, diesel, irctc, metro, fastag, toll, parking, makemytrip, ...
Shopping: amazon, flipkart, myntra, ajio, nykaa, croma, reliance, samsung, nike, adidas, decathlon, lenskart, ...
Entertainment: netflix, spotify, hotstar, disney, youtube, bookmyshow, pvr, steam, ...
Bills & Utilities: electricity, broadband, airtel, jio, vodafone, water, gas, maintenance, society, ...
Healthcare: apollo, fortis, hospital, pharmacy, medical, practo, 1mg, dental, ...
Investments: zerodha, groww, upstox, mutual fund, sip, nps, ppf, ...
Cash Withdrawal: atm, cash withdrawal, atm withdrawal, ...
(+ Insurance, Loan Payments, Education, Transfer, Rent, Personal Care, Gifts & Donations, Salary)
```

---

## 7. API Endpoints

### Public
```
GET  /health                              → { status, db, redis, llm_available, gmail_configured }
GET  /auth/google                         → Redirect to Google OAuth
GET  /auth/google/callback                → Handle OAuth callback, return JWT
POST /auth/revoke                         → Revoke access (no auth required — handles expired tokens)
```

### Protected (JWT required)
```
GET  /api/me                              → Current user profile
GET  /api/dashboard                       → Dashboard summary
GET  /api/transactions                    → Paginated transaction list with filters
GET  /api/transactions/:id                → Single transaction detail
PATCH /api/transactions/:id               → User overrides (merchant, category, notes)
GET  /api/transactions/export             → CSV download
GET  /api/transactions/spending           → Spending analytics
GET  /api/transactions/categories         → Category breakdown
GET  /api/accounts                        → Detected accounts
PATCH /api/accounts/:id                   → Hide/show account
GET  /api/accounts/:id/transactions       → Account ledger
GET  /api/accounts/net-worth              → Net worth calculation
GET  /api/bills                           → Bills list
GET  /api/bills/upcoming-count            → Upcoming bill count
PATCH /api/bills/:id/pay                  → Mark paid
GET  /api/investments                     → Investment holdings
CRUD /api/goals                           → Financial goals
CRUD /api/budgets                         → Budgets
POST /api/budgets/template                → Apply budget template
POST /api/sync/start                      → Full Gmail sync
POST /api/sync/onboarding                 → 30-day initial scan
POST /api/sync/reparse                    → Reparse stored emails
GET  /api/sync/status                     → Current sync status
GET  /api/insights                        → Financial insights
GET  /api/diagnostics/sync-runs           → Sync run history
GET  /api/diagnostics/stats               → Overall statistics
GET  /api/diagnostics/senders             → Sender domain stats
GET  /api/diagnostics/parser-performance  → Parser accuracy metrics
CRUD /api/admin/senders                   → Sender whitelist management
CRUD /api/settings/document-passwords     → PDF password storage
```

---

## 8. Frontend Pages

| Page | Route | Key Features |
|------|-------|-------------|
| Welcome | `/` | Gmail OAuth login |
| Onboarding | `/onboarding` | 30-day email scan with progress |
| Dashboard | `/dashboard` | Net worth, spending, income, savings, recent transactions, sync status |
| Transactions | `/transactions` | Filterable list, search, category filter, date range, click to edit |
| Accounts | `/accounts` | Detected accounts, hide/show, ledger drill-down |
| Bills | `/bills` | Upcoming bills, pay tracking |
| Budgets | `/budgets` | Category budgets, templates |
| Goals | `/goals` | Financial goal tracking |
| Investments | `/investments` | Holdings overview |
| Insights | `/insights` | Spending trends, category analysis |
| Settings | `/settings` | Reparse trigger, sender management, PDF passwords |
| Diagnostics | `/diagnostics` | Admin: sync runs, parser stats, sender stats |

---

## 9. Testing Strategy (v1 had unit tests only — v2 adds integration)

### 9.1 Unit Tests (Jest)
- All parsers with real email fixtures (sanitized Indian bank emails)
- Categorization engine with merchant → category assertions
- Deduplication logic
- Indian format utilities
- Merchant sanitization function

### 9.2 Integration Tests (Jest + supertest)
- Full sync flow with mock Gmail API
- Reparse flow with stored emails
- Auth flow including expired token + revoke
- Dashboard aggregation with real DB queries (test database)

### 9.3 Test Fixtures
Create `backend/tests/fixtures/emails/` with sanitized real Indian bank email samples:
- `hdfc_debit_upi.html`
- `icici_credit_salary.html`
- `sbi_atm_withdrawal.html`
- `axis_credit_card_purchase.html`
- `kotak_neft_transfer.html`
- `airtel_bill_reminder.html`
- `lic_premium_reminder.html`
- `zerodha_sip_confirmation.html`

### 9.4 Environment Test
On startup, run a self-test that validates:
- DB connection works
- Migrations are up to date
- Required env vars present
- Optional services status logged

---

## 10. Development Setup

### 10.1 One-Command Start
```bash
# Clone and start
git clone <repo>
cd pfm-india
cp backend/.env.example backend/.env  # fill in Google OAuth creds
docker-compose up -d                   # PostgreSQL + Redis
npm install
npm run migrate
npm run seed                           # seed sender_domains + test user
npm run dev                            # starts backend:3001 + frontend:3000
```

### 10.2 Dev Seed Script
Creates a test user with mock data so the dashboard isn't empty:
- 50 sample transactions across all categories
- 5 detected accounts
- 3 upcoming bills
- 2 investment holdings
- Budget template applied

### 10.3 Environment Variables
```bash
# Required
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REDIRECT_URI=http://localhost:3001/auth/google/callback
DATABASE_URL=postgresql://pfm:pfm@localhost:5432/pfm_india
JWT_SECRET=<generated>
ENCRYPTION_KEY=<generated-32-bytes-hex>

# Optional (app works without these)
ANTHROPIC_API_KEY=sk-ant-...          # enables LLM parsing
REDIS_URL=redis://localhost:6379      # enables persistent cache
```

---

## 11. Deployment Checklist (What v1 Got Wrong)

- [ ] All env vars validated at startup with clear error messages
- [ ] `/health` endpoint checks all dependencies
- [ ] Graceful shutdown handlers registered (SIGTERM, SIGINT)
- [ ] Port conflict detection at startup
- [ ] LLM is optional — app fully works without it
- [ ] All email content stripped to text before parsing
- [ ] Subdomain matching always enabled for whitelisted domains
- [ ] Every skip/fallback/error logged with reason
- [ ] Merchant sanitization runs on ALL merchant sources (LLM, regex, subject)
- [ ] Test suite includes integration tests with DB
- [ ] Dev seed data available for non-empty dashboards
- [ ] Frontend error boundaries on every page
- [ ] Loading states for async operations
- [ ] CI pipeline: lint + test on every push

---

## 12. Prompt for Claude Code / AI Agent

Use this prompt to rebuild the application:

```
Build a Personal Finance Manager (PFM) web app for the Indian market.

ARCHITECTURE:
- Monorepo: Node.js/Express backend (port 3001) + React 18 frontend (port 3000)
- PostgreSQL database, Redis cache (optional)
- Gmail OAuth 2.0 for email access
- Regex-first email parsing with optional Claude Haiku LLM enhancement

CRITICAL RULES (learned from v1 failures):
1. VALIDATE ALL ENV VARS AT STARTUP — fail fast with clear messages
2. NEVER send raw HTML to any parser — always strip to plain text first
3. REGEX PARSER MUST WORK STANDALONE — LLM is optional enhancer only
4. ALWAYS allow subdomain matching for whitelisted domains
5. LOG EVERY skip, fallback, and error with structured JSON and reason
6. SANITIZE ALL MERCHANT NAMES — reject >50 chars, bank boilerplate, card descriptions, placeholders
7. ADD /health endpoint that checks DB, Redis, Gmail, LLM availability
8. GRACEFUL SHUTDOWN — register SIGTERM/SIGINT handlers, detect port conflicts
9. SEED DEV DATA — never start with empty dashboard
10. INTEGRATION TESTS — not just unit tests

FEATURES:
- Gmail email ingestion (sender whitelist, 45+ Indian banks/institutions)
- Transaction parsing from HTML alerts, PDF statements, Excel files
- 16-category merchant categorization (200+ keywords)
- Transaction deduplication across email + statement sources
- Dashboard with net worth, spending, income, savings
- Transaction list with filters, search, user overrides
- Account detection and ledger view
- Bill tracking with due dates
- Budget management with templates
- Financial goal tracking
- Investment holdings overview
- Diagnostics admin panel (sync runs, parser stats, sender management)
- Dark theme UI with Indian currency formatting (₹, lakhs/crores)

See PRD_V2.md for complete specifications including:
- Database schema (Section 4)
- Email processing pipeline (Section 5)
- Regex patterns for Indian bank emails (Section 5.2)
- Merchant sanitization logic (Section 5.3)
- API endpoints (Section 7)
- Test fixtures needed (Section 9.3)
```
