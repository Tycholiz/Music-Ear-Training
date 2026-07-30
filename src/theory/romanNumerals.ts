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
 * and `♭III` are different chords; `vii°` is a third thing again. These strings
 * are what the user reads off a button and what the exercise marks them
 * against, so a numeral labelled `III` where `♭III` was meant does not look
 * untidy, it tells the user the wrong answer.
 *
 * Flats are written `♭` rather than `b`, matching the degree labels in
 * `scales.ts`. The ids stay ASCII: they go into persisted settings, where a
 * stable key matters more than a pretty one, and where nothing reads them.
 *
 * ## Sevenths are not a separate answer
 *
 * A dominant seventh at a cadence is one of the most ordinary sounds in music,
 * and this exercise does not ask the user to tell it from a plain `V` — both
 * are `V`. So the table holds triads, and a seventh sounded in a progression is
 * a fact about how it was voiced rather than a different chord to identify.
 */

export type NumeralQuality = 'major' | 'minor' | 'diminished'

/**
 * Where a numeral comes from, which is the first thing a musician wants to
 * know about one.
 *
 * Not the same question as `level`. The ladder says how hard a chord is to
 * hear; this says what it *is* — in the key, borrowed, or pointing at
 * something. They disagree, and both are worth having: `iv` and `II` are about
 * equally hard and come from completely different places.
 */
export type NumeralCategory =
  'diatonic' | 'secondary-dominant' | 'borrowed' | 'chromatic'

