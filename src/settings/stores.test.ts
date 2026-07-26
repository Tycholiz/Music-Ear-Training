import { beforeEach, describe, expect, it } from 'vitest'
import { CHORDS } from '../theory'
import {
  chordScoreStore,
  chordSettingsStore,
  intervalScoreStore,
  intervalSettingsStore,
} from './stores'
import {
  DEFAULT_CHORD_SETTINGS,
  DEFAULT_INTERVAL_SETTINGS,
  EMPTY_SCORE,
  recordGuess,
} from './types'

beforeEach(() => {
  localStorage.clear()
  intervalSettingsStore.reset()
  chordSettingsStore.reset()
  intervalScoreStore.reset()
  chordScoreStore.reset()
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

  it('leaves Unison and the compound intervals off by default', () => {
    const { intervals } = intervalSettingsStore.read()
    expect(intervals).not.toContain(0)
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
    })

    // Same key, fresh read path.
    expect(intervalSettingsStore.read()).toEqual({
      intervals: [3, 7],
      playModes: ['descending'],
      range: { low: 40, high: 80 },
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
