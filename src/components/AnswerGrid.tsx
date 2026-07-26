/**
 * Two-column grid of answer buttons, shared by both exercises.
 *
 * Answers the user has deselected in Customize are passed through as `null`,
 * which renders an empty cell that holds its position rather than letting the
 * remaining buttons reflow. Rows share the available height so the whole grid
 * fits on one screen without scrolling.
 */

export type AnswerState = 'idle' | 'wrong' | 'correct'

export interface Answer {
  id: string
  label: string
  state: AnswerState
}

/** `null` renders an empty placeholder cell. */
export type AnswerCell = Answer | null

const STATE_STYLES: Record<AnswerState, string> = {
  idle: 'bg-surface active:bg-surface-raised',
  wrong: 'bg-incorrect text-white',
  correct: 'bg-correct text-black',
}

export function AnswerGrid({
  cells,
  onAnswer,
}: {
  cells: readonly AnswerCell[]
  onAnswer: (id: string) => void
}) {
  return (
    <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-1.5 p-1.5">
      {cells.map((cell, i) =>
        cell === null ? (
          <div key={`empty-${i}`} aria-hidden />
        ) : (
          <button
            key={cell.id}
            type="button"
            onClick={() => onAnswer(cell.id)}
            // A guessed-wrong button stays visible and red but can't be
            // guessed again; a correct one locks the question.
            disabled={cell.state !== 'idle'}
            className={`flex min-h-0 items-center justify-center rounded-lg px-1 text-center text-sm leading-tight text-balance transition-colors ${STATE_STYLES[cell.state]}`}
          >
            {cell.label}
          </button>
        ),
      )}
    </div>
  )
}
