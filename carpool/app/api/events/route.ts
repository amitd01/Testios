import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { adHocEventChildren, adHocEvents } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import { getEvents } from '@/lib/schedule';
import { validateEventBody } from '@/lib/events';
import type { ApiError, EventRequest, EventResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Optional ?from/?to range; defaults to everything, which is fine at 3 families. */
export async function GET(request: Request) {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const events = await getEvents(params.get('from') ?? '0001-01-01', params.get('to') ?? '9999-12-31');
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json()) as EventRequest;
  const invalid = validateEventBody(body, false);
  if (invalid) return NextResponse.json<ApiError>(invalid, { status: 400 });

  const [row] = await db
    .insert(adHocEvents)
    .values({
      title: body.title.trim(),
      date: body.date,
      time: body.time,
      type: body.type,
      responsibleParentId: body.responsibleParentId ?? null,
      responsibilityScope: body.responsibilityScope ?? null,
      createdBy: parentId,
    })
    .returning();

  await db
    .insert(adHocEventChildren)
    .values(body.childIds.map((childId) => ({ eventId: row.id, childId })));

  return NextResponse.json<EventResponse>(
    {
      event: {
        id: row.id,
        title: row.title,
        date: row.date,
        time: row.time.slice(0, 5),
        type: row.type,
        childIds: body.childIds,
        responsibleParentId: row.responsibleParentId,
        responsibilityScope: row.responsibilityScope,
        createdBy: row.createdBy,
      },
    },
    { status: 201 },
  );
}
