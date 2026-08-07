import type { AnswerCell } from './AnswerGrid'

/**
 * The shape of the answer grid, and the one rule that depends on it.
 *
 * Beside `AnswerGrid` rather than inside it, because a file that exports a
 * component and a plain function breaks fast refresh — but firmly on this side
 * of the line rather than in the exercises, which is where the two cell
 * builders live. How a table of answers is laid out is the grid's business;
 * the builders only say which answers there are and what state each is in.
 *
 * ## A blank cell holds its column; a blank row holds nothing
 *
 * The gaps exist so that a button is always in the same place. Someone who has
 * learned that the Major 2nd is on the right and the Minor 2nd on the left
 * should never find them swapped, so a cell the user has switched off stays
 * where it is and the grid never repacks around it.
 *
 * That argument only ever applied *across* a row. A row with nothing in it
 * holds no position for anything — it is dead height, and there was a lot of
 * it: three ninth chords out of thirty-five left fourteen empty rows on screen
 * and three buttons too small to hit, staggered down a page of nothing.
 */

/**
 * How many buttons sit side by side.
 *
 * Here rather than in the builders, so the column count and the layout rule
 * that depends on it cannot disagree.
 */
export const ANSWER_COLUMNS = 2

/**
 * Drop every row with no button in it, and square off the last one.
 *
 * Both builders used to end with the same two steps — trim trailing blanks,
 * pad to an even length — which cleared the dead space at the *bottom* of the
 * grid and none of the dead space in the middle of it. This replaces both:
 * a trailing blank row is just a row with nothing in it.
 *
 * **Column is preserved by construction**, because a row is only ever kept or
 * dropped whole. Nothing slides sideways, which is the half of a button's
 * position a user's thumb has actually learned. Closing the *holes* instead
 * would pack the grid tighter still and swap the Major 2nd with the Minor 2nd
 * the first time somebody switched a neighbour off.
 */
export function dropEmptyRows(cells: readonly AnswerCell[]): AnswerCell[] {
  const padded = [...cells]
  while (padded.length % ANSWER_COLUMNS !== 0) padded.push(null)

  const kept: AnswerCell[] = []
  for (let i = 0; i < padded.length; i += ANSWER_COLUMNS) {
    const row = padded.slice(i, i + ANSWER_COLUMNS)
    if (row.some((cell) => cell !== null)) kept.push(...row)
  }
  return kept
}
