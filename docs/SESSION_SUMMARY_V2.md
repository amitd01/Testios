# Testios Repository — Complete Session Summary

**Repository:** amitd01/Testios
**Sessions:** March 10-16, 2026
**Projects Built:** 2 (PFM India + Hiring Pipeline)

---

## Project Timeline

### Project 1: PFM India (Personal Finance Manager)
**Branch:** `claude/pfm-gmail-integration-24H4a`
**Period:** March 10-12, 2026
**Commits:** 26 (d86729a -> dfa2173)

A full-stack Personal Finance Manager for the Indian market that ingests bank transaction alerts from Gmail, parses transaction data using regex + optional LLM, and displays financial insights. Built with Node.js/Express backend and React 18 frontend.

**Key features built:**
- Gmail OAuth 2.0 integration for email access
- Email processing pipeline with sender domain whitelist (45+ Indian banks)
- Regex-first transaction parsing (amount, merchant, date, type)
- Optional Claude Haiku LLM enhancement for merchant extraction
- Merchant sanitization and 16-category classification (200+ keywords)
- Transaction deduplication engine
- Dashboard with net worth, spending, income, savings
- Account detection and ledger view
- Bill tracking, budgets, goals, investment tracking
- Diagnostics admin panel (sync runs, parser stats)
- 115 tests across 12 test files

**Major issues encountered and resolved:**
1. **HTML sent to LLM** (root cause of parsing failures) — 7 commits to find
2. **Auth/revoke cascade** — 5 commits to fix expired token + logout flow
3. **Subdomain whitelist filtering** — silently dropped 95%+ of emails
4. **Environment divergence** — dev vs local Mac had completely different state
5. **Port conflicts** (EADDRINUSE) — no graceful shutdown handlers

**Final state:** 112 emails fetched, 91 parsed, 33 transactions in regex-only mode on user's local machine.

---

### Project 2: Hiring Consultant System (HCS)
**Branch:** `claude/consultant-ranking-prebriefing-Qitve`
**Period:** March 12-16, 2026
**Commits:** 11 (72a6426 -> 3d9cd1b)

A hiring pipeline management system for tracking recruitment consultants, managing requisitions, scoring CVs, conducting AI-powered pre-interview briefings, scheduling interviews, and analyzing consultant yield.

**Development phases:**

#### Phase 1: Core Pipeline (72a6426)
Built the foundational system:
- PostgreSQL schema with 9 tables (role_families, consultants, requisitions, candidates, cv_submissions, briefings, hiring_outcomes, + junction tables)
- Consultant management with specialty tracking across 8 role families
- Requisition lifecycle management (open -> filled | cancelled)
- CV submission pipeline with 7 stages
- Yield-based consultant ranking (submit-to-interview, interview-to-offer, offer-to-accept)
- Pre-interview briefing system with AI chat via Claude Haiku
- React frontend with Dashboard, Consultants, Requisitions, Analytics pages

#### Phase 2: Interview Scheduling (2f81117)
Added interview scheduling module:
- Interview slot management (create individual or bulk slots)
- Public scheduling links via UUID tokens
- Candidate self-service booking
- Booking lifecycle (confirmed -> completed | cancelled | no_show)
- InterviewBooking frontend page

#### Phase 3: CV Triage Engine (2c1423d)
Added automated CV scoring:
- 5-dimension scoring (0-100): role relevance, experience depth, location fit, compensation alignment, culture signals
- Rule-based scoring with 200+ keywords across 8 role families
- LLM-based scoring via Claude Haiku when API key available
- Rescore capability
- 68 tests across 9 test suites

#### Phase 4: Trial Run & Simulation (f20da9f -> 254da8d)
End-to-end validation:
- Seed scripts with realistic test data (6 consultants, 7 requisitions, 12 candidates, 12 CV submissions)
- Pipeline simulation script
- Interactive HTML dry-run report
- Frontend simulation interface

#### Phase 5: Historical Data & Analytics (90dfb43 -> 92e4efb)
Analytics depth:
- 8 years of simulated hiring outcome data across 10 consultants
- 5 analytics endpoints (time-to-hire trend, consultant comparison, stage dropoff, briefing effectiveness, role family breakdown)
- Historical data seed script with realistic performance profiles

