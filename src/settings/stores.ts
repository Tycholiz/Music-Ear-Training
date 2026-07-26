import { CHORDS, INTERVALS } from '../theory'
import { HIGHEST_NOTE, LOWEST_NOTE } from '../audio'
import {
  CHORD_PLAY_MODES,
  DEFAULT_CHORD_SETTINGS,
  DEFAULT_INTERVAL_SETTINGS,
  EMPTY_SCORE,
  INTERVAL_PLAY_MODES,
  type ChordSettings,
  type IntervalSettings,
  type NoteRange,
  type Score,
} from './types'
import {
  createStore,
  isRecord,
  sanitizeInteger,
  sanitizeSelection,
} from './store'

/**
 * The concrete persisted stores. Components go through these rather than
 * touching localStorage directly.
 *
 * Bump a store's version when its shape changes incompatibly; the old value is
 * then ignored and the user falls back to defaults for that store alone.
 */

const ALL_INTERVALS = INTERVALS.map((interval) => interval.semitones)
const ALL_CHORD_IDS = CHORDS.map((chord) => chord.id)

/** Root through 3rd inversion. */
const ALL_INVERSIONS = [0, 1, 2, 3]

function sanitizeRange(raw: unknown, defaults: NoteRange): NoteRange {
  if (!isRecord(raw)) return defaults

  const low = sanitizeInteger(raw.low, {
    min: LOWEST_NOTE,
    max: HIGHEST_NOTE,
    fallback: defaults.low,
  })
  const high = sanitizeInteger(raw.high, {
    min: LOWEST_NOTE,
    max: HIGHEST_NOTE,
    fallback: defaults.high,
  })

  // An inverted range can't generate anything, so treat it as corrupt.
  return low <= high ? { low, high } : defaults
}

export const intervalSettingsStore = createStore<IntervalSettings>({
  key: 'met.settings.intervals',
  version: 1,
  defaults: DEFAULT_INTERVAL_SETTINGS,
  sanitize(raw, defaults) {
    if (!isRecord(raw)) return defaults
    return {
      intervals: sanitizeSelection(
        raw.intervals,
        ALL_INTERVALS,
        defaults.intervals,
      ),
      playModes: sanitizeSelection(
        raw.playModes,
        INTERVAL_PLAY_MODES,
        defaults.playModes,
      ),
      range: sanitizeRange(raw.range, defaults.range),
    }
  },
})

export const chordSettingsStore = createStore<ChordSettings>({
  key: 'met.settings.chords',
  version: 1,
  defaults: DEFAULT_CHORD_SETTINGS,
  sanitize(raw, defaults) {
    if (!isRecord(raw)) return defaults
    return {
      chords: sanitizeSelection(raw.chords, ALL_CHORD_IDS, defaults.chords),
      inversions: sanitizeSelection(
        raw.inversions,
        ALL_INVERSIONS,
        defaults.inversions,
      ),
      playModes: sanitizeSelection(
        raw.playModes,
        CHORD_PLAY_MODES,
        defaults.playModes,
      ),
      range: sanitizeRange(raw.range, defaults.range),
    }
  },
})

function sanitizeScore(raw: unknown, defaults: Score): Score {
  if (!isRecord(raw)) return defaults

  const total = sanitizeInteger(raw.total, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: defaults.total,
  })
  const correct = sanitizeInteger(raw.correct, {
    min: 0,
    max: total,
    fallback: defaults.correct,
  })
  return { correct, total }
}

export const intervalScoreStore = createStore<Score>({
  key: 'met.score.intervals',
  version: 1,
  defaults: EMPTY_SCORE,
  sanitize: sanitizeScore,
})

export const chordScoreStore = createStore<Score>({
  key: 'met.score.chords',
  version: 1,
  defaults: EMPTY_SCORE,
  sanitize: sanitizeScore,
})
