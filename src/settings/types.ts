import { UNAMBIGUOUS_ROOT_CHORD_IDS, nameToMidi, type Cadence } from '../theory'

/**
 * Everything that persists between sessions: what the user has chosen to be
 * tested on, and how they're doing.
 */

/** The five interval play modes from the Play Mode screen (#11). */
export const INTERVAL_PLAY_MODES = [
  'ascending',
  'descending',
  'harmonic',
  'ascending-harmonic',
  'descending-harmonic',
] as const

export type IntervalPlayMode = (typeof INTERVAL_PLAY_MODES)[number]

/** Block or arpeggiated (#19). */
export const CHORD_PLAY_MODES = ['block', 'arpeggiated'] as const

export type ChordPlayMode = (typeof CHORD_PLAY_MODES)[number]

export interface NoteRange {
  low: number
  high: number
}

export interface IntervalSettings {
  /** Enabled intervals, as semitone counts. */
  intervals: number[]
  playModes: IntervalPlayMode[]
  range: NoteRange
}

export interface ChordSettings {
  /** Enabled chord ids. */
  chords: string[]
  /** Enabled inversions; 0 is root position. */
  inversions: number[]
  playModes: ChordPlayMode[]
  range: NoteRange
}

/** What sounds under a melody, in descending order of help (#57). */
export const MELODY_BACKINGS = ['chord', 'drone', 'none'] as const

/**
 * How long a melody may be.
 *
 * Three notes is the shortest thing that has a shape rather than being a pair
 * of intervals. Eight is about where transcribing stops being an ear exercise
 * and starts being a memory one — the notes are no harder, there are just more
 * of them to hold at once.
 */
export const MIN_MELODY_LENGTH = 3
export const MAX_MELODY_LENGTH = 8

export type MelodyBacking = (typeof MELODY_BACKINGS)[number]

export interface MelodySettings {
  /**
   * Which scales melodies may be drawn from. Each question picks one.
   *
   * More than one at a time because a scale is not only a difficulty setting,
   * it is a sound — practising major against natural minor is a different and
   * harder exercise than practising either alone, and the ear that has to
   * decide which it is hearing is the one worth training.
   */
  scaleIds: string[]
  /**
   * Degrees guaranteed to appear in every melody. Empty means no requirement.
   *
   * Permitting a degree is not the same as featuring it: a six-note melody
   * from the major scale will often contain no 7 at all. This is what turns a
   * note pool into a drill on a particular degree.
   *
   * With several scales selected these are the degrees common to all of them.
   * A degree only some of them contain could not be guaranteed, and a
   * guarantee that sometimes holds is the thing this setting exists to
   * replace.
   */
  featured: number[]
  /** How many notes to transcribe. */
  length: number
  backing: MelodyBacking
  range: NoteRange
}

/**
 * How long a progression may be.
 *
 * Two is a bare cadence, which is the right first exercise and no less real for
 * being short. Eight is where identifying chords turns into remembering how
 * many there were.
 */
export const MIN_PROGRESSION_LENGTH = 2
export const MAX_PROGRESSION_LENGTH = 8

export interface ProgressionSettings {
  /** Enabled roman numeral ids. The difficulty ladder. */
  numerals: string[]
  /** Which ways a progression may resolve. */
  cadences: Cadence[]
  /** How many chords to identify. */
  length: number
  /**
   * Inversions the voicing may use. Root position is 0.
   *
   * Not part of the answer — `I⁶` is still `I` — so this changes how the
   * exercise *sounds* rather than what it asks. Root position alone makes every
   * voice jump at once, which is a chord chart being read out; allowing the
   * others lets the bass move by step and the inner voices hold their common
   * tones, which is a progression.
   */
  inversions: number[]
  range: NoteRange
}

export interface Score {
  correct: number
  total: number
}

export const DEFAULT_RANGE: NoteRange = {
  low: nameToMidi('C3'),
  high: nameToMidi('C5'),
}

/** Minor 2nd through Octave. Unison and the compound intervals start off. */
export const DEFAULT_INTERVAL_SETTINGS: IntervalSettings = {
  intervals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  playModes: ['ascending', 'harmonic'],
  range: DEFAULT_RANGE,
}

/** The eight chords a beginner should start with. */
export const DEFAULT_CHORD_SETTINGS: ChordSettings = {
  chords: [
    'major',
    'minor',
    'diminished',
    'augmented',
    'dominant-7th',
    'major-7th',
    'minor-7th',
    'half-diminished-7th',
  ],
  inversions: [0],
  playModes: ['block'],
  range: DEFAULT_RANGE,
}

/**
 * The bottom of the ladder: five notes of major pentatonic over a full chord.
 *
 * No semitones, no tritone, and the harmony sounding underneath throughout, so
 * a beginner's first melody is about as forgiving as one can be made. Nothing
 * is featured — that is a drill to reach for once a scale is comfortable, not
 * something to start on.
 */
export const DEFAULT_MELODY_SETTINGS: MelodySettings = {
  scaleIds: ['major-pentatonic'],
  featured: [],
  length: 5,
  backing: 'chord',
  range: DEFAULT_RANGE,
}

/**
 * The bottom of the ladder: three chords, drawn from the three chords.
 *
 * `I IV V` with an authentic cadence is the most unambiguous progression there
 * is — there is nowhere else it could have gone, which is what makes it the
 * right place to start rather than a toy.
 */
export const DEFAULT_PROGRESSION_SETTINGS: ProgressionSettings = {
  numerals: ['I', 'IV', 'V'],
  cadences: ['authentic'],
  length: 3,
  // All three by default, unlike the chord exercise where inversions are the
  // answer and start switched off. Here they cost the user no difficulty and
  // buy the progression its voice leading, so there is nothing to ease into.
  inversions: [0, 1, 2],
  range: DEFAULT_RANGE,
}

export const EMPTY_SCORE: Score = { correct: 0, total: 0 }

/**
 * Every guess counts as an attempt, right or wrong. Three wrong guesses
 * followed by the right one on a single question scores 1/4.
 */
export function recordGuess(score: Score, wasCorrect: boolean): Score {
  return {
    correct: score.correct + (wasCorrect ? 1 : 0),
    total: score.total + 1,
  }
}

/**
 * Chord root recognition draws only from chords whose root can be identified
 * from the sound alone — see `hasAmbiguousRoot`. Three of the chord exercise's
 * eight defaults are ambiguous by root (augmented triad, minor 7th and
 * half-diminished 7th), so they are dropped here rather than asking a question
 * with no correct answer.
 */
export const DEFAULT_ROOT_SETTINGS: ChordSettings = {
  ...DEFAULT_CHORD_SETTINGS,
  chords: DEFAULT_CHORD_SETTINGS.chords.filter((id) =>
    UNAMBIGUOUS_ROOT_CHORD_IDS.includes(id),
  ),
}
