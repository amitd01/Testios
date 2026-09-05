'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/today', label: 'Today' },
  { href: '/week', label: 'Week' },
  { href: '/events', label: 'Events' },
];

/** Fixed bottom bar — thumb-reachable on a phone. */
export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl border-t border-slate-200 bg-white">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex-1 py-4 text-center text-sm font-medium ${
            pathname.startsWith(tab.href) ? 'text-slate-900' : 'text-slate-400'
          }`}
        >
          {tab.label}
        </Link>
      ))}
      <button onClick={logout} className="flex-1 py-4 text-center text-sm font-medium text-slate-400">
        Exit
      </button>
    </nav>
  );
}
