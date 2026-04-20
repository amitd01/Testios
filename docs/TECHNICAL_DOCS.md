# Hiring Pipeline — Technical Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React 18 SPA                              │
│  Dashboard │ Consultants │ Requisitions │ Analytics              │
│  BriefingChat (public) │ InterviewBooking (public)               │
│                    Port 3003                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Axios (proxied)
┌──────────────────────────▼──────────────────────────────────────┐
│                    Express.js REST API                            │
│               Port 3002 (/api/*, /health)                        │
│                                                                  │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │
│  │Consultant│  │Requisition│  │    CV      │  │  Interview   │  │
│  │Controller│  │Controller │  │Controller  │  │ Controller   │  │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬───────┘  │
│       │              │              │                │           │
│  ┌────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌──────▼───────┐  │
│  │  Yield   │  │ Briefing  │  │  Triage   │  │  Analytics   │  │
│  │Calculator│  │ChatService│  │  Service  │  │  Service     │  │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬───────┘  │
│       │              │              │                │           │
│       │         ┌────▼────┐    ┌────▼────┐           │           │
│       │         │Anthropic│    │Anthropic│           │           │
│       │         │Claude AI│    │Claude AI│           │           │
│       │         │(optional│    │(optional│           │           │
│       │         └─────────┘    └─────────┘           │           │
│       │                                              │           │
│  ┌────▼──────────────────────────────────────────────▼───────┐  │
│  │                    PostgreSQL (pg Pool)                     │  │
│  │  role_families │ consultants │ requisitions │ cv_submissions│  │
│  │  candidates │ briefings │ interview_slots │ hiring_outcomes│  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
hiring-pipeline/
├── package.json                    # Workspace root
├── backend/
│   ├── package.json
│   ├── jest.config.js
│   ├── scripts/
│   │   ├── seed-historical-data.js # 8 years of hiring outcome data
│   │   └── simulate-pipeline.js    # End-to-end pipeline simulation
│   ├── src/
│   │   ├── index.js                # Express app entry point
│   │   ├── config/
│   │   │   ├── index.js            # Environment config
│   │   │   └── database.js         # PostgreSQL pool
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT authentication
│   │   ├── migrations/
│   │   │   ├── run.js              # Migration runner
│   │   │   ├── seed.js             # Core seed data
│   │   │   ├── 001_hiring_pipeline.js
│   │   │   ├── 002_interview_scheduling.js
│   │   │   └── 003_cv_triage.js
│   │   ├── models/
│   │   │   ├── Briefing.js
│   │   │   ├── Candidate.js
│   │   │   ├── Consultant.js
│   │   │   ├── CvSubmission.js
│   │   │   ├── InterviewBooking.js
│   │   │   ├── InterviewSlot.js
│   │   │   ├── Requisition.js
│   │   │   └── RoleFamily.js
│   │   ├── controllers/
│   │   │   ├── analyticsController.js
│   │   │   ├── briefingController.js
│   │   │   ├── consultantController.js
│   │   │   ├── cvController.js
│   │   │   ├── interviewController.js
│   │   │   └── requisitionController.js
│   │   ├── services/
│   │   │   ├── analyticsService.js      # Pipeline analytics queries
│   │   │   ├── briefingChatService.js   # AI-powered candidate briefing
│   │   │   ├── triageService.js         # CV scoring engine
│   │   │   └── yieldCalculator.js       # Consultant yield rankings
│   │   ├── routes/
│   │   │   └── index.js                 # All route definitions
│   │   └── utils/
│   │       └── logger.js
│   └── __tests__/
│       ├── setup.js / teardown.js
│       ├── helpers.js
│       ├── controllers/
│       ├── integration/
│       ├── models/
│       └── services/
├── frontend/
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   ├── build/                          # Production build
│   └── src/
│       ├── index.js
│       ├── App.js                      # Router setup
│       ├── index.css                   # Global styles
│       ├── components/
│       │   ├── Layout.js               # Sidebar + main content
│       │   ├── PipelineKanban.js       # Visual stage board
│       │   ├── ConsultantRankBadge.js  # Rank indicator
│       │   └── BriefingStatus.js       # Briefing progress
│       ├── pages/
│       │   ├── Dashboard.js            # Pipeline overview
│       │   ├── Consultants.js          # Consultant management
│       │   ├── Requisitions.js         # Requisition list
│       │   ├── RequisitionDetail.js    # Req detail + CV submissions
│       │   ├── Analytics.js            # Charts + metrics
│       │   ├── BriefingChat.js         # AI chat (public)
│       │   └── InterviewBooking.js     # Slot picker (public)
│       └── utils/
│           └── api.js                  # Axios instance
```

---

## Data Flow

### CV Submission Pipeline

```
Consultant submits CV
    │
    ▼
cv_submissions (status: 'submitted')
    │
    ▼ Auto-score on submit
TriageService.score()
    ├── Has ANTHROPIC_API_KEY? → LLM scoring (Claude Haiku)
    └── No API key → Rule-based scoring (keyword match)
    │
    ▼ fit_score (0-100) saved
    │
    ▼ Manual stage advancement
screened → shortlisted → sent_to_manager → interview_scheduled → hired
    │                                                            │
    └── rejected (at any stage, with reason) ◄────────────────────┘
```

### Briefing Flow

```
Admin creates briefing for CV submission
    │
    ▼
briefings (status: 'pending', link_token: UUID)
    │
    ▼ Candidate opens /briefing/:token
    │
    ▼ Chat loop
Candidate message → BriefingChatService.chat()
    │                  │
    │                  ▼ Claude Haiku with system prompt
    │                  │ (role details, expectations, comp)
    │                  ▼
    │               AI response stored in transcript JSONB
    │
    ▼ Candidate clicks "Complete"
BriefingChatService.evaluate()
    │
    ▼ Claude evaluates transcript
    │ Checks: role understanding, expectation awareness,
    │         comp comfort, genuine interest
    │
    ▼
briefings (status: 'completed', summary: evaluation)
```

### Yield Ranking Calculation

```
hiring_outcomes table
    │
    ▼ Per consultant, per role family:
    │
    ├── submit_to_interview_pct = interviewed / submitted
    ├── interview_to_offer_pct  = offered / interviewed
    ├── offer_to_accept_pct     = accepted / offered
    ├── overall_yield_pct       = accepted / submitted
    └── avg_time_to_fill        = AVG(time_to_fill_days)
    │
    ▼ Minimum 3 submissions required for ranking
    │
    ▼ Ordered by: overall_yield_pct DESC, avg_time_to_fill ASC
    │
    ▼ Top 3 suggested for new requisitions by role family
```

---

## Key Services

### TriageService (`triageService.js`)

**Rule-based scoring dimensions:**

| Dimension | Max Score | Method |
|-----------|-----------|--------|
| Role Relevance | 20 | Keyword overlap between rationale and JD across 8 role categories (200+ keywords) |
| Experience Depth | 20 | Seniority signals: "years", "senior", "lead", "director", etc. |
| Location Fit | 20 | Geography matching (Indian cities, remote/onsite) |
| Compensation Alignment | 20 | Budget signals, red flag detection |
| Culture Signals | 20 | Motivation keywords: "passionate", "autonomous", "collaborative", etc. |

**LLM scoring prompt:** Sends JD + candidate rationale to Claude Haiku, expects JSON with same 5 dimensions.

### YieldCalculator (`yieldCalculator.js`)

Queries `hiring_outcomes` table to compute conversion metrics per consultant per role family:
- `getRankingsForRoleFamily(roleFamilyId)` — Ranked list of consultants
- `getConsultantProfile(consultantId)` — All role families for one consultant
- `suggestConsultants(requisitionId)` — Top 3 based on role family match
- `recordOutcome(...)` — Record new hiring outcome

### BriefingChatService (`briefingChatService.js`)

- `buildSystemPrompt(briefing)` — Constructs role-specific system prompt
- `chat(briefingId, message)` — Sends message through Claude, stores transcript
- `evaluate(briefingId)` — Post-conversation evaluation via Claude

### AnalyticsService (`analyticsService.js`)

- `getTimeToHireTrend(months)` — Monthly avg days-to-fill
- `getConsultantComparison(limit)` — Side-by-side yield metrics
- `getStageDropoff(requisitionId)` — Pipeline funnel conversion rates
- `getBriefingEffectiveness()` — Pass rates, conversation turns, hire correlation
- `getRoleFamilyBreakdown()` — Per-family submissions and hires

---

## Authentication

Currently uses a simplified JWT dev token approach:

```javascript
// middleware/auth.js
// Extracts token from Authorization: Bearer <token>
// In dev mode, falls back to a static dev token
// Production would need real OAuth/SSO integration
```

Public endpoints (briefings, interview scheduling) use UUID tokens instead of auth:
- `briefings.link_token` — Candidate briefing access
- `interview_bookings.scheduling_token` — Interview slot booking

---

## Database Connection

```javascript
// config/index.js
module.exports = {
  port: process.env.PORT || 3002,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/hiring_pipeline',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3003',
};
```

**Note:** Default port in config is 5433 but typical PostgreSQL installations use 5432. Ensure your `.env` sets `DATABASE_URL` correctly.

---

## Migration System

Custom migration runner (`migrations/run.js`):
- Tracks applied migrations in `_migrations` table
- Scans for files matching `^\d+_.*\.js$`
- Supports `up` (default) and `down` directions
- Each migration exports `{ up, down }` functions

```bash
# Run migrations
npm run migrate

# Rollback
node backend/src/migrations/run.js down
```

---

## Test Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  globalSetup: './__tests__/setup.js',
  globalTeardown: './__tests__/teardown.js',
  testMatch: ['**/__tests__/**/*.test.js'],
};
```

Tests use a separate test database configured via `TEST_DATABASE_URL` or the default `DATABASE_URL` with `_test` suffix.

---

## Error Handling

- Global Express error handler catches unhandled errors and returns 500
- Individual controllers wrap operations in try/catch with appropriate status codes
- LLM failures fall back gracefully (rule-based scoring, default-pass briefings)
- Database errors logged via custom logger

---

## Performance Considerations

- PostgreSQL connection pooling via `pg.Pool`
- Fit scores cached in `cv_submissions.fit_score` column (not recalculated on every read)
- Yield rankings computed from aggregated `hiring_outcomes` (not real-time across all tables)
- Frontend uses `Promise.all` for parallel API calls on Dashboard
