# Testios — Hiring Pipeline

Full-stack web application repository containing two projects built with Node.js/Express backends and React 18 frontends.

**GitHub:** [amitd01/Testios](https://github.com/amitd01/Testios) | **Mirror:** [amitd01/hiring-pipeline-app](https://github.com/amitd01/hiring-pipeline-app)

---

## Projects

### 1. Hiring Pipeline (Active)

A hiring pipeline management system for tracking recruitment consultants, managing job requisitions, scoring candidate CVs, conducting AI-powered pre-interview briefings, and analyzing consultant yield.

**Directory:** `hiring-pipeline/`
**Branch:** `claude/consultant-ranking-prebriefing-Qitve`

**Key features:**
- Consultant management with yield-based rankings across 8 role families
- Requisition lifecycle tracking (open -> filled | cancelled)
- CV triage engine with 5-dimension scoring (rule-based + optional LLM)
- AI-powered pre-interview candidate briefings via Claude Haiku
- Self-service interview scheduling with public booking links
- Analytics dashboard (time-to-hire, consultant comparison, pipeline funnel)
- 68 tests across 9 test suites

**Tech stack:** Node.js, Express, PostgreSQL, React 18, Recharts, Anthropic Claude Haiku (optional)

#### Quick Start

```bash
# Prerequisites: Node.js, PostgreSQL running

cd hiring-pipeline

# Configure database
cp backend/.env.example backend/.env
# Edit .env: set DATABASE_URL=postgresql://user:pass@localhost:5432/hiring_pipeline

# Setup
npm install
npm run migrate
node backend/src/migrations/seed.js

# Run
npm run dev
# Backend: http://localhost:3002
# Frontend: http://localhost:3003
```

#### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | `postgresql://postgres:postgres@localhost:5433/hiring_pipeline` | PostgreSQL connection string |
| JWT_SECRET | No | `dev-secret` | JWT signing secret |
| ANTHROPIC_API_KEY | No | (empty) | Enables LLM CV scoring + briefing chat |
| PORT | No | `3002` | Backend server port |
| FRONTEND_URL | No | `http://localhost:3003` | CORS allowed origin |

#### API Overview

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Consultants | 5 | CRUD + yield rankings per role family |
| Requisitions | 6 | CRUD + suggest/assign consultants |
| CV Submissions | 8 | Submit, score, advance, reject, dashboard |
| Briefings | 5 | Create (auth) + AI chat (public via token) |
| Interviews | 8 | Slot management + public scheduling |
| Analytics | 5 | Time-to-hire, comparisons, funnel, effectiveness |

---

### 2. PFM India (Complete)

A Personal Finance Manager for the Indian market that ingests bank transaction alerts from Gmail, parses financial data, and displays spending insights.

**Key features:**
- Gmail OAuth 2.0 email ingestion
- Regex-first transaction parsing with optional LLM enhancement
- 45+ Indian bank sender domain whitelist
- 16-category transaction classification
- Transaction deduplication
- Dashboard with spending, income, net worth
- 115 tests across 12 test files

**Branch:** `claude/pfm-gmail-integration-24H4a`

---

## Documentation

| Document | Path |
|----------|------|
| Hiring Pipeline PRD | [`docs/PRD_V3_HIRING_PIPELINE.md`](docs/PRD_V3_HIRING_PIPELINE.md) |
| Technical Architecture | [`docs/TECHNICAL_DOCS.md`](docs/TECHNICAL_DOCS.md) |
| Session Summary | [`docs/SESSION_SUMMARY_V2.md`](docs/SESSION_SUMMARY_V2.md) |
| Memory File (AI context) | [`docs/memory.md`](docs/memory.md) |
| CLAUDE.md (dev guide) | [`CLAUDE.md`](CLAUDE.md) |
| PFM India PRD | [`docs/PRD_V2.md`](docs/PRD_V2.md) |
| PFM Session Retrospective | [`docs/SESSION_SUMMARY.md`](docs/SESSION_SUMMARY.md) |

---

## Repository Structure

```
Testios/
├── README.md
├── CLAUDE.md                           # AI/developer quick-reference
├── docs/
│   ├── PRD_V2.md                       # PFM India PRD
│   ├── PRD_V3_HIRING_PIPELINE.md       # Hiring Pipeline PRD
│   ├── TECHNICAL_DOCS.md               # Technical architecture
│   ├── SESSION_LOG.md                  # PFM session log
│   ├── SESSION_SUMMARY.md             # PFM retrospective
│   ├── SESSION_SUMMARY_V2.md          # Full repository summary
│   └── memory.md                       # AI context file
├── hiring-pipeline/
│   ├── package.json                    # Workspace root
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.js               # Express app
│   │   │   ├── config/                # DB + env config
│   │   │   ├── controllers/           # 6 controllers
│   │   │   ├── models/                # 8 models
│   │   │   ├── services/              # 4 services
│   │   │   ├── migrations/            # 3 migrations + seed
│   │   │   ├── routes/                # Route definitions
│   │   │   └── middleware/            # JWT auth
│   │   ├── scripts/                   # Seed + simulation
│   │   └── __tests__/                 # 68 tests, 9 suites
│   └── frontend/
│       └── src/
│           ├── pages/                 # 7 pages
│           ├── components/            # 4 components
│           └── utils/                 # API client
├── backend/                            # PFM India backend
├── frontend/                           # PFM India frontend
├── Dockerfile
├── docker-compose.yml
├── setup.sh
└── restart.sh
```

---
# PFM India — Personal Finance Manager

A full-stack Personal Finance Manager for the Indian market that automatically ingests bank transaction alert emails from Gmail, parses transaction data, and displays financial insights in a React dashboard.

## Features

- **Gmail Email Ingestion** — OAuth 2.0 integration with sender domain whitelist (45+ Indian banks & financial institutions)
- **Smart Parsing** — Regex-first transaction extraction with optional Claude Haiku LLM enhancement
- **16-Category Classification** — 200+ merchant keywords for automatic categorization (Food, Shopping, Transport, Bills, etc.)
- **Transaction Deduplication** — Merges duplicates across email alerts and bank statements
- **Dashboard** — Net worth, spending trends, income, savings rate, recent transactions
- **Account Detection** — Auto-detects bank accounts/cards from email patterns with ledger drill-down
- **Bill Tracking** — Upcoming bills with due dates and pay-status tracking
- **Budget Management** — Category budgets with pre-built templates
- **Financial Goals** — Goal tracking with progress visualization
- **Investment Holdings** — Portfolio overview from investment confirmation emails
- **Diagnostics Panel** — Sync run history, parser performance stats, sender domain management
- **Indian Locale** — INR formatting (₹, lakhs/crores), DD/MM/YYYY dates, dark theme UI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20 LTS, Express.js |
| Frontend | React 18, React Router v6, Recharts, Lucide Icons |
| Database | PostgreSQL 16 |
| Cache | Redis (optional, in-memory fallback) |
| Auth | Google OAuth 2.0 + JWT |
| Email | Gmail API via googleapis |
| LLM (optional) | Anthropic Claude Haiku |
| Testing | Jest + supertest (115 tests) |
| Dev | nodemon, concurrently, Docker Compose |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/amitd01/Testios.git
cd Testios
npm install

# 2. Start PostgreSQL + Redis
docker-compose up -d

# 3. Configure environment
cp backend/.env.example backend/.env
# Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY

# 4. Run migrations
npm run migrate

# 5. Start dev servers (backend:3001, frontend:3000)
npm run dev
```

## Environment Variables

```bash
# Required
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REDIRECT_URI=http://localhost:3001/auth/google/callback
DATABASE_URL=postgresql://pfm:pfm@localhost:5432/pfm_india
JWT_SECRET=<random-string>
ENCRYPTION_KEY=<32-bytes-hex>

# Optional (app works without these)
ANTHROPIC_API_KEY=sk-ant-...     # Enables LLM-enhanced parsing
REDIS_URL=redis://localhost:6379  # Enables persistent cache
```

## Project Structure

```
Testios/
├── backend/
│   └── src/
│       ├── controllers/    # Route handlers (auth, sync, dashboard, transactions, etc.)
│       ├── services/       # Business logic (email processing, LLM parser, categorization, dedup)
│       ├── parsers/        # Email parsers (HTML alerts, bill reminders)
│       ├── models/         # PostgreSQL data access layer
│       ├── utils/          # Regex patterns, Indian formats, logging, validation
│       ├── middleware/     # Auth, error handling
│       ├── migrations/    # DB schema (4 migrations, 16 tables)
│       ├── routes/        # Express route definitions
│       └── index.js       # Server entry point
├── frontend/
│   └── src/
│       ├── pages/         # Dashboard, Transactions, Accounts, Bills, Budgets, etc.
│       ├── components/    # Layout, modals, shared UI
│       ├── hooks/         # Custom React hooks
│       ├── store/         # State management
│       └── utils/         # Frontend utilities
├── docs/                  # PRD, session logs, retrospective
├── docker-compose.yml     # PostgreSQL + Redis
└── package.json           # Monorepo root (npm workspaces)
```

## API Overview

| Endpoint Group | Description |
|---------------|-------------|
| `GET /health` | Health check (DB, Redis, LLM, Gmail status) |
| `GET /auth/google` | Google OAuth login flow |
| `POST /auth/revoke` | Revoke access / logout |
| `GET /api/dashboard` | Dashboard summary data |
| `GET /api/transactions` | Paginated transaction list with filters |
| `POST /api/sync/start` | Full Gmail sync |
| `POST /api/sync/onboarding` | 30-day initial email scan |
| `POST /api/sync/reparse` | Re-process stored emails |
| `GET /api/accounts` | Detected bank accounts |
| `GET /api/bills` | Bill tracking |
| `CRUD /api/budgets` | Budget management |
| `CRUD /api/goals` | Financial goals |
| `GET /api/diagnostics/*` | Admin diagnostics panel |

See [docs/PRD_V2.md](docs/PRD_V2.md) for the complete API specification (40+ endpoints).

## Testing

```bash
# Hiring Pipeline tests
cd hiring-pipeline
npm test

# Run with coverage
npx jest --coverage --workspace=backend
```

---

## Branches

| Branch | Purpose | Status |
|--------|---------|--------|
| `master` | Main branch | Stable |
| `claude/consultant-ranking-prebriefing-Qitve` | Hiring Pipeline development | Active |
| `claude/pfm-gmail-integration-24H4a` | PFM India project | Complete |
| `claude/create-hiring-pipeline-video-Pid9t` | Hiring Pipeline demo video | Archive |
| `claude/create-product-walkthrough-video-awWci` | Product walkthrough video | Archive |
npm test              # Run all 115 tests
```

Test coverage includes: parser unit tests, API integration tests, categorization engine, deduplication logic, Indian format utilities, sender whitelist matching, and edge cases.

## Architecture Decisions

- **Regex-first, LLM-optional**: App is fully functional without an Anthropic API key (~70% accuracy). LLM enhances merchant names and categorization when available.
- **HTML stripping before parsing**: All email content is converted to plain text before any processing.
- **Subdomain auto-matching**: If `hdfcbank.net` is whitelisted, `alerts.hdfcbank.net` is automatically accepted.
- **Observability envelope**: All parsers return `{ data, meta }` for structured tracking via `sync_runs` table.

## License

Private
