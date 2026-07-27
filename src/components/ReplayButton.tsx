import type { Ref } from 'react'

/**
 * Compact replay control, shared by both exercises.
 *
 * The reference design puts a full-width sound bar here; we deliberately don't,
 * so the answer grid gets the vertical space.
 *
 * Exercise screens focus this on every new question, so a keyboard user can
 * press space to hear the question again without the focus sitting on an
 * answer button and picking one for them.
 */
export function ReplayButton({
  onClick,
  ref,
}: {
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      aria-label="Play again"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface active:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
        <path d="M16.5 8.5a5 5 0 010 7" />
        <path d="M19 6a8.5 8.5 0 010 12" />
      </svg>
    </button>
  )
}
