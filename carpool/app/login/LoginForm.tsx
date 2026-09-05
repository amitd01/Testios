'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Parent } from '@/lib/types';

/** Two steps: pick your name, then tap a 4-digit PIN (FR-008). */
export default function LoginForm({ parents }: { parents: Parent[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Parent | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(fullPin: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: selected.id, pin: fullPin }),
    });
    if (res.ok) {
      router.replace('/today');
      router.refresh();
      return;
    }
    setBusy(false);
    setPin('');
    setError('Wrong PIN — try again');
  }

  function press(digit: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  if (!selected) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6">
        <h1 className="mb-2 text-2xl font-semibold">Who&apos;s this?</h1>
        {parents.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left text-lg font-medium shadow-sm active:bg-slate-100"
          >
            {p.name}
          </button>
        ))}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <button onClick={() => { setSelected(null); setPin(''); setError(null); }} className="text-sm text-slate-500">
          ← Not {selected.name}?
        </button>
        <h1 className="mt-2 text-2xl font-semibold">Enter PIN</h1>
      </div>

      <div className="flex justify-center gap-3" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-slate-900' : 'bg-slate-300'}`}
          />
        ))}
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinKey key={d} label={d} onClick={() => press(d)} />
        ))}
        <span />
        <PinKey label="0" onClick={() => press('0')} />
        <PinKey label="⌫" onClick={() => setPin(pin.slice(0, -1))} />
      </div>
    </main>
  );
}

function PinKey({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white py-5 text-xl font-medium shadow-sm active:bg-slate-100"
    >
      {label}
    </button>
  );
}
