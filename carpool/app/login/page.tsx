import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { parents } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionParentId()) redirect('/today');
  const rows = await db.select({ id: parents.id, name: parents.name }).from(parents);
  return <LoginForm parents={rows} />;
}
