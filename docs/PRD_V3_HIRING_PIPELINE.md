# Hiring Consultant System (HCS) — Product Requirements Document v3

## Overview

> Build a Hiring Pipeline Management System that tracks recruitment consultants, manages job requisitions, scores candidate CVs, conducts AI-powered pre-interview briefings, schedules interviews, and provides analytics on consultant performance and pipeline health.

**Repository:** amitd01/Testios
**Directory:** `hiring-pipeline/`
**Session Period:** March 12-16, 2026
**Branch:** `claude/consultant-ranking-prebriefing-Qitve`

---

## 1. Problem Statement

Organizations using external recruitment consultants face several challenges:
- No visibility into which consultants deliver the best candidates for specific role types
- Manual CV screening is slow and inconsistent
- Candidates arrive at interviews without understanding the role, leading to wasted manager time
- No data-driven way to rank consultants or measure pipeline health
- Interview scheduling is fragmented across email threads

This system solves these by providing a unified platform for consultant management, CV triage, pre-interview candidate briefings, interview scheduling, and yield analytics.

---

## 2. Core Architecture

### 2.1 System Design
- **Monorepo:** npm workspaces (root + backend + frontend)
- **Backend:** Node.js/Express REST API on port 3002
- **Frontend:** React 18 SPA on port 3003 (proxied to backend)
- **Database:** PostgreSQL with 3 migrations
- **AI Integration:** Anthropic Claude Haiku 4.5 for CV scoring, briefing chat, and briefing evaluation
- **Auth:** JWT-based dev token (simplified for internal tool)

### 2.2 Key Design Decisions
- **Rule-based fallback:** CV triage scoring works without LLM via keyword matching (5-dimension scoring)
- **Token-based public access:** Candidates access briefings and interview scheduling via unique UUID tokens (no login required)
- **Yield-based ranking:** Consultants are ranked by historical submit-to-hire conversion rates per role family

---

## 3. Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL 16 with `pg` driver + connection pooling
- **AI:** @anthropic-ai/sdk (Claude Haiku 4.5)
- **Auth:** jsonwebtoken (JWT)
- **Security:** helmet, cors
- **Logging:** morgan (HTTP), custom logger (app)
- **Testing:** Jest + supertest
- **Dev:** nodemon

### Frontend
- **Framework:** React 18 with React Router v6
- **Charts:** Recharts
- **Icons:** Lucide React
- **HTTP Client:** Axios
- **Styling:** CSS (global stylesheet)

---

## 4. Database Schema

### 4.1 Tables (3 migrations)

#### Migration 001: Core Pipeline
```sql
role_families (id, name, description, created_at)
  -- Seeded: Engineering, Sales, Product, Operations, Finance, Marketing, HR, Leadership

consultants (id, firm_name, contact_name, contact_email, phone, notes, active, created_at)

consultant_specialties (consultant_id, role_family_id)
  -- Many-to-many: which consultants specialize in which role families

requisitions (id, title, role_family_id, hiring_manager_name, hiring_manager_email,
  description, field_expectations, compensation_range, team_info,
  status [open|filled|cancelled], created_at, filled_at)

requisition_consultants (id, requisition_id, consultant_id, computed_rank, assigned_at)
  -- Which consultants are working on which requisitions

candidates (id, name, email, phone, source_consultant_id, created_at)

cv_submissions (id, requisition_id, candidate_id, consultant_id, cv_file_path,
  consultant_rationale, status [submitted|screened|shortlisted|sent_to_manager|
  interview_scheduled|hired|rejected], submitted_at, screened_at, shortlisted_at,
  sent_to_manager_at, interview_scheduled_at, resolved_at, rejection_reason, created_at)

briefings (id, cv_submission_id, candidate_id, requisition_id,
  status [pending|in_progress|completed|failed], transcript JSONB, summary,
  link_token UUID, started_at, completed_at, created_at)

hiring_outcomes (id, requisition_id, consultant_id, role_family_id, candidate_id,
  submitted, interviewed, offered, accepted, time_to_fill_days, created_at)
```

