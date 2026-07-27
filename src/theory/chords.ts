/**
 * Chord table.
 *
 * Each chord is a set of semitone offsets above its root, in close position.
 * Offsets above 12 mean the voice genuinely sits in the next octave — a
 * Dominant 9th's 9th is a 14, not a 2, because voicing it as a 2 would make it
 * indistinguishable from an Add9 by ear.
 *
 * Where convention omits a voice it is omitted here too: the Dominant 11th
 * drops its 3rd (it clashes with the 11th) and the 13th chords drop their 11th.
 */

export type ChordCategory =
  | 'Triads'
  | 'Sixths'
  | 'Sevenths'
  | 'Added-note'
  | 'Ninths'
  | 'Elevenths'
  | 'Thirteenths'

export interface Chord {
  /** Stable id used in persisted settings. */
  readonly id: string
  readonly name: string
  readonly category: ChordCategory
  /** Semitones above the root, ascending, close position, root position. */
  readonly offsets: readonly number[]
}

export const CHORD_CATEGORIES: readonly ChordCategory[] = [
  'Triads',
  'Sixths',
  'Sevenths',
  'Added-note',
  'Ninths',
  'Elevenths',
  'Thirteenths',
] as const

export const CHORDS: readonly Chord[] = [
  // Triads
  { id: 'major', name: 'Major Triad', category: 'Triads', offsets: [0, 4, 7] },
  { id: 'minor', name: 'Minor Triad', category: 'Triads', offsets: [0, 3, 7] },
  {
    id: 'diminished',
    name: 'Diminished Triad',
    category: 'Triads',
    offsets: [0, 3, 6],
  },
  {
    id: 'augmented',
    name: 'Augmented Triad',
    category: 'Triads',
    offsets: [0, 4, 8],
  },
  { id: 'sus2', name: 'Sus2', category: 'Triads', offsets: [0, 2, 7] },
  { id: 'sus4', name: 'Sus4', category: 'Triads', offsets: [0, 5, 7] },

  // Sixths
  {
    id: 'major-6th',
    name: 'Major 6th',
    category: 'Sixths',
    offsets: [0, 4, 7, 9],
  },
  {
    id: 'minor-6th',
    name: 'Minor 6th',
    category: 'Sixths',
    offsets: [0, 3, 7, 9],
  },

  // Sevenths
  {
    id: 'dominant-7th',
    name: 'Dominant 7th',
    category: 'Sevenths',
    offsets: [0, 4, 7, 10],
  },
  {
    id: 'major-7th',
    name: 'Major 7th',
    category: 'Sevenths',
    offsets: [0, 4, 7, 11],
  },
  {
    id: 'minor-7th',
    name: 'Minor 7th',
    category: 'Sevenths',
    offsets: [0, 3, 7, 10],
  },
  {
    id: 'minor-major-7th',
    name: 'Minor-Major 7th',
    category: 'Sevenths',
    offsets: [0, 3, 7, 11],
  },
  {
    id: 'half-diminished-7th',
    name: 'Half-diminished 7th',
    category: 'Sevenths',
    offsets: [0, 3, 6, 10],
  },
  {
    id: 'diminished-7th',
    name: 'Diminished 7th',
    category: 'Sevenths',
    offsets: [0, 3, 6, 9],
  },
  {
    id: 'augmented-7th',
    name: 'Augmented 7th',
    category: 'Sevenths',
    offsets: [0, 4, 8, 10],
  },
  {
    id: 'augmented-major-7th',
    name: 'Augmented-Major 7th',
    category: 'Sevenths',
    offsets: [0, 4, 8, 11],
  },
  {
    id: 'dominant-7th-flat-5',
    name: 'Dominant 7♭5',
    category: 'Sevenths',
    offsets: [0, 4, 6, 10],
  },
  {
    id: 'dominant-7th-sus4',
    name: 'Dominant 7th Sus4',
    category: 'Sevenths',
    offsets: [0, 5, 7, 10],
  },

  // Added-note
  {
    id: 'add9',
    name: 'Add9',
    category: 'Added-note',
    offsets: [0, 4, 7, 14],
  },
  {
    id: 'minor-add9',
    name: 'Minor Add9',
    category: 'Added-note',
    offsets: [0, 3, 7, 14],
  },
  {
    id: 'six-nine',
    name: '6/9',
    category: 'Added-note',
    offsets: [0, 4, 7, 9, 14],
  },

  // Ninths
  {
    id: 'dominant-9th',
    name: 'Dominant 9th',
    category: 'Ninths',
    offsets: [0, 4, 7, 10, 14],
  },
  {
    id: 'major-9th',
    name: 'Major 9th',
    category: 'Ninths',
    offsets: [0, 4, 7, 11, 14],
  },
  {
    id: 'minor-9th',
    name: 'Minor 9th',
    category: 'Ninths',
    offsets: [0, 3, 7, 10, 14],
  },
  {
    id: 'minor-major-9th',
    name: 'Minor-Major 9th',
    category: 'Ninths',
    offsets: [0, 3, 7, 11, 14],
  },
  {
    id: 'dominant-7th-flat-9',
    name: 'Dominant 7♭9',
    category: 'Ninths',
    offsets: [0, 4, 7, 10, 13],
  },
  {
    id: 'dominant-7th-sharp-9',
    name: 'Dominant 7♯9',
    category: 'Ninths',
    offsets: [0, 4, 7, 10, 15],
  },

  // Elevenths
  {
    id: 'dominant-11th',
    name: 'Dominant 11th',
    category: 'Elevenths',
    offsets: [0, 7, 10, 14, 17],
  },
  {
    id: 'minor-11th',
    name: 'Minor 11th',
    category: 'Elevenths',
    offsets: [0, 3, 7, 10, 14, 17],
  },
  {
    id: 'dominant-7th-sharp-11',
    name: 'Dominant 7♯11',
    category: 'Elevenths',
    offsets: [0, 4, 7, 10, 18],
  },
  {
    id: 'major-7th-sharp-11',
    name: 'Major 7♯11',
    category: 'Elevenths',
    offsets: [0, 4, 7, 11, 18],
  },

  // Thirteenths
  {
    id: 'dominant-13th',
    name: 'Dominant 13th',
    category: 'Thirteenths',
    offsets: [0, 4, 7, 10, 14, 21],
  },
  {
    id: 'major-13th',
    name: 'Major 13th',
    category: 'Thirteenths',
    offsets: [0, 4, 7, 11, 14, 21],
  },
  {
    id: 'minor-13th',
    name: 'Minor 13th',
    category: 'Thirteenths',
    offsets: [0, 3, 7, 10, 14, 21],
  },
] as const

