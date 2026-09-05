import { NextResponse } from 'next/server';
import { getSessionParentId } from '@/lib/session';
import { buildToday } from '@/lib/today';
import type { ApiError, TodayResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Powers the "who's on duty today" summary shown on opening the app (FR-009). */
export async function GET() {
  const parentId = await getSessionParentId();
  if (!parentId) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json<TodayResponse>(await buildToday());
}
