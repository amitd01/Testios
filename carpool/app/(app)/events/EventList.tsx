'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dayLabel } from '@/lib/dates';
import type { AdHocEvent, Child, Parent } from '@/lib/types';

/**
 * All ad-hoc events, newest date first. Everyone sees everything (one shared
 * calendar, FR-007); only the creator gets a Delete button (FR-010).
 */
export default function EventList({
  events,
  parents,
  children,
  sessionParentId,
}: {
  events: AdHocEvent[];
  parents: Parent[];
  children: Child[];
  sessionParentId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const parentName = (id: string | null) => parents.find((p) => p.id === id)?.name ?? null;
  const childName = (id: string) => children.find((c) => c.id === id)?.name ?? 'Unknown';
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  async function remove(id: string) {
    if (!confirm('Delete this event?')) return;
    setBusyId(id);
    await fetch(`/api/events/${id}`, { method: 'DELETE' });
    setBusyId(null);
    router.refresh();
  }

  return (
    <main className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link href="/events/new" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
          Add event
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400">No ad-hoc events yet.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((e) => (
            <li key={e.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex justify-between">
                <span className="font-medium">{e.title}</span>
                <span className="text-sm text-slate-600">
                  {dayLabel(e.date)} · {e.time}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {e.type} · {e.childIds.map(childName).join(', ')} ·{' '}
                {parentName(e.responsibleParentId) ?? (
                  <span className="font-medium text-red-600">Unassigned</span>
                )}
              </p>
              <div className="mt-2 flex gap-3 text-sm">
                <Link href={`/events/new?id=${e.id}`} className="text-blue-600">
                  Edit
                </Link>
                {e.createdBy === sessionParentId && (
                  <button
                    onClick={() => remove(e.id)}
                    disabled={busyId === e.id}
                    className="text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