#### Migration 002: Interview Scheduling
```sql
interview_slots (id, requisition_id, interviewer_name, interviewer_email,
  start_time, end_time, duration_minutes, is_booked, created_at)

interview_bookings (id, slot_id, cv_submission_id, candidate_id,
  booking_token UUID, scheduling_token UUID,
  status [confirmed|cancelled|completed|no_show], booked_at, cancelled_at, notes, created_at)
```

#### Migration 003: CV Triage
```sql
ALTER cv_submissions ADD fit_score INTEGER;
ALTER cv_submissions ADD fit_analysis JSONB;
ALTER cv_submissions ADD scored_at TIMESTAMP;
INDEX idx_cv_sub_fit_score ON cv_submissions(fit_score);
```

### 4.2 Key Indexes
- `cv_submissions(requisition_id, status)` — pipeline queries
- `cv_submissions(consultant_id)` — consultant performance
- `cv_submissions(fit_score)` — triage filtering
- `hiring_outcomes(consultant_id, role_family_id)` — yield calculations
- `interview_slots(requisition_id)`, `interview_slots(start_time)` — slot lookups
- `interview_bookings(booking_token)`, `interview_bookings(scheduling_token)` — token access
- `briefings(link_token)` — public briefing access

---

## 5. Modules

### Module 1: Consultant Management
**Purpose:** Track recruitment firms, their specialties, and performance rankings.

**Features:**
- CRUD consultants with firm name, contact details, notes
- Assign specialties (role families) to consultants
- View yield rankings per role family (submit-to-interview, interview-to-offer, offer-to-accept)
- Suggest top 3 consultants for a requisition based on historical yield

### Module 2: Requisition Management
**Purpose:** Manage open positions and their lifecycle.

**Features:**
- Create requisitions with title, role family, hiring manager, description, field expectations, compensation, team info
- Track status: open -> filled | cancelled
- Assign consultants to requisitions with computed rank
- View all CV submissions per requisition
- Suggest best consultants based on yield data

### Module 3: CV Triage Engine
**Purpose:** Score incoming CVs against requisitions using AI + rule-based fallback.

**Scoring Dimensions (0-20 each, total 0-100):**
1. **Role Relevance** — keyword overlap between rationale and job description
2. **Experience Depth** — years, seniority signals
3. **Location Fit** — geographic alignment
4. **Compensation Alignment** — budget vs expectations
5. **Culture Signals** — motivation, adaptability indicators

**Methods:**
- **Rule-based (default):** Keyword scanning with 200+ terms across 8 role families
- **LLM-based (when API key available):** Claude Haiku scores with structured JSON output

**Pipeline Stages:**
```
submitted -> screened -> shortlisted -> sent_to_manager -> interview_scheduled -> hired
                                                                              -> rejected (any stage)
```

### Module 4: Pre-Interview Briefing (AI Chat)
**Purpose:** Ensure candidates understand the role before meeting hiring managers.

**Flow:**
1. Admin creates briefing for a CV submission
2. System generates unique link token (UUID)
3. Candidate accesses `/briefing/:token` (no login needed)
4. AI conducts conversational briefing about role details, expectations, compensation
5. On completion, AI evaluates transcript for comprehension
6. Summary attached to candidate's record

**AI Behavior:**
- System prompt includes role title, description, field expectations, comp range, team info
- Honest about challenges (e.g., field work, travel requirements)
- Evaluates: role understanding, expectation awareness, comp comfort, genuine interest
- Defaults to pass if LLM evaluation fails

### Module 5: Interview Scheduling
**Purpose:** Allow candidates to self-schedule interviews from available slots.

**Features:**
- Admin creates interview time slots (individual or bulk)
- Generate scheduling link for candidate (UUID token)
- Candidate sees available slots and books one
- Track booking status: confirmed -> completed | cancelled | no_show

### Module 6: Analytics Dashboard
**Purpose:** Data-driven insights on pipeline health and consultant performance.

