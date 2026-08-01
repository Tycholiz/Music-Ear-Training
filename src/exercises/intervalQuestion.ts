import {
  isPlayable,
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
  type NoteGroup,
} from '../audio'
import type {
  ExerciseStats,
  IntervalPlayMode,
  IntervalSettings,
} from '../settings'
import { intervalKey, pickAdaptive } from './adaptive'

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
  /**
   * The user's record, for weighting the answer toward what is going worst.
   *
   * Optional and ignored when `settings.adaptive` is off, so every existing
   * caller and test keeps the uniform behaviour it was written against.
   */
  stats?: ExerciseStats,
): IntervalQuestion {
  const modes = usablePlayModes(settings)
  if (modes.length === 0) {
    throw new Error(
      'No interval question can be generated: check the enabled intervals, play modes and range',
    )
  }

  const playMode = pick(modes, random)
  const descending = isDescending(playMode)
  // Weighted on the interval, which is the thing the user names. The play
  // mode and the reference note stay uniform: they are how the question is
  // presented rather than what it asks, and weighting a compound of several
  // dimensions at once needs its own thought rather than falling out of this.
  const answer = pickAdaptive(
    candidateAnswers(playMode, settings),
    intervalKey,
    settings.adaptive ? stats : undefined,
    random,
  )
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

/**
 * The two notes an answer *would* have produced, built from the same reference
 * note and in the same direction as the question.
 *
 * Playing this back when the user guesses lets them hear their answer against
 * the one they were asked about — a wrong guess becomes a comparison rather
 * than just a red button. A correct guess reproduces the question exactly.
 *
 * Returns null when the guessed interval would run off the end of the piano,
 * which can happen near the extremes of a wide range.
 */
export function previewNotes(
  question: IntervalQuestion,
  answer: number,
): [number, number] | null {
  const descending = isDescending(question.playMode)
  const first = question.notes[0]
  const second = descending
    ? first - gapForAnswer(answer, true)
    : first + gapForAnswer(answer, false)

  return isPlayable(second) ? [first, second] : null
}

/** Audio shape for `previewNotes`, or null if the guess is unplayable. */
export function groupsForAnswerPreview(
  question: IntervalQuestion,
  answer: number,
): NoteGroup[] | null {
  const notes = previewNotes(question, answer)
  if (!notes) return null
  return groupsForQuestion({ ...question, notes, answer })
}
