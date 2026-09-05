import { db } from '@/db/client';
import { children, parents } from '@/db/schema';
import { ensureSlotsForRange, getEvents, getSlots } from './schedule';
import { today } from './dates';
import type { DutyLine, TodayResponse } from './types';

/**
 * Builds the "who's on duty today" summary (FR-009). Shared by the API route
 * and the Today page so the page can render straight from the DB instead of
 * HTTP-fetching its own endpoint.
 */
export async function buildToday(): Promise<TodayResponse> {
  const date = today();
  await ensureSlotsForRange(date, date);

  const [slots, events, parentRows, childRows] = await Promise.all([
    getSlots(date, date),
    getEvents(date, date),
    db.select({ id: parents.id, name: parents.name }).from(parents),
    db.select({ id: children.id, name: children.name }).from(children),
  ]);

  const parentName = (id: string | null) => parentRows.find((p) => p.id === id)?.name ?? null;
  const childName = (id: string) => childRows.find((c) => c.id === id)?.name ?? 'Unknown';

  const lines = (type: 'pickup' | 'drop'): DutyLine[] =>
    slots
      .filter((s) => s.type === type)
      .map((s) => ({
        childName: childName(s.childId),
        time: s.time,
        responsibleParentName: parentName(s.responsibleParentId),
        scope: s.responsibilityScope,
      }))
      .sort((a, b) => a.time.localeCompare(b.time) || a.childName.localeCompare(b.childName));

  return {
    date,
    pickup: lines('pickup'),
    drop: lines('drop'),
    events: events.map((e) => ({
      ...e,
      childNames: e.childIds.map(childName),
      responsibleParentName: parentName(e.responsibleParentId),
    })),
  };
}
