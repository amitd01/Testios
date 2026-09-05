# CLAUDE.md — Carpool Coordinator

Read this first at the start of every session. Full product context lives in `carpool-coordinator-product-note.md` (the PRD). Full technical spec lives in `SPEC.md` (the FSD). This file is conventions only — don't duplicate their content here.

## What this project is
A mobile-first Next.js web app for 3 families to coordinate school pickup/drop and weekend activity transport. 3 fixed users, PIN-based auth, Postgres backend, deployed on Vercel.

## Coding conventions
- **TypeScript strict mode.** No `any` unless genuinely unavoidable — comment why if used.
- **Comment intent, not mechanics.** Explain *why* a piece of logic exists (e.g., "lazy-generate slots to avoid a cron job") rather than restating what the code does line by line.
- **Keep it simple over clever.** This is a 3-user app — don't add abstractions (role systems, plugin architectures, generic multi-tenant scaffolding) that only pay off at scale we don't have. If a straightforward function does the job, prefer it over a configurable framework.
- **Small, typed API contracts.** Every route handler's request/response shape should be a named TypeScript type, matching SPEC.md section 4.
- **No unused dependencies.** Stack is locked in SPEC.md — Next.js, Drizzle, iron-session, Tailwind. Don't add NextAuth, Redis, or a separate backend without discussing first.

## Build order
Follow the phases in the product note (section 9) and spec (section 8):
1. Phase 1: auth, default calendar, per-child overrides, responsibility checkboxes, unassigned flagging
2. Phase 2: ad-hoc events, today's on-duty summary
3. Phase 3 (optional): mismatch warnings

Don't jump ahead to Phase 3 logic while Phase 1 is incomplete.

## Before making architecture changes
If a build decision isn't covered in SPEC.md (new dependency, schema change, different auth approach), flag it and ask rather than deciding silently — this spec was deliberately scoped tight to avoid overbuilding for a 3-user tool.

## Environment
Requires `DATABASE_URL` (Vercel Postgres) and `SESSION_SECRET` (iron-session) — see SPEC.md section 6. No other secrets needed for MVP.

---

## Build status (as of the Phase 1 + 2 implementation)

**Done:** Phase 1 and Phase 2 in full. Phase 3 (FR-006 mismatch warnings) is deliberately not built.

### Deviations from SPEC.md, and why

1. **Today view lives at `/today`, not `/(app)/page.tsx`.** The spec's structure
   would put the today view at `/`, but `/` is needed as a session-aware
   redirect (login vs. app). `/` now redirects; the three tabs are
   `/today`, `/week`, `/events`.
2. **Unique index on `schedule_slots (child_id, date, type)`.** Not in the spec's
   schema, but lazy generation races if two parents open the same week at once.
   The constraint makes the generating insert idempotent via
   `onConflictDoNothing` instead of duplicating rows.
3. **Defaults are generated Mon–Fri only.** FR-001 says "every school day," so
   weekends carry no default pickup/drop rows — weekend transport is ad-hoc
   events, which is what section 3.4 describes.
4. **"All children" fans out client-side.** `PATCH /api/schedule/slot/:id` stays
   exactly as specced (one slot per call); the week view issues one PATCH per
   child when a parent claims all children. No new endpoint was added.
5. **`GET /api/events` added** (not in spec s.4) to back the events list. Read-only,
   session-gated, same shape as the other reads.
6. **`POST /api/auth/logout` and `GET /api/parents` added.** Logout ends a session;
   `/api/parents` is the only public route, returning names (never PIN hashes)
   so the login screen can render.

### Not built (out of scope by choice)

- FR-006 mismatch warnings (Phase 3).
- Automated tests. Phase 1 + 2 was verified by exercising every route against a
  live Postgres — see README "Verification".
