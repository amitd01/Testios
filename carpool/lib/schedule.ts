import { and, gte, lte, inArray, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { scheduleSlots, children, adHocEvents, adHocEventChildren } from '@/db/schema';
import { isSchoolDay, toHHMM } from './dates';
import type { AdHocEvent, Slot, SlotType } from './types';

export const DEFAULT_TIMES: Record<SlotType, string> = { pickup: '07:00', drop: '15:00' };

/**
 * Materialise the default 07:00/15:00 slots for a date range on first read
 * (FR-001). Generating lazily rather than pre-seeding a year of rows keeps the
 * table small and avoids needing a cron job on Vercel — the trade-off is that a
 * week only exists once someone has looked at it, which is exactly when it matters.
 */
export async function ensureSlotsForRange(from: string, to: string): Promise<void> {
  const kids = await db.select({ id: children.id }).from(children);
  if (kids.length === 0) return;

  const dates: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) if (isSchoolDay(d)) dates.push(d);
  if (dates.length === 0) return;

  const rows = dates.flatMap((date) =>
    kids.flatMap(({ id }) =>
      (['pickup', 'drop'] as const).map((type) => ({
        childId: id,
        date,
        type,
        time: DEFAULT_TIMES[type],
      })),
    ),
  );

  // onConflictDoNothing means already-generated (and since-edited) slots are
  // never clobbered — this is safe to call on every week read.
  await db.insert(scheduleSlots).values(rows).onConflictDoNothing();
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getSlots(from: string, to: string): Promise<(Slot & { date: string })[]> {
  const rows = await db
    .select()
    .from(scheduleSlots)
    .where(and(gte(scheduleSlots.date, from), lte(scheduleSlots.date, to)));

  return rows.map((r) => ({
    id: r.id,
    childId: r.childId,
    date: r.date,
    type: r.type,
    time: toHHMM(r.time),
    responsibleParentId: r.responsibleParentId,
    responsibilityScope: r.responsibilityScope,
  }));
}

/** Ad-hoc events in a range, with their child lists folded in (FR-005). */
export async function getEvents(from: string, to: string): Promise<AdHocEvent[]> {
  const rows = await db
    .select()
    .from(adHocEvents)
    .where(and(gte(adHocEvents.date, from), lte(adHocEvents.date, to)));
  if (rows.length === 0) return [];

  const links = await db
    .select()
    .from(adHocEventChildren)
    .where(inArray(adHocEventChildren.eventId, rows.map((r) => r.id)));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    time: toHHMM(r.time),
    type: r.type,
    childIds: links.filter((l) => l.eventId === r.id).map((l) => l.childId),
    responsibleParentId: r.responsibleParentId,
    responsibilityScope: r.responsibilityScope,
    createdBy: r.createdBy,
  }));
}

export async function getEvent(id: string): Promise<AdHocEvent | null> {
  const [row] = await db.select().from(adHocEvents).where(eq(adHocEvents.id, id));
  if (!row) return null;
  const links = await db
    .select()
    .from(adHocEventChildren)
    .where(eq(adHocEventChildren.eventId, id));
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: toHHMM(row.time),
    type: row.type,
    childIds: links.map((l) => l.childId),
    responsibleParentId: row.responsibleParentId,
    responsibilityScope: row.responsibilityScope,
    createdBy: row.createdBy,
  };
}
