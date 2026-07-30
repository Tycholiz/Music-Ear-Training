import type { RomanNumeral } from '../theory'

/** Which button is lit, and whether the press was right. */
export interface Flash {
  numeralId: string
  correct: boolean
}

/**
 * Roman numeral buttons, for naming the chords of a progression.
 *
 * The feedback lives on the button rather than in the answer: a press flashes
 * green or red where the finger is, which is the thing the user is looking at
 * when they make it. The answer above records what stuck.
 *
 * Only the enabled numerals are shown, packed rather than holding places for
 * the rest — the same reasoning as `DegreePad`. A selection is not a gap in a
 * full set; `I IV V` is three buttons, not three buttons scattered across
 * fifteen. Nothing moves under the user's thumb mid-question, because the
 * selection cannot change without ending the round.
 */
export function NumeralPad({
  numerals,
  flash,
  onPress,
  disabled = false,
}: {
  /** The numerals available, in the order they should read. */
  numerals: readonly RomanNumeral[]
  /** The button currently lit, if any. */
  flash: Flash | null
  onPress: (numeralId: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-3">
      {numerals.map((numeral) => {
        const lit = flash?.numeralId === numeral.id

        return (
          <button
            key={numeral.id}
            type="button"
            onClick={() => onPress(numeral.id)}
            disabled={disabled}
            className={`flex h-14 w-[4.5rem] items-center justify-center rounded-lg text-lg font-medium tabular-nums transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              lit && flash?.correct
                ? 'bg-correct text-black'
                : lit
                  ? 'bg-incorrect text-white'
                  : 'bg-surface active:bg-surface-raised'
            }`}
          >
            {numeral.label}
          </button>
        )
      })}
    </div>
  )
}
