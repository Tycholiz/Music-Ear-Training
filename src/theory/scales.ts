import { isValidMidi, pitchClass } from './pitch'

/**
 * Scale degrees, and the scales that group them.
 *
 * ## Why this is not the interval table
 *
 * `intervals.ts` measures the gap between two notes: play C then G and the
 * answer is a Perfect 5th, wherever those notes sit. This module measures
 * every note against a *fixed tonic*. The semitone counts are the same twelve
 * numbers, but they mean a different thing and they are spoken differently —
 * a musician working out a melody by ear says "one five five six", not
 * "unison, perfect fifth, unison, major sixth". Folding degrees into the
 * interval table would have made one table answer two questions and read
 * clearly for neither.
 *
 * ## Why melodies are drawn from scales
 *
 * The exercise only works while the listener can hold a tonic in their head.
 * A coherent scale sustains that; an arbitrary set of degrees does not. Take
 * `1 b3 3 b6 6` — a reasonable-looking set for drilling major against minor
 * thirds and sixths — and melodies built from it have no key to belong to.
 * The tonal centre collapses, and the listener quietly stops hearing degrees
 * and starts measuring each note against the one before it. That is a
 * different skill, and a harder one, reached by accident.
 *
 * So the note pool is always a real scale, and difficulty is a ladder of
 * scales rather than a pile of checkboxes. `level` is what orders that ladder.
 */

/** Semitones above the tonic. Also the stable id — there are exactly twelve. */
export type Degree = number

export const DEGREES_PER_OCTAVE = 12

/**
 * Degree labels, flats throughout.
 *
 * `midiToName` spells accidentals as sharps because it names absolute
 * pitches, where the choice is arbitrary. Degrees are different: the third of
 * a minor key is universally written `b3`, never `#2`, and a button reading
 * `#2` would be read as a mistake. The two spellings do not need to agree
 * because they are never shown side by side.
 */
const DEGREE_LABELS = [
  '1',
  '♭2',
  '2',
  '♭3',
  '3',
  '4',
  '♭5',
  '5',
  '♭6',
  '6',
  '♭7',
  '7',
] as const

/** Every degree, `1` through `7`, in ascending order. */
export const ALL_DEGREES: readonly Degree[] = DEGREE_LABELS.map((_, i) => i)

export function isValidDegree(degree: number): boolean {
  return Number.isInteger(degree) && degree >= 0 && degree < DEGREES_PER_OCTAVE
}

/** How a degree is written on a button: `3` -> `"b3"`. */
export function degreeLabel(degree: Degree): string {
  if (!isValidDegree(degree)) {
    throw new RangeError(`Degree out of range: ${degree}`)
  }
  return DEGREE_LABELS[degree]
}

const TONIC: Degree = 0
const MINOR_THIRD: Degree = 3
const MAJOR_THIRD: Degree = 4
const FIFTH: Degree = 7

export interface Scale {
  /** Stable id used in persisted settings. */
  readonly id: string
  readonly name: string
  /**
   * Where this sits on the difficulty ladder, lowest first. Not an index into
   * `SCALES`: several scales share a rung, and the gaps leave room to slot new
   * ones in without renumbering what the user already has persisted.
   */
  readonly level: number
  /** Semitones above the tonic, ascending, always starting at 0. */
  readonly degrees: readonly Degree[]
}

/**
 * The ladder.
 *
 * Ordered by how hard the scale is to hear, which is mostly a question of how
 * many semitones it contains and how strongly its notes pull. The pentatonics
 * come first because they have no semitones and no tritone at all: every note
 * is consonant against the tonic, so a melody is hard to get lost in. The
 * seven-note scales add the notes that pull — 4 and 7 in major, b6 in minor —
 * which are harder to place but, once learned, are the ones that make the key
 * audible. Blues adds the b5, and chromatic gives up on a key altogether,
 * which is why it sits at the end on its own.
 */
export const SCALES: readonly Scale[] = [
  {
    id: 'major-pentatonic',
    name: 'Major Pentatonic',
    level: 10,
    degrees: [0, 2, 4, 7, 9],
  },
  {
    id: 'minor-pentatonic',
    name: 'Minor Pentatonic',
    level: 20,
    degrees: [0, 3, 5, 7, 10],
  },
  { id: 'major', name: 'Major', level: 30, degrees: [0, 2, 4, 5, 7, 9, 11] },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    level: 40,
    degrees: [0, 2, 4, 5, 7, 9, 10],
  },
  {
    id: 'dorian',
    name: 'Dorian',
    level: 50,
    degrees: [0, 2, 3, 5, 7, 9, 10],
  },
  {
    id: 'natural-minor',
    name: 'Natural Minor',
    level: 60,
    degrees: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    id: 'harmonic-minor',
    name: 'Harmonic Minor',
    level: 70,
    degrees: [0, 2, 3, 5, 7, 8, 11],
  },
  { id: 'blues', name: 'Blues', level: 80, degrees: [0, 3, 5, 6, 7, 10] },
  { id: 'chromatic', name: 'Chromatic', level: 90, degrees: ALL_DEGREES },
] as const

