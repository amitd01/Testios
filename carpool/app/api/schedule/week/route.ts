import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { children, parents } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import { ensureSlotsForRange, getEvents, getSlots } from '@/lib/schedule';
import { isValidDateString, startOfWeek, today, weekDates } from '@/lib/dates';
import type { ApiError, WeekResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const param = new URL(request.url).searchParams.get('start');
  // Snap to Monday so a mid-week `start` still returns a whole aligned week.
  const start = startOfWeek(isValidDateString(param) ? param : today());
  const dates = weekDates(start);
  const end = dates[dates.length - 1];

  await ensureSlotsForRange(start, end);

  const [slots, events, parentRows, childRows] = await Promise.all([
    getSlots(start, end),
    getEvents(start, end),
    db.select({ id: parents.id, name: parents.name }).from(parents),
    db.select({ id: children.id, name: children.name, parentId: children.parentId }).from(children),
  ]);

  return NextResponse.json<WeekResponse>({
    days: dates.map((date) => ({
      date,
      slots: slots.filter((s) => s.date === date).map(({ date: _d, ...slot }) => slot),
      events: events.filter((e) => e.date === date),
    })),
    parents: parentRows,
    children: childRows,
    sessionParentId: parentId,
  });
}
