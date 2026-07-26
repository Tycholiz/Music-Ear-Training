/**
 * Pitch representation.
 *
 * Pitches are plain MIDI note numbers throughout the app: C4 = 60, one
 * semitone per integer. Since every answer in both exercises is identified by
 * semitone count rather than by written spelling, we never need enharmonic
 * logic — names are only ever produced for display, and always with sharps.
 */

export const MIDI_MIN = 0
export const MIDI_MAX = 127

/** Middle C. */
export const MIDDLE_C = 60

const SHARP_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

/** Semitone offset above C for each natural letter. */
const LETTER_OFFSETS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

export function isValidMidi(midi: number): boolean {
  return Number.isInteger(midi) && midi >= MIDI_MIN && midi <= MIDI_MAX
}

/** Pitch class 0-11, where 0 is C. */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

/** Scientific pitch notation octave number. C4 = 60 sits in octave 4. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1
}

/**
 * Format a MIDI number as scientific pitch notation, e.g. `60` -> `"C4"`.
 * Accidentals are always spelled as sharps.
 */
export function midiToName(midi: number): string {
  if (!isValidMidi(midi)) {
    throw new RangeError(`MIDI note out of range: ${midi}`)
  }
  return `${SHARP_NAMES[pitchClass(midi)]}${octaveOf(midi)}`
}

/** The note name without its octave, e.g. `61` -> `"C#"`. */
export function midiToPitchClassName(midi: number): string {
  return SHARP_NAMES[pitchClass(midi)]
}

const NAME_PATTERN = /^([A-Ga-g])([#b♯♭]*)(-?\d+)$/

/**
 * Parse scientific pitch notation into a MIDI number, e.g. `"C#3"` -> `49`.
 *
 * Flats and multiple accidentals are accepted on the way in even though we
 * never emit them, so that hand-written notes in tests and settings files
 * don't have to be pre-normalised.
 */
export function nameToMidi(name: string): number {
  const match = NAME_PATTERN.exec(name.trim())
  if (!match) {
    throw new SyntaxError(`Unparseable note name: ${name}`)
  }

  const [, letter, accidentals, octave] = match
  let semitone = LETTER_OFFSETS[letter.toUpperCase()]

  for (const accidental of accidentals) {
    semitone += accidental === '#' || accidental === '♯' ? 1 : -1
  }

  const midi = (Number(octave) + 1) * 12 + semitone
  if (!isValidMidi(midi)) {
    throw new RangeError(`Note out of MIDI range: ${name}`)
  }
  return midi
}

/** Every MIDI note from `low` to `high` inclusive. */
export function notesInRange(low: number, high: number): number[] {
  if (low > high) {
    throw new RangeError(`Range is inverted: ${low} > ${high}`)
  }
  return Array.from({ length: high - low + 1 }, (_, i) => low + i)
}
