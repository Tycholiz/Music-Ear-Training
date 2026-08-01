/**
 * Two-column grid of answer buttons, shared by both exercises.
 *
 * Answers the user has deselected in Customize are passed through as `null`,
 * which renders an empty cell that holds its position rather than letting the
 * remaining buttons reflow. Rows share the available height so the whole grid
 * fits on one screen without scrolling.
 */

export type AnswerState = 'idle' | 'wrong' | 'correct' | 'revealed'

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
  // Given rather than found, so deliberately not the green a right answer
  // gets. Colouring a revealed answer as correct would tell the user they got
  // something they asked to be told.
  revealed: 'bg-surface-raised text-content',
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
            // Answered buttons stay enabled: pressing one again replays its
            // sound so the user can compare it against the target. They just
            // don't score again — the exercise screens enforce that, since
            // whether a press counts isn't something the grid can know.
            className={`flex min-h-0 items-center justify-center rounded-lg px-1 text-center text-sm leading-tight text-balance transition-colors ${STATE_STYLES[cell.state]}`}
          >
            {cell.label}
          </button>
        ),
      )}
    </div>
  )
}
