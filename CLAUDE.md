# CLAUDE.md — Developer & AI Agent Guide

> Quick-reference for any AI agent or developer working on this repository.

## Repository

- **Owner:** amitd01
- **Repo:** Testios (GitHub: amitd01/Testios, mirror: amitd01/hiring-pipeline-app)
- **Active project:** Hiring Pipeline (`hiring-pipeline/`)
- **Completed project:** PFM India (root `backend/` + `frontend/`)

## Active Branch

`claude/consultant-ranking-prebriefing-Qitve` — Hiring Pipeline development

## Quick Commands

```bash
# Hiring Pipeline
cd hiring-pipeline
npm install
npm run migrate
node backend/src/migrations/seed.js          # Seed base data
node backend/scripts/seed-historical-data.js  # Seed analytics data (8 years)
npm run dev                                   # Backend :3002, Frontend :3003
npm test                                      # 68 tests, 9 suites

# PFM India (from repo root)
npm install
npm run dev
npm test                                      # 115 tests, 12 files
```

## Environment Setup

```bash
# hiring-pipeline/backend/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hiring_pipeline
JWT_SECRET=dev-secret
ANTHROPIC_API_KEY=sk-ant-...   # Optional: enables LLM CV scoring + briefing chat
PORT=3002
FRONTEND_URL=http://localhost:3003
```

PostgreSQL must be running. Default config uses port 5433 but most installs use 5432 — always set `DATABASE_URL` explicitly.

## Architecture

### Hiring Pipeline
- **Backend:** Node.js + Express, PostgreSQL, JWT auth (dev token)
- **Frontend:** React 18, React Router v6, Recharts
- **AI:** Anthropic Claude Haiku 4.5 (optional — CV scoring has rule-based fallback, briefing chat requires API key)
- **Monorepo:** npm workspaces (`hiring-pipeline/backend` + `hiring-pipeline/frontend`)

### Database (8 tables, 3 migrations)
`role_families` > `consultants` + `consultant_specialties` > `requisitions` + `requisition_consultants` > `candidates` > `cv_submissions` > `briefings` > `hiring_outcomes` > `interview_slots` + `interview_bookings`

### API Routes (all under /api)
- `/consultants` — CRUD + rankings
- `/requisitions` — CRUD + suggest/assign consultants
- `/cv-submissions` — Submit, score, advance, reject, dashboard, aging
- `/briefings` — Create (auth) + chat/complete (public via token)
- `/interview-slots` — Create individual/bulk slots
- `/interviews` — Book, cancel, complete + public scheduling
- `/analytics` — Time-to-hire, consultant comparison, stage dropoff, briefing effectiveness

### Frontend Routes
- `/` — Dashboard (pipeline overview, aging alerts)
- `/consultants` — Consultant management
- `/requisitions` — Requisition list
- `/requisitions/:id` — Detail with CV pipeline
- `/analytics` — Charts and metrics
- `/briefing/:token` — Public AI briefing chat
- `/interview/:token` — Public interview scheduling

## Key Design Decisions

1. **LLM is never a hard dependency** — Rule-based fallback for CV scoring; only briefing chat requires API key
2. **Yield-based consultant ranking** — Consultants ranked by historical hiring success per role family
3. **Public token links** — Briefing and interview pages accessible without auth via unique tokens
4. **Dev auth only** — Static JWT dev token, not production-ready

## Known Issues

1. PostgreSQL port mismatch (config default 5433 vs typical 5432)
2. No startup DB validation — app starts before confirming DB connection
3. Auth is dev-only — needs real OAuth/SSO for production
4. No CV file upload — column exists but upload not implemented
5. Briefing requires LLM — no fallback unlike CV scoring

## Testing

Tests are in `hiring-pipeline/backend/__tests__/` — 9 suites covering consultants, requisitions, CV submissions, briefings, interviews, analytics, and integration scenarios. Run with `npm test` from `hiring-pipeline/`.

## File Layout

Key source files:
- `hiring-pipeline/backend/src/index.js` — Express app entry
- `hiring-pipeline/backend/src/controllers/` — 6 controllers
- `hiring-pipeline/backend/src/models/` — 8 models
- `hiring-pipeline/backend/src/services/` — 4 services (CV scoring, briefing, analytics, scheduling)
- `hiring-pipeline/backend/src/migrations/` — 3 migrations + seed
- `hiring-pipeline/frontend/src/pages/` — 7 pages
- `hiring-pipeline/frontend/src/components/` — 4 shared components
