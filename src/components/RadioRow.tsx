import type { ReactNode } from 'react'

/**
 * A list row for choosing exactly one of something.
 *
 * The tick sits at the *trailing* edge, where `CheckRow` puts its circle at
 * the leading one. That is the platform convention and it is worth keeping:
 * a leading control that cannot be unticked reads as a broken checkbox, while
 * a trailing tick reads as "this is the one", which is what it means.
 *
 * There is no `disabled`, deliberately. `CheckRow` needs one to stop the user
 * emptying a multi-select; a single-select can never be empty, because
 * choosing anything replaces what was there.
 *
 * Wrap a group of these in `RadioGroup` so the choice is announced as one
 * thing rather than as a row of unrelated controls.
 */
export function RadioRow({
  label,
  description,
  selected,
  onSelect,
}: {
  label: ReactNode
  /** Secondary line under the label, for explaining what the option means. */
  description?: ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-t border-separator px-4 py-3.5 text-left first:border-t-0 active:bg-surface-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {description && (
          <span className="block text-sm text-content-muted">
            {description}
          </span>
        )}
      </span>
      {selected && (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 stroke-accent"
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 8.5l3.5 3.5 7.5-8" />
        </svg>
      )}
    </button>
  )
}

/** Groups `RadioRow`s so the whole choice has one accessible name. */
export function RadioGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      {children}
    </div>
  )
}
