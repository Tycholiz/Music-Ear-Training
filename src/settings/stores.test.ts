import { beforeEach, describe, expect, it } from 'vitest'
import { CHORDS } from '../theory'
import {
  chordScoreStore,
  chordSettingsStore,
  intervalScoreStore,
  intervalSettingsStore,
  melodySettingsStore,
  progressionSettingsStore,
  chordStatsStore,
  intervalStatsStore,
} from './stores'
import {
  DEFAULT_CHORD_SETTINGS,
  DEFAULT_INTERVAL_SETTINGS,
  DEFAULT_MELODY_SETTINGS,
  DEFAULT_PROGRESSION_SETTINGS,
  EMPTY_SCORE,
  recordGuess,
} from './types'
import { RECENT_WINDOW, recordInStore } from './stats'

beforeEach(() => {
  localStorage.clear()
  melodySettingsStore.reset()
  intervalSettingsStore.reset()
  chordSettingsStore.reset()
  intervalScoreStore.reset()
  chordScoreStore.reset()
  progressionSettingsStore.reset()
  chordStatsStore.reset()
  intervalStatsStore.reset()
})

/** Write a raw value past the typed API, the way a corrupt blob would look. */
function poison(key: string, value: unknown, version = 1) {
  localStorage.setItem(key, JSON.stringify({ version, value }))
}

describe('defaults', () => {
  it('starts intervals at Minor 2nd through Octave', () => {
    expect(intervalSettingsStore.read().intervals).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
  })

  it('leaves the compound intervals off by default', () => {
    const { intervals } = intervalSettingsStore.read()
    expect(intervals).not.toContain(13)
    expect(intervals).not.toContain(24)
  })

  it('starts with ascending and harmonic play modes', () => {
    expect(intervalSettingsStore.read().playModes).toEqual([
      'ascending',
      'harmonic',
    ])
  })

  it('starts at C3 to C5', () => {
    expect(intervalSettingsStore.read().range).toEqual({ low: 48, high: 72 })
  })

  it('starts chords at the eight common ones, root position, block', () => {
    const settings = chordSettingsStore.read()
    expect(settings.chords).toHaveLength(8)
    expect(settings.inversions).toEqual([0])
    expect(settings.playModes).toEqual(['block'])
  })

  it('only names chords that exist in the theory table', () => {
    const known = new Set(CHORDS.map((chord) => chord.id))
    for (const id of DEFAULT_CHORD_SETTINGS.chords) {
      expect(known, id).toContain(id)
    }
  })

  it('starts both scores at 0/0', () => {
    expect(intervalScoreStore.read()).toEqual(EMPTY_SCORE)
    expect(chordScoreStore.read()).toEqual(EMPTY_SCORE)
  })
})

describe('persistence', () => {
  it('keeps interval settings across a reload', () => {
    intervalSettingsStore.write({
      intervals: [3, 7],
      playModes: ['descending'],
      range: { low: 40, high: 80 },
      adaptive: false,
    })

    // Same key, fresh read path.
    expect(intervalSettingsStore.read()).toEqual({
      intervals: [3, 7],
      playModes: ['descending'],
      range: { low: 40, high: 80 },
      adaptive: false,
    })
  })

  it("keeps the two exercises' scores independent", () => {
    intervalScoreStore.write({ correct: 3, total: 4 })
    expect(chordScoreStore.read()).toEqual(EMPTY_SCORE)
  })
})

