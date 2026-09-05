import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { parents } from '@/db/schema';
import { getSession } from '@/lib/session';
import { isValidPin, verifyPin } from '@/lib/auth';
import type { ApiError, LoginRequest, LoginResponse } from '@/lib/types';

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<LoginRequest>;
  if (typeof body.parentId !== 'string' || !isValidPin(body.pin)) {
    return NextResponse.json<ApiError>({ error: 'invalid_pin' }, { status: 401 });
  }

  const [parent] = await db.select().from(parents).where(eq(parents.id, body.parentId));
  // Same response for unknown parent and wrong PIN — no need to leak which.
  if (!parent || !verifyPin(body.pin, parent.pinHash)) {
    return NextResponse.json<ApiError>({ error: 'invalid_pin' }, { status: 401 });
  }

  const session = await getSession();
  session.parentId = parent.id;
  await session.save();
  return NextResponse.json<LoginResponse>({ success: true });
}
