'use client';

import type { ResponsibilityScope } from '@/lib/types';

/**
 * The two mutually exclusive checkboxes from the product note (FR-003).
 * Rendered as checkboxes rather than a radio group because that's the mental
 * model the parents described — but clicking one always clears the other, and
 * clicking the active one unclaims the slot entirely.
 */
export default function ResponsibilityPicker({
  scope,
  claimedByMe,
  claimedByName,
  disabled,
  onChange,
}: {
  scope: ResponsibilityScope | null;
  claimedByMe: boolean;
  claimedByName: string | null;
  disabled?: boolean;
  onChange: (next: ResponsibilityScope | null) => void;
}) {
  // Someone else has it: show who, and don't offer checkboxes that would
  // silently steal the duty out from under them.
  if (claimedByName && !claimedByMe) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{claimedByName}</span>
        <span>{scope === 'own_child_only' ? 'own child only' : 'all children'}</span>
        <button onClick={() => onChange(null)} disabled={disabled} className="text-xs text-slate-400 underline">
          unclaim
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <Box
        label="I'll do all children"
        checked={claimedByMe && scope === 'all_children'}
        disabled={disabled}
        onToggle={(on) => onChange(on ? 'all_children' : null)}
      />
      <Box
        label="My child only"
        checked={claimedByMe && scope === 'own_child_only'}
        disabled={disabled}
        onToggle={(on) => onChange(on ? 'own_child_only' : null)}
      />
    </div>
  );
}

function Box({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span className={checked ? 'font-medium' : 'text-slate-600'}>{label}</span>
    </label>
  );
}
