import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { parents } from '@/db/schema';
import type { Parent } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Public: the login screen needs the 3 names to pick from. No PINs exposed. */
export async function GET() {
  const rows = await db.select({ id: parents.id, name: parents.name }).from(parents);
  return NextResponse.json<{ parents: Parent[] }>({ parents: rows });
}
