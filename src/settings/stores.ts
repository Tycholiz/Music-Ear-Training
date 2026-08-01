import {
  CADENCES,
  CHORDS,
  INTERVALS,
  NUMERALS,
  SCALES,
  cadenceNumerals,
  UNAMBIGUOUS_ROOT_CHORD_IDS,
  scaleById,
  sharedDegrees,
} from '../theory'
import { HIGHEST_NOTE, LOWEST_NOTE } from '../audio'
import {
  CHORD_PLAY_MODES,
  DEFAULT_CHORD_SETTINGS,
  DEFAULT_INTERVAL_SETTINGS,
  DEFAULT_MELODY_SETTINGS,
  DEFAULT_ROOT_SETTINGS,
  EMPTY_SCORE,
  INTERVAL_PLAY_MODES,
  DEFAULT_PROGRESSION_SETTINGS,
  MAX_MELODY_LENGTH,
  MAX_PROGRESSION_LENGTH,
  MELODY_BACKINGS,
  MIN_MELODY_LENGTH,
  MIN_PROGRESSION_LENGTH,
  type ChordSettings,
  type IntervalSettings,
  type MelodyBacking,
  type MelodySettings,
  type NoteRange,
  type ProgressionSettings,
  type Score,
} from './types'
import {
  createStore,
  isRecord,
  sanitizeInteger,
  sanitizeSelection,
} from './store'
import { RECENT_WINDOW, type ExerciseStats, type ItemStats } from './stats'

/**
 * The concrete persisted stores. Components go through these rather than
 * touching localStorage directly.
 *
 * Bump a store's version when its shape changes incompatibly; the old value is
 * then ignored and the user falls back to defaults for that store alone.
 */

const ALL_INTERVALS = INTERVALS.map((interval) => interval.semitones)
const ALL_CHORD_IDS = CHORDS.map((chord) => chord.id)

const ALL_SCALE_IDS = SCALES.map((scale) => scale.id)
const ALL_NUMERAL_IDS = NUMERALS.map((numeral) => numeral.id)

/** Root through 2nd inversion: a triad has no third inversion. */
const TRIAD_INVERSIONS = [0, 1, 2]

/** Only degrees every selected scale has can be guaranteed to appear. */
function featurable(scaleIds: readonly string[]): number[] {
  return sharedDegrees(scaleIds.map(scaleById))
}

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

