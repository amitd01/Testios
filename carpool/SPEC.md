# Carpool Coordinator — Technical Spec (FSD)

Companion to `carpool-coordinator-product-note.md` (the PRD — read that first for *why*; this doc is *how*).

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) | Native Vercel deploy, one repo for frontend + API routes |
| Database | Vercel Postgres (Neon) | Relational fits the schedule/responsibility model; scales past 3 users if needed |
| ORM | Drizzle | Typed, minimal, no heavy abstraction — fits "simple and elegant" |
| Auth | PIN + `iron-session` (encrypted cookie) | No user-management overhead; no separate session store needed on serverless |
| Styling | Tailwind CSS | Fast to build a clean mobile-first UI without a design system overhead |
| Hosting | Vercel | As specified |

**Not used, deliberately:** NextAuth (overkill for 3 fixed users), Redis/KV (Postgres alone is enough at this scale), a separate backend service (Next.js API routes are sufficient).

---

## 2. Database Schema (Drizzle)

```typescript
// db/schema.ts
import { pgTable, uuid, varchar, date, time, pgEnum } from 'drizzle-orm/pg-core';

export const slotType = pgEnum('slot_type', ['pickup', 'drop']);
export const responsibilityScope = pgEnum('responsibility_scope', ['all_children', 'own_child_only']);

export const parents = pgTable('parents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  pinHash: varchar('pin_hash', { length: 255 }).notNull(), // bcrypt hash, 4-digit PIN
});

export const children = pgTable('children', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id').references(() => parents.id).notNull(),
});

// Covers the default calendar + per-child overrides (FR-001, FR-002)
export const scheduleSlots = pgTable('schedule_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  childId: uuid('child_id').references(() => children.id).notNull(),
  date: date('date').notNull(),
  type: slotType('type').notNull(),
  time: time('time').notNull(), // defaults seeded as 07:00 / 15:00
  responsibleParentId: uuid('responsible_parent_id').references(() => parents.id), // null = unassigned
  responsibilityScope: responsibilityScope('responsibility_scope'),
});

export const adHocEvents = pgTable('adhoc_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  date: date('date').notNull(),
  time: time('time').notNull(),
  type: slotType('type').notNull(),
  responsibleParentId: uuid('responsible_parent_id').references(() => parents.id),
  responsibilityScope: responsibilityScope('responsibility_scope'),
  createdBy: uuid('created_by').references(() => parents.id).notNull(),
});

// Join table: an ad-hoc event can involve 1+ children (FR-005)
export const adHocEventChildren = pgTable('adhoc_event_children', {
  eventId: uuid('event_id').references(() => adHocEvents.id).notNull(),
  childId: uuid('child_id').references(() => children.id).notNull(),
});
```

**Seed data:** 3 parents + 3 children, created once via a seed script (`db/seed.ts`) — not user-facing signup, since this is a fixed 3-family group.

---

## 3. Auth Flow

1. `GET /` → list of 3 parent names (no PIN shown).
2. Parent taps her name → PIN pad (4 digits) → `POST /api/auth/login { parentId, pin }`.
3. Server compares `bcrypt.compare(pin, parent.pinHash)`. On match, `iron-session` sets an encrypted cookie containing `{ parentId }`.
4. All subsequent API routes read `parentId` from the session — no separate token management.
5. No "forgot PIN" flow needed at this scale — reset via a one-off admin script if ever needed.

---

## 4. API Routes

```
POST /api/auth/login
  Body: { parentId: string, pin: string }
  200: { success: true }
  401: { error: "invalid_pin" }

GET /api/schedule/week?start=YYYY-MM-DD
  200: { days: [{ date, slots: [{ id, childId, type, time, responsibleParentId, responsibilityScope }] }] }
  — auto-generates default slots (FR-001) for any date not yet in the DB, on first read of that week

PATCH /api/schedule/slot/:id
  Body: { time?: string, responsibleParentId?: string | null, responsibilityScope?: "all_children" | "own_child_only" | null }
  200: { slot: {...updated} }
  400: { error: "invalid_scope" }  // e.g. both checkboxes conceptually set — reject at API level too, not just UI

GET /api/today
  200: { pickup: [{ childName, time, responsibleParentName | null }], drop: [{...}] }
  — powers the "who's on duty" summary (FR-009)

POST /api/events
  Body: { title, date, time, type, childIds: string[], responsibleParentId?, responsibilityScope? }
  201: { event: {...} }

PATCH /api/events/:id   — same body shape as POST, partial
DELETE /api/events/:id  — only allowed if createdBy === session.parentId (FR-010)
```

All routes return `401` if no valid session cookie. Since all 3 parents have equal permissions, there's no per-route role check beyond "is logged in" — except `DELETE /api/events/:id`, which is restricted to the creator (matches FR-010).

---

## 5. Core Logic Notes

**Default slot generation (FR-001):** Rather than pre-seeding a year of rows, generate `scheduleSlots` for a week lazily on first `GET /api/schedule/week` request for that range, using the 07:00/15:00 default. This keeps the DB lean and avoids a cron job.

**Mismatch flag (FR-006, Phase 3 — optional for MVP):** When rendering a day, if any parent has claimed `all_children` for a slot type, check whether every child's slot at that type has the *same* time. If not, surface a warning in the UI rather than silently marking all as covered.

**Unassigned flag (FR-004):** Pure UI logic — any slot/event with `responsibleParentId IS NULL` renders with a visual flag (e.g., red border). No backend computation needed.

---

## 6. Environment & Deployment

```
DATABASE_URL=<Vercel Postgres connection string>
SESSION_SECRET=<32+ char random string, for iron-session>
```

- `drizzle-kit push` to sync schema to Neon on setup.
- Vercel project settings: connect the Postgres integration, which auto-populates `DATABASE_URL`.
- No other external services required for MVP (Phase 1 + 2 per the product note).

---

## 7. File Structure (suggested)

```
/app
  /api/auth/login/route.ts
  /api/schedule/week/route.ts
  /api/schedule/slot/[id]/route.ts
  /api/events/route.ts
  /api/events/[id]/route.ts
  /api/today/route.ts
  /(app)/page.tsx           — today view
  /(app)/week/page.tsx      — week view
  /(app)/events/new/page.tsx
  /login/page.tsx
/db
  schema.ts
  seed.ts
  client.ts
/lib
  session.ts    — iron-session config
  auth.ts        — pin hashing/verification helpers
```

---

## 8. Scope confirmation (matches product note)

Phase 1 (MVP) = sections 2–5 above, minus FR-006. Phase 2 adds ad-hoc events + today summary. Phase 3 adds the mismatch warning. This spec is written to support all three phases without rework.
