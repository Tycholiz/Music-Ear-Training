import { chordById, chordNotes, type Chord } from './chords'
import { DEGREES_PER_OCTAVE, type Degree } from './scales'

/**
 * Roman numerals: chords named by their function in a key.
 *
 * ## Why this is neither of the tables we already have
 *
 * `chords.ts` names a chord's quality on its own — a minor triad is a minor
 * triad wherever it sits. `scales.ts` names a note's position against a tonic —
 * a b3 is a b3 whatever is built on it. A numeral says *both at once*: `ii` is
 * a minor triad built on the second degree, and the case is what carries the
 * quality. Neither table can express that, and widening either to try would
 * have it answering two questions and reading clearly for neither.
 *
 * ## The labels are the answer, so they have to be exact
 *
 * Case and accidentals do real work. `I` and `i` are different chords; `III`
 * and `bIII` are different chords; `vii°` is a third thing again. These strings
 * are what the user reads off a button and what the exercise marks them
 * against, so a numeral labelled `III` where `bIII` was meant does not look
 * untidy, it tells the user the wrong answer.
 *
 * ## Triads only
 *
 * Sevenths are a quality distinction needing their own buttons — `V` and `V7`
 * both — and the pad has to fit on a phone. Better added once the exercise
 * exists and the pad's real size is known than guessed at now.
 */

export type NumeralQuality = 'major' | 'minor' | 'diminished'

export interface RomanNumeral {
  /** Stable id used in persisted settings. */
  readonly id: string
  /** As written on a button, and as the answer reads. */
  readonly label: string
  /** Semitones above the tonic that the chord is built on. */
  readonly root: Degree
  readonly quality: NumeralQuality
  /**
   * Where this sits on the difficulty ladder, lowest first. Spaced, so a
   * numeral can be slotted in later without renumbering the rest.
   */
  readonly level: number
}

/** The chord each quality builds, by id in `CHORDS`. */
const CHORD_FOR_QUALITY: Record<NumeralQuality, string> = {
  major: 'major',
  minor: 'minor',
  diminished: 'diminished',
}

/**
 * The vocabulary, ordered by how hard it is to hear.
 *
 * `I IV V` first because they are the three chords most music is made of, and
 * because a progression drawn only from them is unambiguous — there is nowhere
 * else for it to have gone. `vi` and `ii` next, which together with those three
 * cover most popular music. Then `iii` and `vii°`, both easy to mistake for
 * their neighbours. Then the chords borrowed from the parallel minor, which are
 * the first ones that sound like a colour rather than a function. Then the
 * secondary dominants, which are majors where the key wants minors and so are
 * heard as pointing somewhere. `bII` last: it is rare enough that hearing it at
 * all is the achievement.
 */
export const NUMERALS: readonly RomanNumeral[] = [
  { id: 'I', label: 'I', root: 0, quality: 'major', level: 10 },
  { id: 'IV', label: 'IV', root: 5, quality: 'major', level: 10 },
  { id: 'V', label: 'V', root: 7, quality: 'major', level: 10 },

  { id: 'vi', label: 'vi', root: 9, quality: 'minor', level: 20 },
  { id: 'ii', label: 'ii', root: 2, quality: 'minor', level: 20 },

  { id: 'iii', label: 'iii', root: 4, quality: 'minor', level: 30 },
  { id: 'vii-dim', label: 'vii°', root: 11, quality: 'diminished', level: 30 },

  // Borrowed from the parallel minor.
  { id: 'iv', label: 'iv', root: 5, quality: 'minor', level: 40 },
  { id: 'bIII', label: 'bIII', root: 3, quality: 'major', level: 40 },
  { id: 'bVI', label: 'bVI', root: 8, quality: 'major', level: 40 },
  { id: 'bVII', label: 'bVII', root: 10, quality: 'major', level: 40 },

  // Secondary dominants: majors where the key wants minors.
  { id: 'II', label: 'II', root: 2, quality: 'major', level: 50 },
  { id: 'III', label: 'III', root: 4, quality: 'major', level: 50 },
  { id: 'VI', label: 'VI', root: 9, quality: 'major', level: 50 },

  { id: 'bII', label: 'bII', root: 1, quality: 'major', level: 60 },
] as const

export function numeralById(id: string): RomanNumeral {
  const numeral = NUMERALS.find((n) => n.id === id)
  if (!numeral) {
    throw new RangeError(`Unknown roman numeral: ${id}`)
  }
  return numeral
}

/** The ladder in order, easiest first. Customize lists them this way. */
export function numeralsByDifficulty(): RomanNumeral[] {
  return [...NUMERALS].sort((a, b) => a.level - b.level)
}

/** The chord a numeral builds, as a `CHORDS` entry. */
export function numeralChord(numeral: RomanNumeral): Chord {
  return chordById(CHORD_FOR_QUALITY[numeral.quality])
}

/**
 * Where a numeral's chord is rooted in a given key.
 *
 * `octave` shifts it whole octaves, since a progression places its chords in a
 * register rather than all against the tonic it was named from.
 */
export function numeralRoot(
  numeral: RomanNumeral,
  tonic: number,
  octave = 0,
): number {
  return tonic + numeral.root + octave * DEGREES_PER_OCTAVE
}

/**
 * The notes a numeral makes in a key, in root position.
 *
 * Root position only, deliberately: which inversion a chord appears in is a
 * question about voicing a progression, not about what the numeral means, and
 * the two want to be changeable independently.
 */
export function numeralNotes(
  numeral: RomanNumeral,
  tonic: number,
  octave = 0,
): number[] {
  return chordNotes(
    numeralRoot(numeral, tonic, octave),
    numeralChord(numeral),
    0,
  )
}
