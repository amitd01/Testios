import { redirect } from 'next/navigation';
import { getSessionParentId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Root() {
  redirect((await getSessionParentId()) ? '/today' : '/login');
}
