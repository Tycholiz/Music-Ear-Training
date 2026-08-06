/**
 * A list row with a circular checkbox at the leading edge: an empty grey ring
 * when off, a filled accent circle with a white tick when on.
 *
 * Used for every multi-select settings screen — intervals, chords, play modes,
 * inversions.
 */
/**
 * Whether every item, some, or none of them is on.
 *
 * `'mixed'` exists for the rows that stand for a *group* of other rows. It is
 * the ARIA value for exactly this, so a screen reader says "partially checked"
 * rather than guessing from a glyph it cannot see.
 */
export type CheckState = boolean | 'mixed'

export function CheckRow({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: React.ReactNode
  checked: CheckState
  /**
   * Used to stop the user deselecting the last remaining option on screens
   * where at least one selection is required.
   */
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      // A partly-filled group goes to fully checked, never to empty. Tapping it
      // means "I want these", and there is nothing to want in the other
      // direction — the user who wants none of them is one more tap away.
      onClick={() => onChange(checked !== true)}
      className="flex w-full items-center gap-3 border-t border-separator px-4 py-3.5 text-left first:border-t-0 active:bg-surface-raised disabled:opacity-50"
    >
      <Check checked={checked} />
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  )
}

function Check({ checked }: { checked: CheckState }) {
  if (checked === false) {
    return (
      <span
        aria-hidden
        className="h-6 w-6 shrink-0 rounded-full border-2 border-content-muted"
      />
    )
  }

  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 stroke-white"
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* A dash for a partial group, a tick for a whole one. */}
        {checked === 'mixed' ? (
          <path d="M3.5 8h9" />
        ) : (
          <path d="M2.5 8.5l3.5 3.5 7.5-8" />
        )}
      </svg>
    </span>
  )
}
