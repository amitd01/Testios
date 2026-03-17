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
