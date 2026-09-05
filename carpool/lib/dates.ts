/**
 * All dates are handled as plain YYYY-MM-DD strings rather than Date objects.
 * The three families share one timezone (OQ-003), so a calendar date is
 * unambiguous and string handling sidesteps UTC-shift bugs entirely.
 */

export function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toDateString(new Date());
}

export function isValidDateString(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Monday of the week containing `dateStr` — the week view always starts Monday. */
export function startOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const shift = (d.getDay() + 6) % 7; // JS weeks start Sunday; ours start Monday
  return addDays(dateStr, -shift);
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Mon–Fri. Defaults only apply to school days (FR-001); weekends are ad-hoc only. */
export function isSchoolDay(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day >= 1 && day <= 5;
}

export function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Postgres returns TIME as HH:MM:SS; the UI only ever shows HH:MM. */
export function toHHMM(t: string): string {
  return t.slice(0, 5);
}

export function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t);
}