export interface RomanNumeral {
  /** Stable id used in persisted settings. */
  readonly id: string
  /** As written on a button, and as the answer reads. */
  readonly label: string
  /** Semitones above the tonic that the chord is built on. */
  readonly root: Degree
  readonly quality: NumeralQuality
  readonly category: NumeralCategory
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
 * heard as pointing somewhere. `♭II` last: it is rare enough that hearing it at
 * all is the achievement.
 *
 * Chords sharing a level are left in the order they are written here, since
 * `numeralsByDifficulty` sorts stably. That is load-bearing for `III`, which
 * leads the secondary dominants rather than falling after `II` alphabetically.
 *
 * How the *Customize* screen groups these is `NUMERAL_SECTIONS`, which is a
 * different question with a different answer.
 */
export const NUMERALS: readonly RomanNumeral[] = [
  {
    id: 'I',
    label: 'I',
    root: 0,
    quality: 'major',
    category: 'diatonic',
    level: 10,
  },
  {
    id: 'IV',
    label: 'IV',
    root: 5,
    quality: 'major',
    category: 'diatonic',
    level: 10,
  },
  {
    id: 'V',
    label: 'V',
    root: 7,
    quality: 'major',
    category: 'diatonic',
    level: 10,
  },

  {
    id: 'vi',
    label: 'vi',
    root: 9,
    quality: 'minor',
    category: 'diatonic',
    level: 20,
  },
  {
    id: 'ii',
    label: 'ii',
    root: 2,
    quality: 'minor',
    category: 'diatonic',
    level: 20,
  },

  {
    id: 'iii',
    label: 'iii',
    root: 4,
    quality: 'minor',
    category: 'diatonic',
    level: 30,
  },
  {
    id: 'vii-dim',
    label: 'vii°',
    root: 11,
    quality: 'diminished',
    category: 'diatonic',
    level: 30,
  },

  // Borrowed from the parallel minor.
  {
    id: 'iv',
    label: 'iv',
    root: 5,
    quality: 'minor',
    category: 'borrowed',
    level: 40,
  },
  {
    id: 'bIII',
    label: '♭III',
    root: 3,
    quality: 'major',
    category: 'borrowed',
    level: 40,
  },
  {
    id: 'bVI',
    label: '♭VI',
    root: 8,
    quality: 'major',
    category: 'borrowed',
    level: 40,
  },
  {
    id: 'bVII',
    label: '♭VII',
    root: 10,
    quality: 'major',
    category: 'borrowed',
    level: 40,
  },

  // Secondary dominants: majors where the key wants minors. `III` leads,
  // because it is far and away the one heard most — see NUMERAL_SECTIONS.
  {
    id: 'III',
    label: 'III',
    root: 4,
    quality: 'major',
    category: 'secondary-dominant',
    level: 50,
  },
  {
    id: 'II',
    label: 'II',
    root: 2,
    quality: 'major',
    category: 'secondary-dominant',
    level: 50,
  },
  {
    id: 'VI',
    label: 'VI',
    root: 9,
    quality: 'major',
    category: 'secondary-dominant',
    level: 50,
  },

  {
    id: 'bII',
    label: '♭II',
    root: 1,
    quality: 'major',
    category: 'chromatic',
    level: 60,
  },
] as const

export function numeralById(id: string): RomanNumeral {
  const numeral = NUMERALS.find((n) => n.id === id)
  if (!numeral) {
    throw new RangeError(`Unknown roman numeral: ${id}`)
  }
  return numeral
}

/** The ladder in order, easiest first. The answer pad is laid out this way. */
export function numeralsByDifficulty(): RomanNumeral[] {
  return [...NUMERALS].sort((a, b) => a.level - b.level)
}

export interface NumeralSection {
  readonly category: NumeralCategory
  readonly title: string
  /** One line on what this group *is*, since the grouping raises the question. */
  readonly description: string
}

/**
 * The categories in the order they are offered, and what each one is.
 *
 * Not difficulty order, and deliberately not. The secondary dominants sit above
 * the borrowed chords even though they are further up the ladder, because `III`
 * is the out-of-key chord a listener meets first and by a distance the most
 * common — burying it below `♭VI` and `♭VII` puts the useful chord where a
 * ladder happened to leave it rather than where it is wanted.
 *
 * Inside a section the ladder order stands. It is guidance and it still reads
 * as guidance once the sections are small enough to take in at a glance; what
 * grouping fixes is fifteen rows in one column, not the order within them.
 */
export const NUMERAL_SECTIONS: readonly NumeralSection[] = [
  {
    category: 'diatonic',
    title: 'Diatonic',
    description:
      'The seven chords of the key itself. I, IV and V are what most music is made of; the rest are listed as they get harder to hear.',
  },
  {
    category: 'secondary-dominant',
    title: 'Secondary dominants',
    description:
      'Majors where the key wants minors, each pointing at the chord it leads to. III is much the most common — it is the dominant of vi.',
  },
  {
    category: 'borrowed',
    title: 'Borrowed from the parallel minor',
    description:
      'The first chords that sound like a colour rather than a function.',
  },
  {
    category: 'chromatic',
    title: 'Chromatic',
    description: 'Rare enough that hearing it at all is the achievement.',
  },
] as const

/** The numerals of one category, easiest first. */
export function numeralsInCategory(category: NumeralCategory): RomanNumeral[] {
  return numeralsByDifficulty().filter(
    (numeral) => numeral.category === category,
  )
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
/**
 * How a progression comes to rest.
 *
 * A cadence is music theory rather than a preference, so it lives here with the
 * numerals it is made of. Which ones an exercise offers is a setting; what each
 * one *is* is not.
 */
export const CADENCES = ['authentic', 'plagal', 'half', 'deceptive'] as const

export type Cadence = (typeof CADENCES)[number]

/**
 * The numerals each cadence ends with, in order.
 *
 * Note that they do not all land on `I`. An authentic and a plagal cadence
 * close; a half cadence arrives on the dominant and stays open; a deceptive one
 * promises `I` and gives `vi` instead. Which is what lets a progression always
 * resolve without its last chord being predictable.
 */
const CADENCE_ENDINGS: Record<Cadence, readonly string[]> = {
  authentic: ['V', 'I'],
  plagal: ['IV', 'I'],
  half: ['V'],
  deceptive: ['V', 'vi'],
}

/** The chords a cadence is made of, and so the ones it needs enabled. */
export function cadenceNumerals(cadence: Cadence): readonly string[] {
  return CADENCE_ENDINGS[cadence]
}

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
