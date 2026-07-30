/**
 * A list row with a circular checkbox at the leading edge: an empty grey ring
 * when off, a filled accent circle with a white tick when on.
 *
 * Used for every multi-select settings screen — intervals, chords, play modes,
 * inversions.
 *
 * ## Two ways of not being changeable
 *
 * `disabled` is for an option that is simply unavailable, and it is inert: no
 * focus, no press, nothing to say.
 *
 * `locked` is for an option that is *held on* by something the user could go
 * and change. It stays pressable, because a control that declines silently is
 * indistinguishable from a broken one — the press is refused and the reason is
 * given. `aria-disabled` rather than `disabled` for the same reason: it says
 * the control cannot be operated while leaving it focusable, so a keyboard or
 * screen reader user can reach the explanation too.
 */
export function CheckRow({
  label,
  checked,
  disabled = false,
  locked = false,
  onChange,
  onLockedPress,
}: {
  label: React.ReactNode
  checked: boolean
  /**
   * Used to stop the user deselecting the last remaining option on screens
   * where at least one selection is required.
   */
  disabled?: boolean
  /**
   * Held on by something else, and pressable so it can say what. Takes
   * precedence over `disabled`, which would make it unreachable.
   */
  locked?: boolean
  onChange: (checked: boolean) => void
  /** Called instead of `onChange` while locked. */
  onLockedPress?: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={locked || undefined}
      disabled={disabled && !locked}
      onClick={() => (locked ? onLockedPress?.() : onChange(!checked))}
      className="flex w-full items-center gap-3 border-t border-separator px-4 py-3.5 text-left first:border-t-0 active:bg-surface-raised disabled:opacity-50"
    >
      <Check checked={checked} />
      <span className="min-w-0 flex-1">{label}</span>
      {locked && <Lock />}
    </button>
  )
}

/**
 * The trailing padlock on a locked row.
 *
 * A lock rather than the greyed-out treatment `disabled` gets. Greying says
 * "not applicable"; this row's option very much applies, and is on — what it
 * cannot be is turned off.
 */
function Lock() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-content-muted"
      fill="currentColor"
    >
      <path d="M8 1a3 3 0 0 0-3 3v2H4.5A1.5 1.5 0 0 0 3 7.5v6A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 11.5 6H11V4a3 3 0 0 0-3-3zm1.5 5h-3V4a1.5 1.5 0 0 1 3 0v2z" />
    </svg>
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
