/**
 * The small control that takes or gives back a whole group of rows.
 *
 * A text button rather than a checkbox, and deliberately not a row of its own.
 * As a row it read as one more thing to select — the same height, the same
 * tick, sitting in the same list as the chords it was standing above — and the
 * eye had no way to tell a control from an option.
 *
 * The label says what the tap does rather than what the group currently is.
 * "Select all" flipping to "Deselect all" needs no glyph and no third state: a
 * checkbox showing a dash has to be learned, and this has to be read.
 */
export function SelectAll({
  full,
  disabled = false,
  onToggle,
  /** Named when it stands for the whole screen, so the two cannot be confused. */
  of,
}: {
  full: boolean
  disabled?: boolean
  onToggle: () => void
  of?: string
}) {
  const what = of ? ` ${of}` : ''

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="text-xs font-medium tracking-normal text-accent normal-case active:opacity-60 disabled:opacity-40"
    >
      {full ? 'Deselect all' : 'Select all'}
      {what}
    </button>
  )
}
