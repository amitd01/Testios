# Testios Repository — Memory File

> This file captures essential context for any AI agent or developer continuing work on this repository. Read this first before making changes.

---

## Repository Overview

**Owner:** amitd01
**Repo:** Testios
**GitHub:** [amitd01/Testios](https://github.com/amitd01/Testios)
**Mirror:** [amitd01/hiring-pipeline-app](https://github.com/amitd01/hiring-pipeline-app)
**Contains:** Two full-stack web applications in separate directories

| Project | Directory | Branch | Status |
|---------|-----------|--------|--------|
| PFM India (Personal Finance Manager) | `(root backend/ & frontend/)` | `claude/pfm-gmail-integration-24H4a` | Complete, 26 commits |
| Hiring Pipeline (HCS) | `hiring-pipeline/` | `claude/consultant-ranking-prebriefing-Qitve` | Active development |

### All Branches

| Branch | Purpose | Status |
|--------|---------|--------|
| `master` | Main branch | Stable |
| `claude/consultant-ranking-prebriefing-Qitve` | Hiring Pipeline dev | Active |
| `claude/pfm-gmail-integration-24H4a` | PFM India project | Complete |
| `claude/create-hiring-pipeline-video-Pid9t` | Demo video | Archive |
| `claude/create-product-walkthrough-video-awWci` | Walkthrough video | Archive |

---

## Active Project: Hiring Pipeline

### What It Does
Manages recruitment consultant relationships and hiring pipeline. Tracks which consultants deliver the best candidates for which role types, scores CVs automatically, conducts AI briefings with candidates before manager interviews, and provides pipeline analytics.

### Tech Stack
- **Backend:** Node.js + Express (port 3002)
- **Frontend:** React 18 + React Router v6 + Recharts (port 3003)
- **Database:** PostgreSQL (default config port 5433, typical installs use 5432)
- **AI:** Anthropic Claude Haiku 4.5 (optional — system works without it)
- **Auth:** JWT dev token (not production-ready)
- **Monorepo:** npm workspaces

### Database Tables (3 migrations)
1. `role_families` — 8 seeded (Engineering, Sales, Product, Operations, Finance, Marketing, HR, Leadership)
2. `consultants` + `consultant_specialties` — Firms with role family specializations
3. `requisitions` + `requisition_consultants` — Open positions with assigned consultants
4. `candidates` — People submitted by consultants
5. `cv_submissions` — Pipeline tracking with 7 stages + fit_score (0-100)
6. `briefings` — AI chat transcripts with link tokens
7. `hiring_outcomes` — Historical yield data for rankings
8. `interview_slots` + `interview_bookings` — Scheduling with booking tokens

### Key Commands
```bash
cd hiring-pipeline
npm install
npm run migrate                          # Run DB migrations
node backend/src/migrations/seed.js      # Seed test data
node backend/scripts/seed-historical-data.js  # Seed 8 years of analytics data
npm run dev                              # Start both servers
npm run test                             # Run 68 tests
```

### Environment Variables
```bash
# In hiring-pipeline/backend/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hiring_pipeline
JWT_SECRET=dev-secret
ANTHROPIC_API_KEY=sk-ant-...   # Optional: enables LLM CV scoring + briefing chat
PORT=3002
FRONTEND_URL=http://localhost:3003
```

### API Routes (all under /api)
- `/consultants` — CRUD + rankings
- `/requisitions` — CRUD + suggest consultants + assign
- `/cv-submissions` — Submit, score, advance, reject, dashboard, aging
- `/briefings` — Create (auth) + chat/complete (public via token)
- `/interview-slots` — Create individual/bulk
- `/interviews` — Book, cancel, complete + public scheduling
- `/analytics` — Time-to-hire, consultant comparison, stage dropoff, briefing effectiveness, role family breakdown

### Frontend Routes
- `/` — Dashboard (pipeline overview, aging alerts)
- `/consultants` — Consultant management
- `/requisitions` — Requisition list
- `/requisitions/:id` — Detail with CV pipeline
- `/analytics` — Charts and metrics
- `/briefing/:token` — Public AI briefing chat
- `/interview/:token` — Public interview scheduling

---

## Known Issues

1. **PostgreSQL port mismatch:** Config default is 5433 but most installs use 5432. Always set `DATABASE_URL` in `.env`.
2. **No startup DB validation:** App starts listening before confirming DB connection works.
3. **Auth is dev-only:** Uses a static dev token, needs real OAuth/SSO for production.
4. **No CV file upload:** The `cv_file_path` column exists but upload isn't implemented.
5. **Briefing requires LLM:** Unlike CV scoring which has rule-based fallback, briefing chat needs ANTHROPIC_API_KEY.

---

## Previous Project: PFM India

### What It Does
Ingests bank transaction alert emails from Gmail (Indian banks), parses transaction data, categorizes spending, and displays financial dashboard.

### Key Lessons (applied to Hiring Pipeline)
1. Never make LLM a hard dependency — always have rule-based fallback
2. Validate env vars at startup — fail fast
3. Always seed dev data — empty dashboards are useless for development
4. Strip HTML before sending to LLM — raw HTML causes garbage extraction
5. Log every skip/fallback/error with structured reason

### Status
Complete but user's local machine has environment issues (missing API keys, PostgreSQL not configured). The PRD (PRD_V2.md) and session summary document the full build.

---

## Documentation Index

| File | Description |
|------|-------------|
| `CLAUDE.md` | AI/developer quick-reference guide |
| `README.md` | Repository overview and getting started guide |
| `docs/PRD_V2.md` | PFM India product requirements document |
| `docs/PRD_V3_HIRING_PIPELINE.md` | Hiring Pipeline product requirements document |
| `docs/TECHNICAL_DOCS.md` | Hiring Pipeline technical architecture and reference |
| `docs/SESSION_SUMMARY.md` | PFM India session retrospective |
| `docs/SESSION_SUMMARY_V2.md` | Complete repository session summary (both projects) |
| `docs/SESSION_LOG.md` | PFM India turn-by-turn session log |
| `docs/memory.md` | This file — quick context for continuing work |

---

## Development Tips

1. **Start PostgreSQL first** — `brew services start postgresql@16` (Mac) or `sudo systemctl start postgresql` (Linux)
2. **Create the database** — `createdb hiring_pipeline`
3. **Check port** — Run `pg_isready` to confirm PostgreSQL port
4. **Set DATABASE_URL** — Don't rely on the default in config (port 5433 may be wrong)
5. **Seed data** — Always run seed after migrate to get a working dashboard
6. **Tests** — Run from `hiring-pipeline/` with `npm test`
7. **LLM features** — CV scoring works without API key (rule-based), briefing chat does not

---

*Last updated: March 2026*
