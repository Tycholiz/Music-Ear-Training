import { dropEmptyRows, type Answer, type AnswerCell } from '../components'
import { CHORDS, chordById, type Chord } from '../theory'
import type { Drill } from './drills'

/**
 * The chord grid covers the chord table in order, with a blank cell wherever
 * the user has switched a chord off, so buttons never reflow between
 * questions. Rows with nothing in them are dropped — see `dropEmptyRows`.
 */
export function buildChordCells(
  enabled: readonly string[],
  wrong: readonly string[],
  solvedId: string | null,
  /** The answer, once the user has asked to be told it. */
  revealedId: string | null = null,
): AnswerCell[] {
  const chosen = new Set(enabled)

  return dropEmptyRows(
    CHORDS.map((chord) =>
      chosen.has(chord.id)
        ? chordCell(chord, wrong, solvedId, revealedId)
        : null,
    ),
  )
}

/**
 * A drill's two chords, side by side, filling the grid.
 *
 * A drill does not lay its buttons out on the chord table, because it is not
 * showing the chord table. The reserved positions exist so that a chord is
 * always in the same place among the other thirty-four; in a drill there are
 * no other thirty-four, and honouring the table put Add9 and Major 9th in
 * opposite corners of a four-cell grid with two holes in it, while Major
 * versus Minor — which happens to sit in one row of the table — got the whole
 * screen. Two chords are two chords; the layout should not depend on where
 * they landed in a list the user cannot see.
 *
 * **Not folded into `buildChordCells` as "a pool of two goes side by side".**
 * A user who has switched everything off but Major Triad and Minor 13th is
 * still reading the chord table, and moving one of them out of its column to
 * close a gap is exactly the reflow the reserved positions exist to prevent.
 * The drill is a different screen wearing the same grid, so it says so.
 *
 * Ordered by the chord table rather than by how the pair is written down, so
 * which chord is on the left is a fact about the two chords instead of a
 * detail of the drill list — and it agrees with the main grid for every pair
 * that shares a row there, Major versus Minor included.
 */
export function buildDrillCells(
  drill: Drill,
  wrong: readonly string[],
  solvedId: string | null,
  revealedId: string | null = null,
): AnswerCell[] {
  return drill.chords
    .map(chordById)
    .sort((a, b) => CHORDS.indexOf(a) - CHORDS.indexOf(b))
    .map((chord) => chordCell(chord, wrong, solvedId, revealedId))
}

function chordCell(
  chord: Chord,
  wrong: readonly string[],
  solvedId: string | null,
  revealedId: string | null,
): Answer {
  return {
    id: chord.id,
    label: chord.name,
    state: wrong.includes(chord.id)
      ? ('wrong' as const)
      : solvedId === chord.id
        ? ('correct' as const)
        : revealedId === chord.id
          ? ('revealed' as const)
          : ('idle' as const),
  }
}
