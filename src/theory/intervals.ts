/**
 * Interval table.
 *
 * Intervals are keyed by semitone count, which doubles as their stable id in
 * persisted settings. Simple intervals span Unison to Octave; compound
 * intervals continue up to the Double Octave and are reachable only in
 * ascending and harmonic play modes — descending questions are capped at an
 * octave and always resolve to a simple interval (issue #8).
 */

export interface Interval {
  /** Semitones above the lower note. Also the stable id. */
  readonly semitones: number
  readonly name: string
}

export const INTERVALS: readonly Interval[] = [
  { semitones: 0, name: 'Unison' },
  { semitones: 1, name: 'Minor 2nd' },
  { semitones: 2, name: 'Major 2nd' },
  { semitones: 3, name: 'Minor 3rd' },
  { semitones: 4, name: 'Major 3rd' },
  { semitones: 5, name: 'Perfect 4th' },
  { semitones: 6, name: 'Tritone' },
  { semitones: 7, name: 'Perfect 5th' },
  { semitones: 8, name: 'Minor 6th' },
  { semitones: 9, name: 'Major 6th' },
  { semitones: 10, name: 'Minor 7th' },
  { semitones: 11, name: 'Major 7th' },
  { semitones: 12, name: 'Octave' },
  { semitones: 13, name: 'Minor 9th' },
  { semitones: 14, name: 'Major 9th' },
  { semitones: 15, name: 'Minor 10th' },
  { semitones: 16, name: 'Major 10th' },
  { semitones: 17, name: 'Perfect 11th' },
  { semitones: 18, name: 'Diminished 12th' },
  { semitones: 19, name: 'Perfect 12th' },
  { semitones: 20, name: 'Minor 13th' },
  { semitones: 21, name: 'Major 13th' },
  { semitones: 22, name: 'Minor 14th' },
  { semitones: 23, name: 'Major 14th' },
  { semitones: 24, name: 'Double Octave' },
] as const

/** Largest interval the app knows about. */
export const MAX_INTERVAL = 24

/** Unison through Octave. */
export const SIMPLE_INTERVALS = INTERVALS.filter((i) => i.semitones <= 12)

/** Minor 9th through Double Octave. */
export const COMPOUND_INTERVALS = INTERVALS.filter((i) => i.semitones > 12)

export function isCompound(semitones: number): boolean {
  return semitones > 12
}

export function intervalBySemitones(semitones: number): Interval {
  const interval = INTERVALS[semitones]
  if (!interval) {
    throw new RangeError(`No interval for ${semitones} semitones`)
  }
  return interval
}

export function intervalName(semitones: number): string {
  return intervalBySemitones(semitones).name
}
