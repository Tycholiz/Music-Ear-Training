import { UNAMBIGUOUS_ROOT_CHORD_IDS, nameToMidi } from '../theory'

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

/** How the chord root exercise takes its answer. */
export const ROOT_INPUT_MODES = ['reveal', 'microphone'] as const

export type RootInputMode = (typeof ROOT_INPUT_MODES)[number]
