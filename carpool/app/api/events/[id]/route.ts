import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adHocEventChildren, adHocEvents } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import { getEvent } from '@/lib/schedule';
import { validateEventBody } from '@/lib/events';
import type { ApiError, EventRequest, EventResponse } from '@/lib/types';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json()) as Partial<EventRequest>;
  const invalid = validateEventBody(body, true);
  if (invalid) return NextResponse.json<ApiError>(invalid, { status: 400 });

  const existing = await getEvent(params.id);
  if (!existing) return NextResponse.json<ApiError>({ error: 'not_found' }, { status: 404 });

  const update: Partial<typeof adHocEvents.$inferInsert> = {};
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.date !== undefined) update.date = body.date;
  if (body.time !== undefined) update.time = body.time;
  if (body.type !== undefined) update.type = body.type;
  if (body.responsibleParentId !== undefined) update.responsibleParentId = body.responsibleParentId;
  if (body.responsibilityScope !== undefined) update.responsibilityScope = body.responsibilityScope;

  if (Object.keys(update).length > 0) {
    await db.update(adHocEvents).set(update).where(eq(adHocEvents.id, params.id));
  }

  // Child membership is a set, so replace it wholesale rather than diffing.
  if (body.childIds !== undefined) {
    await db.delete(adHocEventChildren).where(eq(adHocEventChildren.eventId, params.id));
    await db
      .insert(adHocEventChildren)
      .values(body.childIds.map((childId) => ({ eventId: params.id, childId })));
  }

  const event = await getEvent(params.id);
  return NextResponse.json<EventResponse>({ event: event! });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const [row] = await db.select().from(adHocEvents).where(eq(adHocEvents.id, params.id));
  if (!row) return NextResponse.json<ApiError>({ error: 'not_found' }, { status: 404 });
  // Editing is open to everyone, but only the creator can delete (FR-010).
  if (row.createdBy !== parentId) {
    return NextResponse.json<ApiError>({ error: 'forbidden' }, { status: 403 });
  }

  await db.delete(adHocEventChildren).where(eq(adHocEventChildren.eventId, params.id));
  await db.delete(adHocEvents).where(eq(adHocEvents.id, params.id));
  return NextResponse.json({ success: true });
}