export function scaleById(id: string): Scale {
  const scale = SCALES.find((s) => s.id === id)
  if (!scale) {
    throw new RangeError(`Unknown scale: ${id}`)
  }
  return scale
}

/** The ladder in order, easiest first. Customize lists them this way. */
export function scalesByDifficulty(): Scale[] {
  return [...SCALES].sort((a, b) => a.level - b.level)
}

export function scaleContains(scale: Scale, degree: Degree): boolean {
  return scale.degrees.includes(degree)
}

/**
 * Degrees every one of these scales contains.
 *
 * What several selected scales agree on. A melody exercise drawing from more
 * than one cannot promise a degree only some of them have — the question that
 * picked the wrong scale could not deliver it — so anything guaranteed across
 * a selection has to come from here.
 *
 * Ascending, and empty for an empty selection: nothing is common to nothing.
 */
export function sharedDegrees(scales: readonly Scale[]): Degree[] {
  if (scales.length === 0) return []
  return scales[0].degrees.filter((degree) =>
    scales.every((scale) => scale.degrees.includes(degree)),
  )
}

/** Every degree any of these scales contains, ascending. */
export function combinedDegrees(scales: readonly Scale[]): Degree[] {
  const all = new Set(scales.flatMap((scale) => [...scale.degrees]))
  return ALL_DEGREES.filter((degree) => all.has(degree))
}

/**
 * The tonic chord of a scale: the harmony a melody is heard against.
 *
 * Sounding a chord *underneath* the melody is what keeps the tonic available.
 * The listener never has to remember it, because it never stopped playing —
 * which also means a melody no longer has to open on the tonic to be
 * transcribable, since every degree is heard against a reference that is still
 * there.
 *
 * That only works if the chord agrees with the scale. A major triad under a
 * natural minor melody puts a 3 against the melody's b3: not a reference
 * point, just a wrong note. So the third is read off the scale rather than
 * assumed, and dropped entirely where the scale does not commit to one. The
 * chromatic scale contains both thirds, so any triad clashes with half the
 * melodies drawn from it; a bare fifth asserts the tonic and says nothing
 * about quality, which is all chromatic has to say. The fifth is likewise
 * conditional, so a future scale built on a b5 does not get one it lacks.
 *
 * These are also the degrees a melody may open and close on. That is not a
 * coincidence worth factoring apart: a note sounds at rest exactly when it
 * belongs to the harmony underneath it, so it is one question, asked twice.
 */
export function tonicChord(scale: Scale): Degree[] {
  const has = (degree: Degree) => scale.degrees.includes(degree)
  const chord: Degree[] = [TONIC]

  // One third or none — having both means the scale is not committing to a
  // quality, and neither should the chord.
  if (has(MINOR_THIRD) !== has(MAJOR_THIRD)) {
    chord.push(has(MINOR_THIRD) ? MINOR_THIRD : MAJOR_THIRD)
  }
  if (has(FIFTH)) chord.push(FIFTH)

  return chord
}

/**
 * The pitch a degree sounds at, `octave` octaves above the tonic.
 *
 * Degrees are relative, so this is the only place they become real notes.
 * Melodies span more than one octave, hence the octave argument rather than a
 * bare tonic + degree.
 */
export function degreePitch(tonic: number, degree: Degree, octave = 0): number {
  if (!isValidDegree(degree)) {
    throw new RangeError(`Degree out of range: ${degree}`)
  }
  return tonic + degree + octave * DEGREES_PER_OCTAVE
}

/**
 * Which degree a sounding pitch is, against a tonic.
 *
 * Octave-agnostic: a 5 an octave down is still a 5, the same way chord root
 * matching ignores which octave the root was hummed in. What is being asked is
 * which degree it is, not where it sits.
 */
export function degreeOf(tonic: number, midi: number): Degree {
  if (!isValidMidi(tonic)) {
    throw new RangeError(`MIDI note out of range: ${tonic}`)
  }
  if (!isValidMidi(midi)) {
    throw new RangeError(`MIDI note out of range: ${midi}`)
  }
  return pitchClass(midi - tonic)
}