describe('sanitising interval settings', () => {
  const key = 'met.settings.intervals'

  it('drops intervals that are not in the table', () => {
    poison(key, { ...DEFAULT_INTERVAL_SETTINGS, intervals: [3, 99, -1, 7] })
    expect(intervalSettingsStore.read().intervals).toEqual([3, 7])
  })

  it('drops a stored Unison, which the table no longer has', () => {
    // What every existing user who had switched it on is holding. It is
    // filtered on read rather than migrated, since the sanitiser already knows
    // which ids are real and there is nothing to convert it into.
    poison(key, { ...DEFAULT_INTERVAL_SETTINGS, intervals: [0, 3, 7] })
    expect(intervalSettingsStore.read().intervals).toEqual([3, 7])
  })

  it('falls back when the Unison was the only interval stored', () => {
    poison(key, { ...DEFAULT_INTERVAL_SETTINGS, intervals: [0] })
    expect(intervalSettingsStore.read().intervals).toEqual(
      DEFAULT_INTERVAL_SETTINGS.intervals,
    )
  })

  it('falls back when every stored interval is unknown', () => {
    poison(key, { ...DEFAULT_INTERVAL_SETTINGS, intervals: [99] })
    expect(intervalSettingsStore.read().intervals).toEqual(
      DEFAULT_INTERVAL_SETTINGS.intervals,
    )
  })

  it('drops play modes that no longer exist', () => {
    poison(key, {
      ...DEFAULT_INTERVAL_SETTINGS,
      playModes: ['ascending', 'sideways'],
    })
    expect(intervalSettingsStore.read().playModes).toEqual(['ascending'])
  })

  it('clamps a range that runs past the piano', () => {
    poison(key, { ...DEFAULT_INTERVAL_SETTINGS, range: { low: 0, high: 999 } })
    expect(intervalSettingsStore.read().range).toEqual({ low: 21, high: 108 })
  })

  it('rejects an inverted range rather than silently swapping it', () => {
    poison(key, { ...DEFAULT_INTERVAL_SETTINGS, range: { low: 80, high: 40 } })
    expect(intervalSettingsStore.read().range).toEqual(
      DEFAULT_INTERVAL_SETTINGS.range,
    )
  })

  it('repairs one bad field without discarding the good ones', () => {
    poison(key, {
      intervals: [3, 7],
      playModes: ['nonsense'],
      range: { low: 48, high: 72 },
    })
    const settings = intervalSettingsStore.read()
    expect(settings.intervals).toEqual([3, 7])
    expect(settings.playModes).toEqual(DEFAULT_INTERVAL_SETTINGS.playModes)
  })

  it('falls back entirely when the blob is the wrong shape', () => {
    poison(key, 'not an object')
    expect(intervalSettingsStore.read()).toEqual(DEFAULT_INTERVAL_SETTINGS)
  })
})

describe('sanitising chord settings', () => {
  const key = 'met.settings.chords'

  it('drops chord ids that are not in the table', () => {
    poison(key, { ...DEFAULT_CHORD_SETTINGS, chords: ['major', 'not-a-chord'] })
    expect(chordSettingsStore.read().chords).toEqual(['major'])
  })

  it('drops inversions beyond 3rd', () => {
    poison(key, { ...DEFAULT_CHORD_SETTINGS, inversions: [0, 2, 9] })
    expect(chordSettingsStore.read().inversions).toEqual([0, 2])
  })

  it('drops unknown play modes', () => {
    poison(key, { ...DEFAULT_CHORD_SETTINGS, playModes: ['block', 'humming'] })
    expect(chordSettingsStore.read().playModes).toEqual(['block'])
  })
})

describe('sanitising progression settings', () => {
  const key = 'met.settings.progressions'

  it('reads a blob saved before "up to" existed as the behaviour it had', () => {
    // The field was added rather than the version bumped, since widening a
    // setting is backward compatible. What is not compatible is `undefined`
    // reaching the generator, where it is neither true nor false at the point
    // that decides how many chords to build.
    const { upTo, ...before } = DEFAULT_PROGRESSION_SETTINGS
    expect(upTo).toBe(false)

    poison(key, { ...before, length: 5 })

    expect(progressionSettingsStore.read().upTo).toBe(false)
    expect(progressionSettingsStore.read().length).toBe(5)
  })

  it('keeps "up to" once it has been set', () => {
    poison(key, { ...DEFAULT_PROGRESSION_SETTINGS, upTo: true })
    expect(progressionSettingsStore.read().upTo).toBe(true)
  })

  it('refuses a non-boolean rather than passing it through as truthy', () => {
    poison(key, { ...DEFAULT_PROGRESSION_SETTINGS, upTo: 'yes' })
    expect(progressionSettingsStore.read().upTo).toBe(false)
  })
})

