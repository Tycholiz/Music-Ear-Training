import type { AnswerCell } from '../components'
import { CHORDS } from '../theory'

/**
 * The chord grid covers the chord table in order, with a blank cell wherever
 * the user has switched a chord off, so buttons never reflow between
 * questions. Trailing all-blank rows are trimmed.
 */
export function buildChordCells(
  enabled: readonly string[],
  wrong: readonly string[],
  solvedId: string | null,
): AnswerCell[] {
  const chosen = new Set(enabled)

  const cells: AnswerCell[] = CHORDS.map((chord) => {
    if (!chosen.has(chord.id)) return null
    return {
      id: chord.id,
      label: chord.name,
      state: wrong.includes(chord.id)
        ? ('wrong' as const)
        : solvedId === chord.id
          ? ('correct' as const)
          : ('idle' as const),
    }
  })

  while (cells.length > 0 && cells.at(-1) === null) cells.pop()
  // Keep the two-column grid rectangular.
  if (cells.length % 2 === 1) cells.push(null)
  return cells
}
