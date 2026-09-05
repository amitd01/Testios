import Link from 'next/link';
import type { TodayResponse } from '@/lib/types';
import { dayLabel } from '@/lib/dates';
import { buildToday } from '@/lib/today';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const data = await buildToday();

  return (
    <main className="p-4">
      <h1 className="text-2xl font-semibold">Today</h1>
      <p className="mb-5 text-sm text-slate-500">{dayLabel(data.date)}</p>

      <Duty title="Pickup" lines={data.pickup} />
      <Duty title="Drop" lines={data.drop} />

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Events</h2>
          <Link href="/events/new" className="text-sm text-blue-600">
            Add
          </Link>
        </div>
        {data.events.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing else on today.</p>
        ) : (
          <ul className="space-y-2">
            {data.events.map((e) => (
              <li key={e.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex justify-between">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-sm text-slate-600">{e.time}</span>
                </div>
                <p className="text-sm text-slate-600">
                  {e.childNames.join(', ')} ·{' '}
                  {e.responsibleParentName ?? <span className="font-medium text-red-600">Unassigned</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Duty({ title, lines }: { title: string; lines: TodayResponse['pickup'] }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-400">No {title.toLowerCase()} scheduled — not a school day.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {lines.map((line) => (
            <li key={`${line.childName}-${line.time}`} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium">{line.childName}</p>
                <p className="text-sm text-slate-500">{line.time}</p>
              </div>
              {line.responsibleParentName ? (
                <span className="text-sm">
                  {line.responsibleParentName}
                  {line.scope === 'own_child_only' && (
                    <span className="text-slate-400"> (own child)</span>
                  )}
                </span>
              ) : (
                <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                  Unassigned
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
