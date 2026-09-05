import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { scheduleSlots } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import { isValidTime, toHHMM } from '@/lib/dates';
import type { ApiError, SlotPatchRequest, SlotPatchResponse } from '@/lib/types';

/**
 * Any parent may edit any child's slot — this is a high-trust group and the
 * product note explicitly rules out ownership restrictions on edits (s.3.2).
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json()) as SlotPatchRequest;
  const update: Partial<typeof scheduleSlots.$inferInsert> = {};

  if (body.time !== undefined) {
    if (!isValidTime(body.time)) {
      return NextResponse.json<ApiError>({ error: 'invalid_time' }, { status: 400 });
    }
    update.time = body.time;
  }

  if (body.responsibleParentId !== undefined) update.responsibleParentId = body.responsibleParentId;
  if (body.responsibilityScope !== undefined) update.responsibilityScope = body.responsibilityScope;

  // The two checkboxes are mutually exclusive and meaningless without a claimer,
  // so enforce the pairing here too — not just in the UI (FR-003).
  const nextParent =
    body.responsibleParentId !== undefined ? body.responsibleParentId : undefined;
  const nextScope = body.responsibilityScope !== undefined ? body.responsibilityScope : undefined;
  if (nextParent !== undefined || nextScope !== undefined) {
    const [current] = await db.select().from(scheduleSlots).where(eq(scheduleSlots.id, params.id));
    if (!current) return NextResponse.json<ApiError>({ error: 'not_found' }, { status: 404 });
    const resolvedParent = nextParent !== undefined ? nextParent : current.responsibleParentId;
    const resolvedScope = nextScope !== undefined ? nextScope : current.responsibilityScope;
    if ((resolvedParent === null) !== (resolvedScope === null)) {
      return NextResponse.json<ApiError>({ error: 'invalid_scope' }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json<ApiError>({ error: 'empty_patch' }, { status: 400 });
  }

  const [row] = await db
    .update(scheduleSlots)
    .set(update)
    .where(eq(scheduleSlots.id, params.id))
    .returning();

  if (!row) return NextResponse.json<ApiError>({ error: 'not_found' }, { status: 404 });

  return NextResponse.json<SlotPatchResponse>({
    slot: {
      id: row.id,
      childId: row.childId,
      type: row.type,
      time: toHHMM(row.time),
      responsibleParentId: row.responsibleParentId,
      responsibilityScope: row.responsibilityScope,
    },
  });
}
