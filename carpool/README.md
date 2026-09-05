# Carpool Coordinator

A mobile-first web app for three families sharing school pickup/drop and weekend
activity transport. Three fixed users, PIN login, one shared calendar.

Product context: [`carpool-coordinator-product-note.md`](./carpool-coordinator-product-note.md) (the *why*).
Technical spec: [`SPEC.md`](./SPEC.md) (the *how*).
Conventions and build status: [`CLAUDE.md`](./CLAUDE.md).

## What's built

Phase 1 and Phase 2 of the product note, in full:

| | |
|---|---|
| FR-001 | Default calendar — pickup 07:00, drop 15:00, every child, every school day |
| FR-002 | Per-child, per-day time overrides that don't touch the other children |
| FR-003 | Two mutually exclusive responsibility checkboxes per pickup/drop |
| FR-004 | Unassigned slots flagged in red |
| FR-005 | Ad-hoc events with title, date, time, type, and 1–3 children |
| FR-007 | One shared week view, plus per-day detail |
| FR-008 | PIN identification |
| FR-009 | "Who's on duty today" summary on open |
| FR-010 | Any parent edits an event; only its creator deletes it |

FR-006 (mismatch warnings) is Phase 3 and is intentionally not built.

## Running it locally

Requires Node 20+ and a Postgres database.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and SESSION_SECRET
npm run db:push               # sync the Drizzle schema
npm run db:seed               # create the 3 parents + 3 children
npm run dev                   # http://localhost:3000
```

The seed creates **Mom A / Child A (PIN 1111)**, **Mom B / Child B (2222)** and
**Mom C / Child C (3333)**. Change the PINs in `db/seed.ts` before real use — or
re-hash them directly in the database.

`SESSION_SECRET` must be 32+ characters: `openssl rand -base64 32`.

## Deploying to Vercel

1. Import the repo into Vercel.
2. Add the Postgres integration — it populates `DATABASE_URL` automatically.
3. Set `SESSION_SECRET` in the project's environment variables.
4. Run `npm run db:push` and `npm run db:seed` once against the production
   database (locally, with the production `DATABASE_URL` exported).

## How it fits together

```
app/
  page.tsx                    redirects to /today or /login
  login/                      name picker → 4-digit PIN pad
  (app)/today/                who's on duty today
  (app)/week/                 7-day grid: times + responsibility claiming
  (app)/events/               ad-hoc event list, create, edit, delete
  api/                        route handlers, one per SPEC.md section 4
db/       schema.ts, client.ts, seed.ts
lib/      session, auth, dates, schedule, today, events, types
```

**Slots are generated lazily.** Rather than pre-seeding a year of rows or
running a cron job, `GET /api/schedule/week` materialises that week's default
07:00/15:00 slots the first time anyone looks at it. A unique index on
`(child_id, date, type)` makes that insert idempotent, so re-reading a week
never duplicates rows or overwrites an edit.

**Dates are plain `YYYY-MM-DD` strings.** All three families share one timezone,
so a calendar date is unambiguous and string handling avoids UTC-shift bugs.

**Responsibility is stored per slot.** Checking "all children" writes the claim
to every child's slot for that day and type; "my child only" writes to one. The
API stays a simple per-slot PATCH — the fan-out is a UI concern.

## Verification

Every route was exercised against a live Postgres instance:

- Unauthenticated requests to app routes and APIs return 401 / redirect to login
- Wrong PIN → 401; correct PIN → session cookie
- A fresh week generates 6 slots per weekday (3 children × pickup + drop), 0 on weekends
- Time overrides and responsibility claims survive re-reading the week — no duplicate rows
- `invalid_time`, `invalid_scope`, `missing_fields`, `invalid_children` all reject with 400
- Event create → patch (retitle, change children) → delete round-trips
- A parent deleting another parent's event gets 403 (FR-010)
- `next build` and `tsc --noEmit` pass clean

There is no automated test suite yet — that's the obvious next addition.
