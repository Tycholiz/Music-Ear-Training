import { INTERVALS, intervalName } from '../theory'
import type { IntervalPlayMode, IntervalSettings } from '../settings'
import {
  MAX_DESCENDING_ANSWER,
  candidateAnswers,
  gapForAnswer,
  isDescending,
  usablePlayModes,
} from './intervalQuestion'

/**
 * Live validation for the Customize screens.
 *
 * Some setting combinations can't produce a question — a Double Octave needs 24
 * semitones of range, descending can't produce compound intervals, and so on.
 * Rather than let those reach the generator, each screen disables the
 * selections that would cause the conflict and explains why.
 */

/** Whether an interval can be produced by at least one enabled play mode. */
export function isIntervalUsable(
  answer: number,
  settings: IntervalSettings,
): boolean {
  return settings.playModes.some((mode) =>
    canModeProduce(answer, mode, settings),
  )
}

function canModeProduce(
  answer: number,
  mode: IntervalPlayMode,
  settings: IntervalSettings,
): boolean {
  const descending = isDescending(mode)
  if (descending && answer === 0) return false
  if (descending && answer > MAX_DESCENDING_ANSWER) return false
  return gapForAnswer(answer, descending) <= rangeSpan(settings)
}

export function rangeSpan(settings: IntervalSettings): number {
  return settings.range.high - settings.range.low
}

/** Whether a play mode can produce any of the currently enabled intervals. */
export function isPlayModeUsable(
  mode: IntervalPlayMode,
  settings: IntervalSettings,
): boolean {
  return candidateAnswers(mode, settings).length > 0
}

/**
 * Explanation to show under the Intervals list, or null when everything
 * selected is reachable.
 */
export function intervalsWarning(settings: IntervalSettings): string | null {
  const unreachable = settings.intervals.filter(
    (answer) => !isIntervalUsable(answer, settings),
  )
  if (unreachable.length === 0) return null

  const names = unreachable.map(intervalName)
  const subject = names.length === 1 ? 'it is' : 'they are'
  return `${listNames(names)} cannot be played with the current range and play modes, so ${subject} being skipped.`
}

/** Explanation to show under the Play Mode list. */
export function playModesWarning(settings: IntervalSettings): string | null {
  const unusable = settings.playModes.filter(
    (mode) => !isPlayModeUsable(mode, settings),
  )
  if (unusable.length === 0) return null

  const names = unusable.map(playModeName)
  return `${listNames(names)} ${
    names.length === 1 ? 'has' : 'have'
  } no enabled interval that can be played this way, so ${
    names.length === 1 ? 'it is' : 'they are'
  } being skipped. Descending is limited to Minor 2nd through Octave.`
}

/** Explanation to show under the Range pickers. */
export function rangeWarning(settings: IntervalSettings): string | null {
  const span = rangeSpan(settings)
  const widest = widestRequiredGap(settings)
  if (widest === null || widest <= span) return null

  return `The range is ${span} semitone${span === 1 ? '' : 's'} wide, but ${intervalName(
    widest,
  )} needs ${widest}. Widen the range or switch some intervals off.`
}

/**
 * The narrowest gap that would let at least one more enabled interval through,
 * or null if everything already fits.
 */
function widestRequiredGap(settings: IntervalSettings): number | null {
  const gaps = settings.intervals
    .flatMap((answer) =>
      settings.playModes
        .filter((mode) => !blockedByDirection(answer, mode))
        .map((mode) => gapForAnswer(answer, isDescending(mode))),
    )
    .filter((gap) => gap > rangeSpan(settings))

  return gaps.length > 0 ? Math.min(...gaps) : null
}

function blockedByDirection(answer: number, mode: IntervalPlayMode): boolean {
  if (!isDescending(mode)) return false
  return answer === 0 || answer > MAX_DESCENDING_ANSWER
}

/** Nothing at all can be generated; the exercise itself is stuck. */
export function isStuck(settings: IntervalSettings): boolean {
  return usablePlayModes(settings).length === 0
}

export const PLAY_MODE_NAMES: Record<IntervalPlayMode, string> = {
  ascending: 'Ascending',
  descending: 'Descending',
  harmonic: 'Harmonic',
  'ascending-harmonic': 'Ascending then harmonic',
  'descending-harmonic': 'Descending then harmonic',
}

export function playModeName(mode: IntervalPlayMode): string {
  return PLAY_MODE_NAMES[mode]
}

export const ALL_INTERVAL_ANSWERS = INTERVALS.map(
  (interval) => interval.semitones,
)

function listNames(names: readonly string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
