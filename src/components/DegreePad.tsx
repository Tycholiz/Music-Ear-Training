import { degreeLabel, type Degree } from '../theory'

/**
 * The degrees of the current scale, for entering a melody one note at a time.
 *
 * Deliberately not `AnswerGrid`. That grid answers a question with a single
 * press and paints each cell with its own right-or-wrong state; this one is a
 * keyboard — the same button may be pressed several times in one answer, and
 * whether a press was right depends on *when* it happened, which a cell cannot
 * know. Bending one component to do both would have left neither legible.
 *
 * It also does not hold empty positions for degrees the scale lacks, which is
 * the other thing `AnswerGrid` does. There the gaps are occasional and keeping
 * them stops the buttons moving between questions; here the gaps *are* the
 * scale — major pentatonic would leave seven of twelve cells blank, scattering
 * five buttons across a grid that reads as broken. Nothing is lost by packing
 * them, because the scale cannot change without ending the round that would
 * have been disturbed by the buttons moving.
 */
export function DegreePad({
  degrees,
  onPress,
  disabled = false,
}: {
  /** Degrees that may be entered, ascending. */
  degrees: readonly Degree[]
  onPress: (degree: Degree) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-3">
      {degrees.map((degree) => (
        <button
          key={degree}
          type="button"
          onClick={() => onPress(degree)}
          disabled={disabled}
          className="flex h-14 w-[4.5rem] items-center justify-center rounded-lg bg-surface text-lg font-medium tabular-nums transition-colors active:bg-surface-raised disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {degreeLabel(degree)}
        </button>
      ))}
    </div>
  )
}