function chordSettingsSanitizer(allowedChords: readonly string[]) {
  return (raw: unknown, defaults: ChordSettings): ChordSettings => {
    if (!isRecord(raw)) return defaults
    return {
      chords: sanitizeSelection(raw.chords, allowedChords, defaults.chords),
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
  }
}

export const chordSettingsStore = createStore<ChordSettings>({
  key: 'met.settings.chords',
  version: 1,
  defaults: DEFAULT_CHORD_SETTINGS,
  sanitize: chordSettingsSanitizer(ALL_CHORD_IDS),
})

/**
 * Chord root recognition keeps its own settings rather than sharing the chord
 * exercise's.
 *
 * The two are practised differently: identifying a root over wide, extended
 * voicings is reasonable long before identifying the quality of those same
 * chords is, so one shared selection would have to serve both badly.
 */
export const rootSettingsStore = createStore<ChordSettings>({
  key: 'met.settings.chordRoot',
  version: 1,
  defaults: DEFAULT_ROOT_SETTINGS,
  // The allowed list is narrower here, so a chord with no identifiable root
  // cannot reach the exercise even from a stale or hand-edited blob.
  sanitize: chordSettingsSanitizer(UNAMBIGUOUS_ROOT_CHORD_IDS),
})

/**
 * Melody dictation.
 *
 * `featured` is sanitised against the *selected* scales rather than against
 * all twelve degrees, so a b7 featured under the major scale cannot survive a
 * reload even if the scale was changed underneath it. Nothing featured is a
 * legal state — it means no degree is required — so unlike the selection
 * stores an empty result is kept rather than replaced with the defaults.
 *
 * Version 2: `scaleId` became `scaleIds`. The old value is a string where a
 * list is expected, so the bump drops it and the user starts from the
 * defaults rather than from a shape nothing understands.
 */
export const melodySettingsStore = createStore<MelodySettings>({
  key: 'met.settings.melody',
  version: 2,
  defaults: DEFAULT_MELODY_SETTINGS,
  sanitize(raw, defaults) {
    if (!isRecord(raw)) return defaults

    const scaleIds = sanitizeSelection(
      raw.scaleIds,
      ALL_SCALE_IDS,
      defaults.scaleIds,
    )

    return {
      scaleIds,
      featured: Array.isArray(raw.featured)
        ? featurable(scaleIds).filter((degree) =>
            (raw.featured as unknown[]).includes(degree),
          )
        : [...defaults.featured],
      length: sanitizeInteger(raw.length, {
        min: MIN_MELODY_LENGTH,
        max: MAX_MELODY_LENGTH,
        fallback: defaults.length,
      }),
      backing: MELODY_BACKINGS.includes(raw.backing as MelodyBacking)
        ? (raw.backing as MelodyBacking)
        : defaults.backing,
      range: sanitizeRange(raw.range, defaults.range),
    }
  },
})

/**
 * Chord progression recognition.
 *
 * `cadences` is sanitised against the enabled chords rather than on its own: a
 * plagal cadence needs `IV`, and one selected without it is not a stricter
 * setting but an impossible one. Dropping it here means a hand-edited or
 * downgraded blob cannot reach the exercise as a question with no answer.
 */
export const progressionSettingsStore = createStore<ProgressionSettings>({
  key: 'met.settings.progressions',
  version: 1,
  defaults: DEFAULT_PROGRESSION_SETTINGS,
  sanitize(raw, defaults) {
    if (!isRecord(raw)) return defaults

    const numerals = sanitizeSelection(
      raw.numerals,
      ALL_NUMERAL_IDS,
      defaults.numerals,
    )
    const cadences = sanitizeSelection(
      raw.cadences,
      CADENCES,
      defaults.cadences,
    )
    const reachable = cadences.filter((cadence) =>
      cadenceNumerals(cadence).every((id) => numerals.includes(id)),
    )

    return {
      numerals,
      cadences: reachable.length > 0 ? reachable : [...defaults.cadences],
      length: sanitizeInteger(raw.length, {
        min: MIN_PROGRESSION_LENGTH,
        max: MAX_PROGRESSION_LENGTH,
        fallback: defaults.length,
      }),
      // A blob written before `upTo` existed has no such key, and `undefined`
      // reaching the generator would be neither true nor false at the point
      // that decides how many chords to build. Anything but a real boolean
      // falls back to the default, which is the behaviour those blobs were
      // saved under.
      upTo: typeof raw.upTo === 'boolean' ? raw.upTo : defaults.upTo,
      inversions: sanitizeSelection(
        raw.inversions,
        TRIAD_INVERSIONS,
        defaults.inversions,
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

export const rootScoreStore = createStore<Score>({
  key: 'met.score.chordRoot',
  version: 1,
  defaults: EMPTY_SCORE,
  sanitize: sanitizeScore,
})

export const melodyScoreStore = createStore<Score>({
  key: 'met.score.melody',
  version: 1,
  defaults: EMPTY_SCORE,
  sanitize: sanitizeScore,
})

export const progressionScoreStore = createStore<Score>({
  key: 'met.score.progressions',
  version: 1,
  defaults: EMPTY_SCORE,
  sanitize: sanitizeScore,
})

/**
 * Per-item statistics, one store per exercise.
 *
 * Separate stores rather than one keyed by exercise, matching the settings and
 * scores either side of it: an exercise's record is its own, and a corrupt
 * blob should cost that exercise its history rather than every exercise's.
 *
 * Separate from the score stores too, and not folded into them, because they
 * are reset independently — `Reset Score` clears a scoreboard, and a lifetime
 * learning record is not a scoreboard.
 */
function sanitizeStats(raw: unknown, defaults: ExerciseStats): ExerciseStats {
  if (!isRecord(raw)) return defaults

  const clean: ExerciseStats = {}
  for (const [id, value] of Object.entries(raw)) {
    // An id with no namespace cannot be grouped or shown, and would surface on
    // the statistics screen as an item that does not exist.
    if (!id.includes(':')) continue

    const item = sanitizeItemStats(value)
    if (item) clean[id] = item
  }
  return clean
}

/** One item, or null when there is nothing salvageable in it. */
function sanitizeItemStats(raw: unknown): ItemStats | null {
  if (!isRecord(raw)) return null

  const attempts = sanitizeInteger(raw.attempts, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 0,
  })
  // An item nothing has been recorded against carries no information, and
  // keeping it would have the statistics screen listing chords never played.
  if (attempts === 0) return null

  const correct = sanitizeInteger(raw.correct, {
    min: 0,
    max: attempts,
    fallback: 0,
  })

  const recent = Array.isArray(raw.recent)
    ? raw.recent.filter((v): v is boolean => typeof v === 'boolean')
    : []

  return {
    attempts,
    correct,
    // Trimmed as well as filtered: a hand-edited blob with a hundred outcomes
    // in it would otherwise weight adaptive difficulty far past the window
    // every other item is measured over.
    recent: recent.slice(-RECENT_WINDOW),
    lastSeen: sanitizeInteger(raw.lastSeen, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    }),
    ...sanitizeConfusions(raw.confusions),
  }
}

function sanitizeConfusions(raw: unknown): {
  confusions?: Record<string, number>
} {
  if (!isRecord(raw)) return {}

  const clean: Record<string, number> = {}
  for (const [answered, count] of Object.entries(raw)) {
    if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
      clean[answered] = count
    }
  }
  return Object.keys(clean).length > 0 ? { confusions: clean } : {}
}

function statsStore(key: string) {
  return createStore<ExerciseStats>({
    key,
    version: 1,
    defaults: {},
    sanitize: sanitizeStats,
  })
}

export const intervalStatsStore = statsStore('met.stats.intervals')
export const chordStatsStore = statsStore('met.stats.chords')
export const rootStatsStore = statsStore('met.stats.chordRoot')
export const melodyStatsStore = statsStore('met.stats.melody')
export const progressionStatsStore = statsStore('met.stats.progressions')
