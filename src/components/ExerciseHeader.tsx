import { formatAccuracy } from './score'

/**
 * Top row of both exercise screens: back chevron, score, percentage, menu.
 *
 * The reference design puts a full-width sound bar under this row. We
 * deliberately don't — a compact replay button lives in the exercise screens
 * instead so the answer grid gets the vertical space.
 */
export function ExerciseHeader({
  correct,
  total,
  showAccuracy = true,
  onBack,
  onMenu,
}: {
  correct: number
  total: number
  /**
   * Whether the percentage is worth showing beside the score.
   *
   * Off for a drill, which is ten questions long. A percentage is a summary of
   * a run too long to hold in your head, and over ten questions the score
   * already is one — "7/10" needs no help. It would also lurch about early on,
   * since one question in is either 0% or 100%.
   */
  showAccuracy?: boolean
  onBack: () => void
  onMenu: () => void
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-2 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="p-2 text-accent"
      >
        <svg
          aria-hidden
          viewBox="0 0 12 20"
          className="h-5 w-3 stroke-current"
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 2l-8 8 8 8" />
        </svg>
      </button>

      <div className="flex flex-1 items-baseline justify-center gap-6">
        <span aria-label="Score" className="text-lg font-medium tabular-nums">
          {correct}/{total}
        </span>
        {showAccuracy && (
          <span
            aria-label="Accuracy"
            className="text-lg font-medium tabular-nums"
          >
            {formatAccuracy(correct, total)}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onMenu}
        aria-label="Menu"
        className="flex h-9 w-9 items-center justify-center gap-1 p-2"
      >
        <span aria-hidden className="h-1 w-1 rounded-full bg-content" />
        <span aria-hidden className="h-1 w-1 rounded-full bg-content" />
        <span aria-hidden className="h-1 w-1 rounded-full bg-content" />
      </button>
    </header>
  )
}
