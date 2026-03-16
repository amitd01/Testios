# Testios

Full-stack web application repository containing two projects built with Node.js/Express backends and React 18 frontends.

---

## Projects

### 1. Hiring Pipeline (Active)

A hiring pipeline management system for tracking recruitment consultants, managing job requisitions, scoring candidate CVs, conducting AI-powered pre-interview briefings, and analyzing consultant yield.

**Directory:** `hiring-pipeline/`

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
| PFM India PRD | [`docs/PRD_V2.md`](docs/PRD_V2.md) |
| PFM Session Retrospective | [`docs/SESSION_SUMMARY.md`](docs/SESSION_SUMMARY.md) |

---

## Repository Structure

```
Testios/
├── README.md
├── docs/
│   ├── PRD_V2.md                    # PFM India PRD
│   ├── PRD_V3_HIRING_PIPELINE.md    # Hiring Pipeline PRD
│   ├── TECHNICAL_DOCS.md            # Technical architecture
│   ├── SESSION_LOG.md               # PFM session log
│   ├── SESSION_SUMMARY.md           # PFM retrospective
│   ├── SESSION_SUMMARY_V2.md        # Full repository summary
│   └── memory.md                    # AI context file
├── hiring-pipeline/
│   ├── package.json                 # Workspace root
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.js             # Express app
│   │   │   ├── config/              # DB + env config
│   │   │   ├── controllers/         # 6 controllers
│   │   │   ├── models/              # 8 models
│   │   │   ├── services/            # 4 services
│   │   │   ├── migrations/          # 3 migrations + seed
│   │   │   ├── routes/              # Route definitions
│   │   │   └── middleware/          # JWT auth
│   │   ├── scripts/                 # Seed + simulation
│   │   └── __tests__/               # 68 tests, 9 suites
│   └── frontend/
│       └── src/
│           ├── pages/               # 7 pages
│           ├── components/          # 4 components
│           └── utils/               # API client
```

---

## Testing

```bash
# Hiring Pipeline tests
cd hiring-pipeline
npm test

# Run with coverage
npx jest --coverage --workspace=backend
```
