import type { AnswerCell } from '../components'
import { INTERVALS } from '../theory'
import type { IntervalQuestion } from './intervalQuestion'

/**
 * The grid covers the interval table in order, with a blank cell wherever the
 * user has switched an interval off, so the buttons never reflow between
 * questions. Rows that are entirely blank — usually the compound intervals —
 * are trimmed rather than left as dead space.
 */
export function buildCells(
  enabled: readonly number[],
  wrong: readonly number[],
  solved: boolean,
  question: IntervalQuestion | null,
): AnswerCell[] {
  const chosen = new Set(enabled)

  const cells: AnswerCell[] = INTERVALS.map((interval) => {
    if (!chosen.has(interval.semitones)) return null
    return {
      id: String(interval.semitones),
      label: interval.name,
      state: stateFor(interval.semitones, wrong, solved, question),
    }
  })

  while (cells.length > 0 && cells.at(-1) === null) cells.pop()
  // Keep the two-column grid rectangular.
  if (cells.length % 2 === 1) cells.push(null)
  return cells
}

function stateFor(
  semitones: number,
  wrong: readonly number[],
  solved: boolean,
  question: IntervalQuestion | null,
) {
  if (wrong.includes(semitones)) return 'wrong' as const
  if (solved && question?.answer === semitones) return 'correct' as const
  return 'idle' as const
}