describe('sanitising statistics', () => {
  const key = 'met.stats.chords'

  it('keeps a well-formed record', () => {
    poison(key, {
      'chord:major': {
        attempts: 4,
        correct: 3,
        recent: [
          { correct: true },
          { correct: false, answered: 'minor' },
          { correct: true },
          { correct: true },
        ],
        lastSeen: 1700,
      },
    })

    expect(chordStatsStore.read()['chord:major']).toEqual({
      attempts: 4,
      correct: 3,
      recent: [
        { correct: true },
        { correct: false, answered: 'minor' },
        { correct: true },
        { correct: true },
      ],
      lastSeen: 1700,
    })
  })

  it('reads a record written before mistakes were windowed', () => {
    // `recent` used to be a bare boolean[] with a separate lifetime
    // `confusions` map. Those blobs are live in real browsers, so they keep
    // their history rather than being thrown away on a version bump — the
    // stale confusion map is what gets dropped, since keeping it would leave
    // two records disagreeing about how old a mistake may be.
    poison(key, {
      'chord:major': {
        attempts: 4,
        correct: 3,
        recent: [true, false, true, true],
        lastSeen: 1700,
        confusions: { minor: 1 },
      },
    })

    const item = chordStatsStore.read()['chord:major']
    expect(item.attempts).toBe(4)
    expect(item.recent).toEqual([
      { correct: true },
      { correct: false },
      { correct: true },
      { correct: true },
    ])
    expect(item).not.toHaveProperty('confusions')
  })

  it('drops an id with no namespace', () => {
    // Ungrouped, so nothing could show it, and it would surface on the
    // statistics screen as an item that does not exist.
    poison(key, {
      major: { attempts: 3, correct: 1, recent: [], lastSeen: 0 },
      'chord:major': { attempts: 3, correct: 1, recent: [], lastSeen: 0 },
    })

    expect(Object.keys(chordStatsStore.read())).toEqual(['chord:major'])
  })

  it('drops an item nothing has been recorded against', () => {
    poison(key, {
      'chord:major': { attempts: 0, correct: 0, recent: [], lastSeen: 0 },
    })

    expect(chordStatsStore.read()).toEqual({})
  })

  it('never reports more correct than attempts', () => {
    poison(key, {
      'chord:major': { attempts: 2, correct: 99, recent: [], lastSeen: 0 },
    })

    expect(chordStatsStore.read()['chord:major'].correct).toBe(2)
  })

  it('trims a recent window longer than the one everything else is measured over', () => {
    // A hand-edited blob would otherwise weight adaptive difficulty against a
    // far longer history than every other item gets.
    poison(key, {
      'chord:major': {
        attempts: 100,
        correct: 100,
        recent: Array.from({ length: 100 }, () => ({ correct: true })),
        lastSeen: 0,
      },
    })

    expect(chordStatsStore.read()['chord:major'].recent).toHaveLength(
      RECENT_WINDOW,
    )
  })

  it('drops malformed outcomes rather than treating them as truthy', () => {
    poison(key, {
      'chord:major': {
        attempts: 3,
        correct: 1,
        recent: [{ correct: true }, 'yes', null, { answered: 'minor' }, false],
        lastSeen: 0,
      },
    })

    // The bare `false` is the legacy shape and survives; the string, the null
    // and the entry with no outcome do not.
    expect(chordStatsStore.read()['chord:major'].recent).toEqual([
      { correct: true },
      { correct: false },
    ])
  })

  it('repairs one bad item without discarding the good ones', () => {
    poison(key, {
      'chord:major': { attempts: 5, correct: 4, recent: [true], lastSeen: 1 },
      'chord:minor': 'not an object',
    })

    expect(Object.keys(chordStatsStore.read())).toEqual(['chord:major'])
  })

  it('falls back entirely when the blob is the wrong shape', () => {
    poison(key, 'not an object')
    expect(chordStatsStore.read()).toEqual({})
  })

  it('keeps each exercise history separate', () => {
    recordInStore(chordStatsStore, [{ item: 'chord:major', correct: true }])
    expect(intervalStatsStore.read()).toEqual({})
  })
})

describe('sanitising scores', () => {
  const key = 'met.score.intervals'

  it('never reports more correct answers than attempts', () => {
    poison(key, { correct: 500, total: 10 })
    expect(intervalScoreStore.read()).toEqual({ correct: 10, total: 10 })
  })

  it('clamps negatives to zero', () => {
    poison(key, { correct: -5, total: -5 })
    expect(intervalScoreStore.read()).toEqual({ correct: 0, total: 0 })
  })

  it('falls back for non-integer scores', () => {
    poison(key, { correct: 'lots', total: 1.5 })
    expect(intervalScoreStore.read()).toEqual(EMPTY_SCORE)
  })
})

describe('recordGuess', () => {
  it('counts every guess, so three misses then a hit is 1/4', () => {
    let score = EMPTY_SCORE
    score = recordGuess(score, false)
    score = recordGuess(score, false)
    score = recordGuess(score, false)
    score = recordGuess(score, true)

    expect(score).toEqual({ correct: 1, total: 4 })
  })

  it('scores a first-time correct answer as 1/1', () => {
    expect(recordGuess(EMPTY_SCORE, true)).toEqual({ correct: 1, total: 1 })
  })

  it('does not mutate the score it was given', () => {
    const score = EMPTY_SCORE
    recordGuess(score, true)
    expect(score).toEqual({ correct: 0, total: 0 })
  })
})

