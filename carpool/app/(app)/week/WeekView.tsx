'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ResponsibilityPicker from '@/components/ResponsibilityPicker';
import { addDays, dayLabel, startOfWeek, today } from '@/lib/dates';
import type { Day, ResponsibilityScope, Slot, SlotType, WeekResponse } from '@/lib/types';

export default function WeekView({ initialStart }: { initialStart?: string }) {
  const [start, setStart] = useState(() => startOfWeek(initialStart ?? today()));
  const [data, setData] = useState<WeekResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (weekStart: string) => {
    const res = await fetch(`/api/schedule/week?start=${weekStart}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load(start);
  }, [start, load]);

  // Refetch after every write rather than patching local state — at 3 users a
  // round-trip is cheap and it keeps the shared calendar honest (FR-007).
  async function patchSlots(patches: { id: string; body: Record<string, unknown> }[]) {
    setSaving(true);
    await Promise.all(
      patches.map((p) =>
        fetch(`/api/schedule/slot/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p.body),
        }),
      ),
    );
    await load(start);
    setSaving(false);
  }

  if (!data) {
    return <main className="p-4 text-slate-400">Loading…</main>;
  }

  const myChildId = data.children.find((c) => c.parentId === data.sessionParentId)?.id ?? null;
  const parentName = (id: string | null) => data.parents.find((p) => p.id === id)?.name ?? null;
  const childName = (id: string) => data.children.find((c) => c.id === id)?.name ?? 'Unknown';

  /**
   * "All children" fans out across every child's slot for that day+type; "my
   * child only" touches just the claimer's own child. The API stays a simple
   * per-slot PATCH (SPEC.md s.4) — the fan-out is a UI concern.
   */
  function claim(slots: Slot[], next: ResponsibilityScope | null) {
    const me = data!.sessionParentId;
    if (next === 'all_children') {
      return patchSlots(
        slots.map((s) => ({
          id: s.id,
          body: { responsibleParentId: me, responsibilityScope: 'all_children' },
        })),
      );
    }
    if (next === 'own_child_only') {
      const mine = slots.filter((s) => s.childId === myChildId);
      // Leave the other children's slots untouched so they stay visibly unassigned.
      const others = slots.filter((s) => s.childId !== myChildId && s.responsibleParentId === me);
      return patchSlots([
        ...mine.map((s) => ({
          id: s.id,
          body: { responsibleParentId: me, responsibilityScope: 'own_child_only' },
        })),
        ...others.map((s) => ({ id: s.id, body: { responsibleParentId: null, responsibilityScope: null } })),
      ]);
    }
    // Unclaim: only release what this parent is holding.
    const held = slots.filter((s) => s.responsibleParentId !== null);
    return patchSlots(
      held.map((s) => ({ id: s.id, body: { responsibleParentId: null, responsibilityScope: null } })),
    );
  }

  return (
    <main className="p-4">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={() => setStart(addDays(start, -7))} className="px-2 py-1 text-slate-500">
          ←
        </button>
        <h1 className="text-lg font-semibold">
          {dayLabel(start)} – {dayLabel(addDays(start, 6))}
        </h1>
        <button onClick={() => setStart(addDays(start, 7))} className="px-2 py-1 text-slate-500">
          →
        </button>
      </header>

      {saving && <p className="mb-2 text-xs text-slate-400">Saving…</p>}

      <div className="space-y-4">
        {data.days.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            isToday={day.date === today()}
            sessionParentId={data.sessionParentId}
            myChildId={myChildId}
            parentName={parentName}
            childName={childName}
            saving={saving}
            onTimeChange={(id, time) => patchSlots([{ id, body: { time } }])}
            onClaim={claim}
          />
        ))}
      </div>
    </main>
  );
}

function DayCard({
  day,
  isToday,
  sessionParentId,
  myChildId,
  parentName,
  childName,
  saving,
  onTimeChange,
  onClaim,
}: {
  day: Day;
  isToday: boolean;
  sessionParentId: string;
  myChildId: string | null;
  parentName: (id: string | null) => string | null;
  childName: (id: string) => string;
  saving: boolean;
  onTimeChange: (id: string, time: string) => void;
  onClaim: (slots: Slot[], next: ResponsibilityScope | null) => void;
}) {
  const types: SlotType[] = ['pickup', 'drop'];

  return (
    <section className={`rounded-xl border bg-white p-3 ${isToday ? 'border-blue-400' : 'border-slate-200'}`}>
      <h2 className="mb-2 font-semibold">
        {dayLabel(day.date)}
        {isToday && <span className="ml-2 text-xs font-normal text-blue-600">today</span>}
      </h2>

      {day.slots.length === 0 && day.events.length === 0 && (
        <p className="text-sm text-slate-400">Nothing scheduled.</p>
      )}

      {types.map((type) => {
        const slots = day.slots.filter((s) => s.type === type);
        if (slots.length === 0) return null;

        // The group picker only speaks for this parent; another parent holding
        // every slot is surfaced as a name instead of editable checkboxes.
        const allSameOther =
          slots.every(
            (s) =>
              s.responsibleParentId &&
              s.responsibilityScope === 'all_children' &&
              s.responsibleParentId === slots[0].responsibleParentId,
          ) && slots[0].responsibleParentId !== sessionParentId;

        const myScope: ResponsibilityScope | null = slots.every(
          (s) => s.responsibleParentId === sessionParentId && s.responsibilityScope === 'all_children',
        )
          ? 'all_children'
          : slots.some(
                (s) =>
                  s.childId === myChildId &&
                  s.responsibleParentId === sessionParentId &&
                  s.responsibilityScope === 'own_child_only',
              )
            ? 'own_child_only'
            : null;

        return (
          <div key={type} className="mb-3 last:mb-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{type}</p>
            <ul className="mb-2 space-y-1">
              {slots.map((slot) => (
                <li
                  key={slot.id}
                  className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${
                    slot.responsibleParentId
                      ? 'border-slate-100'
                      : 'border-red-300 bg-red-50' /* unassigned flag (FR-004) */
                  }`}
                >
                  <span className="text-sm">{childName(slot.childId)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {parentName(slot.responsibleParentId) ?? 'Unassigned'}
                    </span>
                    <input
                      type="time"
                      value={slot.time}
                      disabled={saving}
                      onChange={(e) => onTimeChange(slot.id, e.target.value)}
                      className="rounded border border-slate-200 px-1 py-0.5 text-sm"
                      aria-label={`${childName(slot.childId)} ${type} time`}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <ResponsibilityPicker
              scope={allSameOther ? 'all_children' : myScope}
              claimedByMe={!allSameOther}
              claimedByName={allSameOther ? parentName(slots[0].responsibleParentId) : null}
              disabled={saving}
              onChange={(next) => onClaim(slots, next)}
            />
          </div>
        );
      })}

      {day.events.length > 0 && (
        <ul className="mt-3 space-y-1">
          {day.events.map((e) => (
            <li key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm">
              <Link href={`/events?highlight=${e.id}`} className="flex justify-between">
                <span className="font-medium">{e.title}</span>
                <span className="text-slate-600">{e.time}</span>
              </Link>
              <p className="text-xs text-slate-600">
                {e.childIds.map(childName).join(', ')} ·{' '}
                {parentName(e.responsibleParentId) ?? <span className="font-medium text-red-600">Unassigned</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
