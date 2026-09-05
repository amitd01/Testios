'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ResponsibilityPicker from '@/components/ResponsibilityPicker';
import { today } from '@/lib/dates';
import type { AdHocEvent, Child, Parent, ResponsibilityScope, SlotType } from '@/lib/types';

export default function EventForm({
  parents,
  children,
  sessionParentId,
  existing,
}: {
  parents: Parent[];
  children: Child[];
  sessionParentId: string;
  existing: AdHocEvent | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? today());
  const [time, setTime] = useState(existing?.time ?? '09:00');
  const [type, setType] = useState<SlotType>(existing?.type ?? 'pickup');
  const [childIds, setChildIds] = useState<string[]>(existing?.childIds ?? []);
  const [claimer, setClaimer] = useState<string | null>(existing?.responsibleParentId ?? null);
  const [scope, setScope] = useState<ResponsibilityScope | null>(existing?.responsibilityScope ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myChildId = children.find((c) => c.parentId === sessionParentId)?.id ?? null;

  function setResponsibility(next: ResponsibilityScope | null) {
    setScope(next);
    setClaimer(next === null ? null : sessionParentId);
    // "My child only" is only coherent if this parent's child is on the event.
    if (next === 'own_child_only' && myChildId && !childIds.includes(myChildId)) {
      setChildIds([...childIds, myChildId]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (childIds.length === 0) {
      setError('Pick at least one child.');
      return;
    }
    setBusy(true);
    setError(null);

    const res = await fetch(existing ? `/api/events/${existing.id}` : '/api/events', {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        date,
        time,
        type,
        childIds,
        responsibleParentId: claimer,
        responsibilityScope: scope,
      }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? 'Something went wrong');
      setBusy(false);
      return;
    }
    router.push('/events');
    router.refresh();
  }

  return (
    <main className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">{existing ? 'Edit event' : 'New event'}</h1>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Saturday football practice"
            className="w-full rounded-lg border border-slate-200 p-2"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 p-2"
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 p-2"
            />
          </Field>
        </div>

        <Field label="Type">
          <div className="flex gap-2">
            {(['pickup', 'drop'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg border p-2 text-sm capitalize ${
                  type === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Children">
          <div className="space-y-1">
            {children.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={childIds.includes(c.id)}
                  onChange={(e) =>
                    setChildIds(
                      e.target.checked ? [...childIds, c.id] : childIds.filter((id) => id !== c.id),
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                {c.name}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Who's covering it?">
          <ResponsibilityPicker
            scope={scope}
            claimedByMe={claimer === null || claimer === sessionParentId}
            claimedByName={
              claimer && claimer !== sessionParentId
                ? (parents.find((p) => p.id === claimer)?.name ?? null)
                : null
            }
            onChange={setResponsibility}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create event'}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
