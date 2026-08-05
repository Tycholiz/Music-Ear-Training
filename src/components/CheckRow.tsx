/**
 * A list row with a circular checkbox at the leading edge: an empty grey ring
 * when off, a filled accent circle with a white tick when on.
 *
 * Used for every multi-select settings screen — intervals, chords, play modes,
 * inversions.
 */
export function CheckRow({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: React.ReactNode
  checked: boolean
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
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 border-t border-separator px-4 py-3.5 text-left first:border-t-0 active:bg-surface-raised disabled:opacity-50"
    >
      <Check checked={checked} />
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  )
}

function Check({ checked }: { checked: boolean }) {
  if (!checked) {
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
        <path d="M2.5 8.5l3.5 3.5 7.5-8" />
      </svg>
    </span>
  )
}
