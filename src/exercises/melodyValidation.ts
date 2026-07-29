import { DEGREES_PER_OCTAVE, degreeLabel, scaleById } from '../theory'
import {
  MAX_MELODY_LENGTH,
  MIN_MELODY_LENGTH,
  type MelodyBacking,
  type MelodySettings,
} from '../settings'
import { canGenerateMelody } from './melodyQuestion'

/**
 * Live validation for the melody Customize screens.
 *
 * Mirrors the chord and interval sides: a selection that cannot produce a
 * question is explained where it was made rather than allowed through to a
 * dead exercise screen. Melody has three separate ways to be stuck and they
 * want different wording, so unlike `isChordStuck` this reports *why* — being
 * told the range is too narrow is actionable, being told "nothing can be
 * played" is a puzzle.
 */

export const BACKING_NAMES: Record<MelodyBacking, string> = {
  chord: 'Chord',
  drone: 'Tonic drone',
  none: 'None',
}

export const BACKING_DESCRIPTIONS: Record<MelodyBacking, string> = {
  chord: 'The tonic chord holds under the melody. Easiest.',
  drone:
    'The tonic alone — it says where home is, but not whether the key is major or minor.',
  none: 'Nothing underneath. The tonic has to be remembered rather than heard.',
}

export const MELODY_LENGTHS: readonly number[] = Array.from(
  { length: MAX_MELODY_LENGTH - MIN_MELODY_LENGTH + 1 },
  (_, i) => MIN_MELODY_LENGTH + i,
)

/** Whether the range can hold the octave a melody is written across. */
export function melodyRangeWarning(settings: MelodySettings): string | null {
  const span = settings.range.high - settings.range.low
  if (span >= DEGREES_PER_OCTAVE) return null

  return `A melody spans an octave, but the range is only ${span} semitone${
    span === 1 ? '' : 's'
  } wide. Widen it by ${DEGREES_PER_OCTAVE - span} more.`
}

/**
 * Whether every featured degree can actually fit in a melody this short.
 *
 * Each note is one degree, so a melody cannot feature more degrees than it has
 * notes — and long before that point, featuring most of them stops being a
 * drill and starts being a spelling test.
 */
export function featuredWarning(settings: MelodySettings): string | null {
  const featured = [...new Set(settings.featured)]
  if (featured.length <= settings.length) return null

  const names = featured.map(degreeLabel).join(', ')
  return `${featured.length} degrees are featured (${names}) but the melody is only ${settings.length} notes long, so they cannot all appear. Feature fewer, or lengthen the melody.`
}

/**
 * Why nothing can be generated, or null when everything is fine.
 *
 * Ordered by what the user should fix first: a scale that no longer exists is
 * not their doing and is silently repaired by the store, so it never surfaces
 * here.
 */
export function melodyStuckReason(settings: MelodySettings): string | null {
  if (canGenerateMelody(settings)) return null

  return (
    melodyRangeWarning(settings) ??
    featuredWarning(settings) ??
    outsideScaleWarning(settings) ??
    'Nothing can be played with these settings.'
  )
}

/**
 * A featured degree the scale does not contain.
 *
 * Choosing the scale reconciles this, and the store drops it on read, so this
 * should be unreachable through the UI — it is here for a hand-edited or
 * downgraded blob, where saying so beats a blank exercise.
 */
function outsideScaleWarning(settings: MelodySettings): string | null {
  const scale = findScale(settings.scaleId)
  if (!scale) return null

  const stray = [...new Set(settings.featured)].filter(
    (degree) => !scale.degrees.includes(degree),
  )
  if (stray.length === 0) return null

  return `${stray.map(degreeLabel).join(', ')} cannot be featured: ${
    scale.name
  } does not contain ${stray.length === 1 ? 'it' : 'them'}.`
}

function findScale(id: string) {
  try {
    return scaleById(id)
  } catch {
    return null
  }
}

/** Nothing at all can be generated; the exercise itself is stuck. */
export function isMelodyStuck(settings: MelodySettings): boolean {
  return !canGenerateMelody(settings)
}
