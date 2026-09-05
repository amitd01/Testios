# Carpool Coordinator — Product Note

**For:** 3 mothers coordinating school pickup/drop and weekend activity transport
**Access:** Mobile-friendly web app, no install, PIN-based identification
**Status:** Draft for review before build

---

## 1. Problem Statement

Three families share pickup/drop duty for their kids at the same school. The default arrangement is simple (one parent covers everyone on a given day), but real life isn't:
- Extra classes shift one child's start/end time on an otherwise "normal" day.
- Weekend activities need coverage too, but they aren't on a recurring schedule — they're one-off events.
- Responsibility isn't always "all 3 kids" — sometimes a parent only handles their own child that day (e.g., piano class only one kid attends).

There's currently no single place to see who's doing what, for which child, on which day — leading to double-booking, missed pickups, or last-minute WhatsApp scrambles.

---

## 2. Users

| Parent | Child | Role in app |
|---|---|---|
| Mom A | Child A | Can edit her own child's schedule + claim responsibility |
| Mom B | Child B | Same |
| Mom C | Child C | Same |

All 3 have equal permissions — no admin/owner hierarchy. This is a high-trust group, so any parent can view the full shared calendar and edit **any child's** timing (not just her own) — and any parent sets **who is responsible** for pick/drop (herself, for one or all kids).

---

## 3. Core Concepts

### 3.1 Default weekly calendar
- Runs Monday–Sunday (weekends included, since activities happen then too).
- Default template: Pickup 7:00 AM, Drop 3:00 PM, applied to every school day, every child.
- This default is a *starting point* — each week's calendar is generated from it, then adjusted.

### 3.2 Per-child time overrides
- Any parent can adjust **any child's** pickup or drop time on any given day (e.g., Child A's pickup moves to 6:00 AM on Tuesday for an extra class) — high-trust group, no ownership restriction on edits.
- Overrides are per-child, per-day, per-event-type (pickup or drop) — they don't affect the other two children automatically.

### 3.3 Responsibility model
- For every pickup and every drop, there are **two checkboxes**:
  - ☐ "I'll do this for all children"
  - ☐ "I'll do this for my child only"
- Only one can be checked at a time (mutually exclusive) per pickup/drop slot.
- If neither is checked, that slot is **unassigned** — visible as a gap that needs to be claimed.
- Whoever checks "all children" is on duty for every child's pickup or drop at that specific time (assuming times match — see FR-006 for the mismatch case).

### 3.4 Ad-hoc events
- Any parent can add a one-off event to the shared calendar (e.g., "Saturday football practice, 9 AM–11 AM").
- Event creation includes: title, date, time, and which child/children it applies to (multi-select, can be 1, 2, or all 3).
- Same responsibility checkboxes (all children in this event / my child only) apply.
- Ad-hoc events sit alongside the recurring calendar but are visually distinct (e.g., a different color/tag) so they don't get confused with the weekday default.

---

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | The system shall generate a default weekly calendar with pickup at 7:00 AM and drop at 3:00 PM for every child, every school day. |
| FR-002 | A parent shall be able to override any child's pickup or drop time for any specific day without affecting other children's default times. |
| FR-003 | Each pickup/drop slot shall have two mutually exclusive checkboxes: "all children" and "my child only." |
| FR-004 | A slot with neither checkbox selected shall be visually flagged as unassigned. |
| FR-005 | Any parent shall be able to create an ad-hoc event with a title, date, time, and one or more children attached. |
| FR-006 | If a parent checks "all children" for a slot, but another child has an overridden time that doesn't match, the system shall flag the mismatch rather than silently assuming coverage (e.g., "Mom A is covering pickup at 7 AM, but Child B's pickup is set for 6 AM — not covered"). |
| FR-007 | All 3 parents shall see one shared, synced calendar view (week view, with a day-detail view). |
| FR-008 | The system shall identify the logged-in parent via a PIN (no email/password). |
| FR-009 | The system shall show an in-app reminder/summary of "who's on duty today" for pickup and drop, visible on opening the app. |
| FR-010 | A parent shall be able to edit or delete an ad-hoc event she created. |

---

## 5. Data Model (simplified)

**Parent**
| Field | Type | Notes |
|---|---|---|
| id | string | |
| name | string | |
| pin | string | 4-digit, hashed |

**Child**
| Field | Type | Notes |
|---|---|---|
| id | string | |
| name | string | |
| parent_id | string | FK → Parent |

**ScheduleSlot** (covers both default and overridden weekday pickups/drops)
| Field | Type | Notes |
|---|---|---|
| id | string | |
| child_id | string | FK → Child |
| date | date | |
| type | enum | "pickup" \| "drop" |
| time | time | defaults to 7:00 AM / 3:00 PM, editable |
| responsible_parent_id | string \| null | FK → Parent, null = unassigned |
| responsibility_scope | enum \| null | "all_children" \| "own_child_only" \| null |

**AdHocEvent**
| Field | Type | Notes |
|---|---|---|
| id | string | |
| title | string | |
| date | date | |
| time | time | |
| type | enum | "pickup" \| "drop" |
| child_ids | array | one or more children |
| responsible_parent_id | string \| null | |
| responsibility_scope | enum \| null | "all_children" \| "own_child_only" \| null |
| created_by | string | FK → Parent |

---

## 6. Screens

1. **PIN entry** — pick your name, enter 4-digit PIN.
2. **Today view** — "Who's on duty" summary for today's pickup and drop (FR-009).
3. **Week view** — 7-day grid, each day shows pickup/drop rows per child, with responsibility checkboxes and any unassigned flags.
4. **Day detail** — tap a day to adjust times and responsibility for that day.
5. **Add ad-hoc event** — form: title, date, time, type, children, responsibility.
6. **My events** — list of ad-hoc events the logged-in parent created, with edit/delete.

---

## 7. Non-Functional Notes (kept light — 3 users, low traffic)

- Real-time sync isn't critical; a refresh-on-load or simple polling is enough at this scale.
- No need for role-based access control — all 3 parents have identical permissions.
- PIN storage should still be hashed, not plaintext, even for a small private app.
- Mobile-first layout (most checking will happen from a phone, one-handed, likely in a hurry).

---

## 8. Out of Scope (v1)

- Push notifications / SMS / WhatsApp integration (explicitly deferred per your answer — in-app reminder only for now).
- More than 3 families / children.
- Swap requests or trade negotiation between parents (v1 is direct claim/unclaim only).
- Payment or expense splitting for shared trips.

---

## 9. Suggested Build Phases

| Phase | Scope |
|---|---|
| Phase 1 (MVP) | PIN login, default weekly calendar, per-child time overrides, responsibility checkboxes, unassigned-slot flagging |
| Phase 2 | Ad-hoc events (create/edit/delete), today's "on duty" summary |
| Phase 3 (optional) | Mismatch warnings (FR-006), light polish, edit history |

---

## 10. Open Questions

- **OQ-001:** Should a parent be able to claim "all children" responsibility on behalf of a slot even if she isn't the default parent for that day — i.e., is claiming always open to any of the 3, first-come? *(Assumed yes, per your description — confirm.)*
- **OQ-002:** When an unassigned slot exists, should the app just flag it, or also nudge (e.g., highlight it red) until claimed? *(Assumed: visual flag only, no automation, given no notifications requested.)*
- **OQ-003:** Timezone — assuming all 3 families are in the same city/timezone; confirm before build.

---

*Next step: once you confirm this note (or edit it), I can turn it into a build-ready spec (functional spec with UI wireframe + tech stack) or go straight to building the app as a working prototype.*