describe('melodySettingsStore', () => {
  /**
   * Plant a blob past the store, the way a stale or hand-edited one would
   * exist. Reset first: it clears the cache *and* removes the key, so planting
   * afterwards is the only order that survives.
   */
  function persist(raw: unknown, version = 2) {
    melodySettingsStore.reset()
    localStorage.setItem(
      'met.settings.melody',
      JSON.stringify({ version, value: raw }),
    )
  }

  it('starts on the bottom of the ladder', () => {
    expect(melodySettingsStore.read()).toEqual(DEFAULT_MELODY_SETTINGS)
  })

  it('drops a featured degree the scale does not contain', () => {
    // b7 under the major scale. Kept, it would stop any melody generating.
    persist({
      ...DEFAULT_MELODY_SETTINGS,
      scaleIds: ['major'],
      featured: [10, 11],
    })
    expect(melodySettingsStore.read().featured).toEqual([11])
  })

  it('keeps nothing featured, which is a legal state rather than an empty one', () => {
    // Unlike the selection stores, empty here means "no degree is required"
    // and must not be replaced with the defaults.
    persist({ ...DEFAULT_MELODY_SETTINGS, featured: [] })
    expect(melodySettingsStore.read().featured).toEqual([])
  })

  it('discards the version that stored a single scale', () => {
    // v1 held `scaleId: string` where v2 holds a list. There is no sensible
    // reading of the old shape, so the bump drops it rather than guessing.
    persist({ scaleId: 'blues', featured: [], length: 7, backing: 'none' }, 1)
    expect(melodySettingsStore.read()).toEqual(DEFAULT_MELODY_SETTINGS)
  })

  it('falls back to the default scales when none of them exist', () => {
    persist({ ...DEFAULT_MELODY_SETTINGS, scaleIds: ['lydian-dominant'] })
    expect(melodySettingsStore.read().scaleIds).toEqual(
      DEFAULT_MELODY_SETTINGS.scaleIds,
    )
  })

  it('keeps the scales it recognizes and drops the ones it does not', () => {
    persist({
      ...DEFAULT_MELODY_SETTINGS,
      scaleIds: ['major', 'lydian-dominant', 'blues'],
    })
    expect(melodySettingsStore.read().scaleIds).toEqual(['major', 'blues'])
  })

  it('features only degrees every selected scale has', () => {
    // Major has a 7, blues has not. Guaranteeing it across both is impossible,
    // so it cannot survive being persisted alongside them.
    persist({
      ...DEFAULT_MELODY_SETTINGS,
      scaleIds: ['major', 'blues'],
      featured: [5, 11],
    })
    const settings = melodySettingsStore.read()
    expect(settings.featured).toEqual([5])
  })

  it('clamps a length outside the offered range', () => {
    persist({ ...DEFAULT_MELODY_SETTINGS, length: 99 })
    expect(melodySettingsStore.read().length).toBe(8)

    persist({ ...DEFAULT_MELODY_SETTINGS, length: 1 })
    expect(melodySettingsStore.read().length).toBe(3)
  })

  it('falls back on a backing it does not recognize', () => {
    persist({ ...DEFAULT_MELODY_SETTINGS, backing: 'orchestra' })
    expect(melodySettingsStore.read().backing).toBe(
      DEFAULT_MELODY_SETTINGS.backing,
    )
  })

  it('sanitises on write as well as on read', () => {
    melodySettingsStore.write({
      ...DEFAULT_MELODY_SETTINGS,
      scaleIds: ['major'],
      featured: [10],
    })
    // Without write-path sanitising the bad value would live in memory until
    // the next reload, which is the gap the store was built to close.
    expect(melodySettingsStore.read().featured).toEqual([])
  })

  it('keeps its settings separate from the other exercises', () => {
    melodySettingsStore.write({ ...DEFAULT_MELODY_SETTINGS, length: 7 })
    expect(chordSettingsStore.read()).toEqual(DEFAULT_CHORD_SETTINGS)
    expect(intervalSettingsStore.read()).toEqual(DEFAULT_INTERVAL_SETTINGS)
  })
})