export function chordById(id: string): Chord {
  const chord = CHORDS.find((c) => c.id === id)
  if (!chord) {
    throw new RangeError(`Unknown chord: ${id}`)
  }
  return chord
}

export function chordsInCategory(category: ChordCategory): Chord[] {
  return CHORDS.filter((c) => c.category === category)
}

export function voiceCount(chord: Chord): number {
  return chord.offsets.length
}

/**
 * Highest inversion a chord supports. A triad tops out at 2nd inversion; only
 * chords with four or more voices reach 3rd inversion.
 */
export function maxInversion(chord: Chord): number {
  return voiceCount(chord) - 1
}

/**
 * Invert a set of offsets by moving the lowest `inversion` voices up an octave.
 * `0` is root position.
 *
 * Note that the result stays sorted ascending, so for chords with extensions
 * the displaced voice can land in the middle of the stack rather than on top.
 */
export function invert(
  offsets: readonly number[],
  inversion: number,
): number[] {
  if (!Number.isInteger(inversion) || inversion < 0) {
    throw new RangeError(`Invalid inversion: ${inversion}`)
  }
  if (inversion >= offsets.length) {
    throw new RangeError(
      `Inversion ${inversion} needs more than ${offsets.length} voices`,
    )
  }

  const sorted = [...offsets].sort((a, b) => a - b)
  const raised = sorted.map((offset, i) =>
    i < inversion ? offset + 12 : offset,
  )
  return raised.sort((a, b) => a - b)
}

/**
 * The actual MIDI notes of a chord built on `rootMidi`.
 *
 * With an inversion applied the root is no longer the lowest note — the bass
 * note is `notes[0]`, which is what disambiguates otherwise-identical pitch
 * sets (see the collision rule in issue #14).
 */
export function chordNotes(
  rootMidi: number,
  chord: Chord,
  inversion = 0,
): number[] {
  return invert(chord.offsets, inversion).map((offset) => rootMidi + offset)
}

/** Total span in semitones from lowest to highest voice. */
export function chordSpan(chord: Chord, inversion = 0): number {
  const offsets = invert(chord.offsets, inversion)
  return offsets[offsets.length - 1] - offsets[0]
}

// --- root ambiguity --------------------------------------------------------

/** The pitch classes a chord occupies, transposed by `semitones`. */
function pitchClassSet(chord: Chord, semitones = 0): string {
  return [...new Set(chord.offsets.map((o) => (o + semitones) % 12))]
    .sort((a, b) => a - b)
    .join(',')
}

/**
 * Whether the same notes could be heard as a different chord with a *different
 * root*.
 *
 * G-C-D is a Gsus4, and it is equally a Csus2 — same three notes, but one has G
 * as its root and the other C. Nothing in the sound settles it, so there is no
 * correct answer to "what is the root of this chord". The symmetric chords are
 * worse: a diminished 7th maps onto itself every minor third, so all four of
 * its notes are equally defensible roots.
 *
 * This is about the root specifically, not about naming the chord. A chord can
 * be unambiguous here and still collide with another chord elsewhere, and
 * `acceptableAnswers` deals with that separately.
 */
export function hasAmbiguousRoot(chord: Chord): boolean {
  const target = pitchClassSet(chord)

  return CHORDS.some((other) =>
    // A transposition of zero would just be the chord itself; every other
    // offset that lands on the same notes implies a different root.
    Array.from({ length: 11 }, (_, i) => i + 1).some(
      (semitones) => pitchClassSet(other, semitones) === target,
    ),
  )
}

/**
 * Chords whose root can actually be identified from the sound alone.
 *
 * The root recognition exercise draws only from these. Twenty-one of the
 * thirty-four qualify, which is more than enough to practise on.
 */
export const UNAMBIGUOUS_ROOT_CHORDS: readonly Chord[] = CHORDS.filter(
  (chord) => !hasAmbiguousRoot(chord),
)

export const UNAMBIGUOUS_ROOT_CHORD_IDS: readonly string[] =
  UNAMBIGUOUS_ROOT_CHORDS.map((chord) => chord.id)