#### Phase 6: Local Setup (3d9cd1b)
- Local restart script for PostgreSQL and hiring-pipeline services
- Database connection troubleshooting

**Current state:** Application fully built and deployed to branch. User's local Mac encountering PostgreSQL connection issues (ECONNREFUSED on port 5433 — PostgreSQL not running or wrong port).

---

## Commit History (Hiring Pipeline)

| Commit | Description |
|--------|-------------|
| 3d9cd1b | Add local restart script for PostgreSQL and hiring-pipeline services |
| 92e4efb | Add seed script with comprehensive test data for all pipeline entities |
| 3e24086 | Add dry run simulation report as interactive HTML |
| 90dfb43 | Add rescore endpoint and expand test suite to 68 tests across 9 suites |
| 2c1423d | Add CV Triage Engine, Testing Framework, and Analytics Deep Dive |
| c6644f5 | Update HTML report with interview scheduling page |
| 2f81117 | Add Interview Scheduling Engine (HCS Module 9) |
| 3010248 | Replace static report with interactive frontend simulation |
| 254da8d | Add self-contained HTML report for trial run results |
| a26998c | Use fallback dev token when localStorage is blocked in sandboxed environments |
| 9203839 | Add package-lock.json for hiring-pipeline backend dependencies |
| f20da9f | Add end-to-end trial run: seed data + pipeline simulation scripts |
| 72a6426 | Add hiring pipeline system: consultant ranking, CV triage, and pre-interview briefing |

---

## Architectural Decisions

### Decision 1: Monorepo with npm Workspaces
Both projects use the same monorepo pattern: root `package.json` with workspaces for `backend/` and `frontend/`. This keeps dependencies isolated while allowing shared scripts.

### Decision 2: Rule-Based Fallback for AI Features
Both projects learned from PFM v1's mistake of making LLM a hard dependency. The hiring pipeline's CV triage engine works fully without ANTHROPIC_API_KEY via keyword-based scoring. Briefings require the API key (no rule-based chat fallback).

### Decision 3: Token-Based Public Access
Candidate-facing features (briefings, interview scheduling) use UUID tokens instead of authentication. This avoids forcing candidates to create accounts.

### Decision 4: Yield-Based Consultant Ranking
Instead of subjective rankings, consultants are ranked by historical data: what percentage of their submitted candidates actually get hired? Minimum 3 submissions required to qualify for ranking.

### Decision 5: Stage-Based Pipeline
CV submissions follow a defined 7-stage pipeline (submitted -> screened -> shortlisted -> sent_to_manager -> interview_scheduled -> hired | rejected). Each stage transition is timestamped for analytics.

---

## Technical Debt

| Area | Issue | Severity |
|------|-------|----------|
| Auth | Dev token only, no real OAuth/SSO | High |
| CV Upload | cv_file_path column exists but no upload handler | Medium |
| Notifications | No email notifications for bookings/briefings | Medium |
| Real-time | No WebSocket for briefing chat updates | Low |
| Docker | No Docker Compose for local dev | Medium |
| CI/CD | No GitHub Actions pipeline | High |
| DB Config | Default port 5433 in config doesn't match typical PostgreSQL 5432 | Low |
| Error handling | Startup doesn't validate DB connection before listening | Medium |

---

## Lessons Learned

### From PFM India (carried into Hiring Pipeline)
1. **Always validate env at startup** — PFM started without API key, failed silently per-request
2. **Rule-based fallback for AI features** — System must be functional without LLM
3. **Seed data for dev** — Empty dashboards make development painful
4. **Log every decision** — Silent failures waste hours of debugging
5. **Integration tests matter** — Unit tests passed while real flow was broken

### From Hiring Pipeline
1. **Token-based public access works well** — Candidates don't need accounts
2. **Historical seed data is valuable** — Analytics pages need real data to test
3. **Stage-based pipelines need timestamps** — Every transition should be recorded
4. **Local PostgreSQL setup is a common friction point** — Port mismatches, service not running