**Analytics Endpoints:**
- **Time-to-Hire Trend:** Monthly average days-to-fill over last N months
- **Consultant Comparison:** Side-by-side yield metrics for all consultants
- **Stage Dropoff:** Conversion rates between pipeline stages (funnel)
- **Briefing Effectiveness:** Pass/fail rates, conversation turns, hire correlation
- **Role Family Breakdown:** Submissions and hires per role family

---

## 6. API Endpoints

### Health
```
GET  /health                                    -> { status: 'ok' }
```

### Role Families
```
GET  /api/role-families                         -> List all role families
POST /api/role-families                         -> Create role family
```

### Consultants
```
GET  /api/consultants                           -> List all consultants
POST /api/consultants                           -> Create consultant
PATCH /api/consultants/:id                      -> Update consultant
GET  /api/consultants/:id/rankings              -> Consultant yield profile
GET  /api/consultants/rankings-by-role/:rfId    -> Rankings for a role family
```

### Requisitions
```
GET  /api/requisitions                          -> List (filterable by status)
POST /api/requisitions                          -> Create requisition
GET  /api/requisitions/:id                      -> Detail with CVs, consultants
PATCH /api/requisitions/:id                     -> Update requisition
GET  /api/requisitions/:id/suggest-consultants  -> Top 3 consultants by yield
POST /api/requisitions/:id/assign-consultants   -> Assign consultants
```

### CV Submissions
```
POST /api/cv-submissions                        -> Submit CV
GET  /api/cv-submissions                        -> List all (filterable)
GET  /api/cv-submissions/dashboard              -> Pipeline stage counts
GET  /api/cv-submissions/aging                  -> Stalled CVs (N+ days)
GET  /api/cv-submissions/:id                    -> Detail with score
GET  /api/cv-submissions/:id/score              -> Get/trigger scoring
POST /api/cv-submissions/:id/rescore            -> Force rescore
PATCH /api/cv-submissions/:id/advance           -> Move to next stage
PATCH /api/cv-submissions/:id/reject            -> Reject with reason
```

### Briefings (Auth Required)
```
POST /api/briefings                             -> Create briefing for CV submission
GET  /api/briefings/:id                         -> Get briefing details
```

### Briefings (Public - Candidate Access)
```
GET  /api/briefings/by-token/:token             -> Get briefing by link token
POST /api/briefings/:token/chat                 -> Send message, get AI response
POST /api/briefings/:token/complete             -> End briefing, trigger evaluation
```

### Interview Slots (Auth Required)
```
POST /api/interview-slots                       -> Create single slot
POST /api/interview-slots/bulk                  -> Create multiple slots
GET  /api/interview-slots                       -> List slots (filterable by requisition)
```

### Interview Bookings
```
GET  /api/interviews                            -> List bookings
PATCH /api/interviews/:id/cancel                -> Cancel booking
PATCH /api/interviews/:id/complete              -> Mark completed
POST /api/interviews/create-link                -> Generate scheduling link
GET  /api/interviews/schedule/:token            -> Get available slots (public)
POST /api/interviews/schedule/:token/book       -> Book a slot (public)
```

### Analytics
```
GET  /api/analytics/time-to-hire                -> Monthly trend
GET  /api/analytics/consultant-comparison       -> Side-by-side metrics
GET  /api/analytics/stage-dropoff               -> Pipeline funnel
GET  /api/analytics/briefing-effectiveness      -> Briefing stats
GET  /api/analytics/role-family-breakdown       -> Per-family metrics
```

---

## 7. Frontend Pages

