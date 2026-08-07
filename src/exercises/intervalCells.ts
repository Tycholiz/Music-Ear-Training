import { dropEmptyRows, type AnswerCell } from '../components'
import { INTERVALS } from '../theory'
import type { IntervalQuestion } from './intervalQuestion'

/**
 * The grid covers the interval table in order, with a blank cell wherever the
 * user has switched an interval off, so the buttons never reflow between
 * questions. Rows with nothing in them — the compound intervals, usually, but
 * anywhere in the table — are dropped rather than left as dead space.
 */
export function buildCells(
  enabled: readonly number[],
  wrong: readonly number[],
  solved: boolean,
  question: IntervalQuestion | null,
): AnswerCell[] {
  const chosen = new Set(enabled)

  return dropEmptyRows(
    INTERVALS.map((interval) =>
      chosen.has(interval.semitones)
        ? {
            id: String(interval.semitones),
            label: interval.name,
            state: stateFor(interval.semitones, wrong, solved, question),
          }
        : null,
    ),
  )
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
