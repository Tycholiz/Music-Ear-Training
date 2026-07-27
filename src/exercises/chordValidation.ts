import { chordById, chordSpan, maxInversion } from '../theory'
import type { ChordSettings } from '../settings'
import { canGenerateChord } from './chordQuestion'

/**
 * Live validation for the chord Customize screens.
 *
 * Mirrors the interval side: a selection that can't produce a question is
 * disabled with an explanation rather than allowed through and silently
 * skipped. Two things make chords trickier than intervals — 3rd inversion
 * doesn't exist for triads, and a chord's span depends on which inversion it's
 * in, so both checks have to consider the pairing rather than either alone.
 */

export const INVERSION_NAMES: Record<number, string> = {
  0: 'Root position',
  1: '1st inversion',
  2: '2nd inversion',
  3: '3rd inversion',
}

export const ALL_INVERSIONS = [0, 1, 2, 3]

export const CHORD_PLAY_MODE_NAMES: Record<string, string> = {
  block: 'Block',
  arpeggiated: 'Arpeggiated',
}

export function rangeSpanOf(settings: ChordSettings): number {
  return settings.range.high - settings.range.low
}

/** Whether a chord can be built in this inversion at all, and fits the range. */
function fits(id: string, inversion: number, settings: ChordSettings): boolean {
  const chord = chordById(id)
  return (
    inversion <= maxInversion(chord) &&
    chordSpan(chord, inversion) <= rangeSpanOf(settings)
  )
}

/** Whether this chord fits the range in at least one enabled inversion. */
export function isChordUsable(id: string, settings: ChordSettings): boolean {
  return settings.inversions.some((inversion) => fits(id, inversion, settings))
}

/** Whether this inversion can be applied to at least one enabled chord. */
export function isInversionUsable(
  inversion: number,
  settings: ChordSettings,
): boolean {
  return settings.chords.some((id) => fits(id, inversion, settings))
}

/** Explanation for the Chords list, or null when everything selected works. */
export function chordsWarning(settings: ChordSettings): string | null {
  const skipped = settings.chords.filter((id) => !isChordUsable(id, settings))
  if (skipped.length === 0) return null

  const names = skipped.map((id) => chordById(id).name)
  const subject = names.length === 1 ? 'it is' : 'they are'
  return `${listNames(names)} cannot be played with the current range and inversions, so ${subject} being skipped.`
}

/** Explanation for the Inversions list. */
export function inversionsWarning(settings: ChordSettings): string | null {
  const skipped = settings.inversions.filter(
    (inversion) => !isInversionUsable(inversion, settings),
  )
  if (skipped.length === 0) return null

  const names = skipped.map((inversion) => INVERSION_NAMES[inversion])
  const subject = names.length === 1 ? 'it has' : 'they have'
  return `${listNames(names)} cannot be applied to any enabled chord, so ${subject} nothing to play. 3rd inversion needs a chord with four or more voices.`
}

/** Explanation for the Range pickers. */
export function chordRangeWarning(settings: ChordSettings): string | null {
  const span = rangeSpanOf(settings)

  // The narrowest chord that would become playable with more range. Pairings
  // that are impossible for other reasons — a triad in 3rd inversion — are
  // excluded, since widening the range would not rescue them.
  let best: { name: string; needs: number } | null = null

  for (const id of settings.chords) {
    const chord = chordById(id)
    for (const inversion of settings.inversions) {
      if (inversion > maxInversion(chord)) continue
      const needs = chordSpan(chord, inversion)
      if (needs <= span) continue
      if (!best || needs < best.needs) best = { name: chord.name, needs }
    }
  }

  if (!best) return null
  return `The range is ${span} semitone${span === 1 ? '' : 's'} wide, but ${best.name} needs ${best.needs}. Widen the range or switch some chords off.`
}

/** Nothing at all can be generated; the exercise itself is stuck. */
export function isChordStuck(settings: ChordSettings): boolean {
  return !canGenerateChord(settings)
}

function listNames(names: readonly string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