| Page | Route | Features |
|------|-------|----------|
| Dashboard | `/` | Active CVs count, avg fit score, aging alerts, open requisitions, pipeline funnel chart, stalled CVs table |
| Consultants | `/consultants` | Consultant list, add new, specialties, yield rankings per role |
| Requisitions | `/requisitions` | Open/filled/cancelled filter, create new requisition |
| Requisition Detail | `/requisitions/:id` | Full details, assigned consultants, CV submissions with scores, pipeline kanban, briefing status, suggest consultants |
| Analytics | `/analytics` | Time-to-hire trend chart, consultant comparison table, stage dropoff funnel, briefing effectiveness, role family breakdown |
| Briefing Chat | `/briefing/:token` | Public page, conversational AI briefing, complete button |
| Interview Booking | `/interview/:token` | Public page, available time slots, book interview |

### Frontend Components
- **Layout** — Sidebar navigation (Dashboard, Consultants, Requisitions, Analytics)
- **PipelineKanban** — Drag-free visual stage board for CV submissions
- **ConsultantRankBadge** — Visual rank indicator
- **BriefingStatus** — Briefing completion status display

---

## 8. Seed Data

### Core Seed (`seed.js`)
- 6 consultants with specialties mapped to role families
- 7 requisitions (6 open, 1 filled) across Engineering, Sales, Product, Finance, HR, Marketing
- 12 candidates sourced by different consultants
- 12 CV submissions at various pipeline stages with fit scores
- 4 interview slots (1 booked)
- 1 interview booking (confirmed)
- 6 hiring outcomes for analytics
- 1 completed briefing with sample transcript

### Historical Data Seed (`seed-historical-data.js`)
- 10 consulting firms with Indian market names
- Specialty mappings and performance profiles per consultant per role family
- 8 years of simulated hiring outcomes for yield calculations

---

## 9. Testing

### Test Suite (68 tests across 9 suites)
```
__tests__/
  controllers/
    analyticsController.test.js     — Analytics endpoint tests
    requisitionController.test.js   — Requisition CRUD + suggest tests
  integration/
    api.test.js                     — Full API integration tests
    pipeline-workflow.test.js       — End-to-end pipeline flow
  models/
    Briefing.test.js                — Briefing model tests
    CvSubmission.test.js            — CV submission model tests
    Requisition.test.js             — Requisition model tests
  services/
    triageService.test.js           — CV scoring (rule-based + LLM)
    yieldCalculator.test.js         — Yield ranking calculations
  helpers.js                        — Test utilities
  setup.js / teardown.js            — Test DB setup/teardown
```

---

## 10. Development Setup

### Quick Start
```bash
git clone <repo>
cd Testios/hiring-pipeline

# Start PostgreSQL (port 5432 or as configured)
# Create database: createdb hiring_pipeline

# Configure environment
cp backend/.env.example backend/.env
# Set DATABASE_URL and optionally ANTHROPIC_API_KEY

npm install
npm run migrate
node backend/src/migrations/seed.js

# Start dev servers
npm run dev
# Backend: http://localhost:3002
# Frontend: http://localhost:3003
```

### Environment Variables
```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hiring_pipeline
JWT_SECRET=dev-secret

# Optional (enhances CV scoring and briefings)
ANTHROPIC_API_KEY=sk-ant-...

# Defaults
PORT=3002                              # Backend port
FRONTEND_URL=http://localhost:3003     # CORS origin
```

---

## 11. Known Issues & Future Work

### Current Limitations
- Auth is simplified (dev token) — needs real OAuth/SSO for production
- CV file upload not implemented (cv_file_path column exists but unused)
- No email notifications for interview bookings
- No WebSocket for real-time briefing updates
- PostgreSQL connection error handling at startup could be improved

### Planned Enhancements
- [ ] Real authentication (OAuth 2.0 / SSO)
- [ ] CV file upload and PDF text extraction for scoring
- [ ] Email notifications (interview confirmations, briefing links)
- [ ] Real-time briefing chat via WebSocket
- [ ] Consultant dashboard (self-service portal for consultants)
- [ ] Bulk CV import from consultant submissions
- [ ] Calendar integration (Google Calendar, Outlook) for interview slots
- [ ] Mobile-responsive frontend
- [ ] Docker Compose for development environment
- [ ] CI/CD pipeline (GitHub Actions)
