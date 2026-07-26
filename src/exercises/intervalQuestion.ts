import {
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
  type NoteGroup,
} from '../audio'
import type { IntervalPlayMode, IntervalSettings } from '../settings'

/**
 * Interval question generation and answer checking.
 *
 * ## Direction and naming
 *
 * Ascending and harmonic questions are named by their actual semitone
 * distance, across the full range from Minor 2nd to Double Octave.
 *
 * Descending questions are named by the interval measured *upward* from the
 * reference note to the second note's pitch class:
 *
 *     answer = ((second - first) mod 12) || 12
 *
 * so a note one semitone below the reference is a Major 7th, and one eleven
 * semitones below is a Minor 2nd. Two consequences follow, both intended:
 *
 *   - Descending answers are always simple intervals, Minor 2nd to Octave.
 *     Compound intervals are ascending and harmonic only.
 *   - The generated note is never more than an octave below the reference, so
 *     what the ear hears and what the answer says stay consistent.
 *
 * Unison is offered in ascending and harmonic modes only. Descending, a gap of
 * zero would be indistinguishable from an octave under the rule above.
 */

export interface IntervalQuestion {
  /** The two notes in the order they sound. */
  notes: readonly [number, number]
  playMode: IntervalPlayMode
  /** Semitone id of the correct answer. */
  answer: number
}

export type Random = () => number

const DESCENDING_MODES: readonly IntervalPlayMode[] = [
  'descending',
  'descending-harmonic',
]

export function isDescending(mode: IntervalPlayMode): boolean {
  return DESCENDING_MODES.includes(mode)
}

/** Largest answer a descending question can have. */
export const MAX_DESCENDING_ANSWER = 12

/**
 * Semitones between the two notes for a given answer and direction.
 *
 * Ascending, the gap is the answer itself. Descending, it's the complement
 * within the octave — a Major 7th answer is one semitone down.
 */
export function gapForAnswer(answer: number, descending: boolean): number {
  if (!descending) return answer
  return answer === MAX_DESCENDING_ANSWER ? 12 : 12 - answer
}

/** The answer for a pair of notes as actually played. */
export function answerFor(
  first: number,
  second: number,
  mode: IntervalPlayMode,
): number {
  if (first === second) return 0
  if (!isDescending(mode)) return Math.abs(second - first)
  return (((second - first) % 12) + 12) % 12 || MAX_DESCENDING_ANSWER
}

/**
 * Enabled answers that this play mode can actually produce inside the range.
 * Empty means the mode is unusable with the current settings.
 */
export function candidateAnswers(
  mode: IntervalPlayMode,
  settings: IntervalSettings,
): number[] {
  const span = settings.range.high - settings.range.low
  const descending = isDescending(mode)

  return settings.intervals.filter((answer) => {
    // Unison has no meaning descending: a gap of zero would read as an octave.
    if (descending && answer === 0) return false
    if (descending && answer > MAX_DESCENDING_ANSWER) return false
    return gapForAnswer(answer, descending) <= span
  })
}

/** Play modes that can generate at least one question with these settings. */
export function usablePlayModes(
  settings: IntervalSettings,
): IntervalPlayMode[] {
  return settings.playModes.filter(
    (mode) => candidateAnswers(mode, settings).length > 0,
  )
}

/** Whether any question at all can be generated. Used by the validation in #13. */
export function canGenerate(settings: IntervalSettings): boolean {
  return usablePlayModes(settings).length > 0
}

function pick<T>(options: readonly T[], random: Random): T {
  return options[Math.floor(random() * options.length)]
}

export function generateIntervalQuestion(
  settings: IntervalSettings,
  random: Random = Math.random,
): IntervalQuestion {
  const modes = usablePlayModes(settings)
  if (modes.length === 0) {
    throw new Error(
      'No interval question can be generated: check the enabled intervals, play modes and range',
    )
  }

  const playMode = pick(modes, random)
  const descending = isDescending(playMode)
  const answer = pick(candidateAnswers(playMode, settings), random)
  const gap = gapForAnswer(answer, descending)

  // Choose the reference note from the positions where the gap still fits.
  const { low, high } = settings.range
  const lowestFirst = descending ? low + gap : low
  const highestFirst = descending ? high : high - gap
  const first =
    lowestFirst + Math.floor(random() * (highestFirst - lowestFirst + 1))
  const second = descending ? first - gap : first + gap

  return { notes: [first, second], playMode, answer }
}

/** Audio shape for a question, ready to hand to the piano. */
export function groupsForQuestion(question: IntervalQuestion): NoteGroup[] {
  const notes = [...question.notes]

  switch (question.playMode) {
    case 'harmonic':
      return simultaneous(notes)
    case 'ascending-harmonic':
    case 'descending-harmonic':
      return sequenceThenSimultaneous(notes)
    case 'ascending':
    case 'descending':
      return sequence(notes)
  }
}

export function isCorrect(question: IntervalQuestion, guess: number): boolean {
  return guess === question.answer
}
