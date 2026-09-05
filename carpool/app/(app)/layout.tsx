import { redirect } from 'next/navigation';
import { getSessionParentId } from '@/lib/session';
import Nav from '@/components/Nav';

export const dynamic = 'force-dynamic';

/** Every page in this group requires a session; the API routes re-check independently. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSessionParentId())) redirect('/login');
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <div className="flex-1 pb-20">{children}</div>
      <Nav />
    </div>
  );
}
