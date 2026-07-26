import { describe, expect, it } from 'vitest'
import { DEFAULT_INTERVAL_SETTINGS, type IntervalSettings } from '../settings'
import {
  intervalsWarning,
  isIntervalUsable,
  isPlayModeUsable,
  isStuck,
  playModeName,
  playModesWarning,
  rangeSpan,
  rangeWarning,
} from './intervalValidation'

function settings(overrides: Partial<IntervalSettings> = {}): IntervalSettings {
  return { ...DEFAULT_INTERVAL_SETTINGS, ...overrides }
}

describe('isIntervalUsable', () => {
  it('accepts an interval that fits the range ascending', () => {
    const config = settings({
      playModes: ['ascending'],
      range: { low: 60, high: 84 },
    })
    expect(isIntervalUsable(24, config)).toBe(true)
  })

  it('rejects an interval wider than the range', () => {
    const config = settings({
      playModes: ['ascending'],
      range: { low: 60, high: 66 },
    })
    expect(isIntervalUsable(12, config)).toBe(false)
    expect(isIntervalUsable(5, config)).toBe(true)
  })

  it('rejects compound intervals when only descending is enabled', () => {
    const config = settings({
      playModes: ['descending'],
      range: { low: 21, high: 108 },
    })
    expect(isIntervalUsable(13, config)).toBe(false)
    expect(isIntervalUsable(12, config)).toBe(true)
  })

  it('accepts a compound interval if any enabled mode can reach it', () => {
    const config = settings({
      playModes: ['descending', 'ascending'],
      range: { low: 21, high: 108 },
    })
    expect(isIntervalUsable(13, config)).toBe(true)
  })

  it('rejects Unison descending but keeps it ascending', () => {
    expect(isIntervalUsable(0, settings({ playModes: ['descending'] }))).toBe(
      false,
    )
    expect(isIntervalUsable(0, settings({ playModes: ['ascending'] }))).toBe(
      true,
    )
  })

  it('measures the gap, not the answer, for descending intervals', () => {
    // Six semitones of room: a Major 7th answer is a 1-semitone gap and fits,
    // a Minor 2nd answer is an 11-semitone gap and does not.
    const config = settings({
      playModes: ['descending'],
      range: { low: 60, high: 66 },
    })
    expect(isIntervalUsable(11, config)).toBe(true)
    expect(isIntervalUsable(1, config)).toBe(false)
  })
})

describe('isPlayModeUsable', () => {
  it('rejects descending when only compound intervals are enabled', () => {
    const config = settings({
      intervals: [13, 24],
      range: { low: 21, high: 108 },
    })
    expect(isPlayModeUsable('descending', config)).toBe(false)
    expect(isPlayModeUsable('ascending', config)).toBe(true)
  })

  it('rejects every mode when the range is too narrow for anything', () => {
    const config = settings({ intervals: [24], range: { low: 60, high: 61 } })
    expect(isPlayModeUsable('ascending', config)).toBe(false)
    expect(isPlayModeUsable('harmonic', config)).toBe(false)
  })
})

describe('rangeSpan', () => {
  it('is the distance between the bounds', () => {
    expect(rangeSpan(settings({ range: { low: 48, high: 72 } }))).toBe(24)
  })
})

describe('warnings', () => {
  it('stays silent when everything fits', () => {
    const config = settings({ range: { low: 21, high: 108 } })
    expect(intervalsWarning(config)).toBeNull()
    expect(playModesWarning(config)).toBeNull()
    expect(rangeWarning(config)).toBeNull()
  })

  it('names the single unreachable interval in the singular', () => {
    const config = settings({
      intervals: [7, 24],
      playModes: ['ascending'],
      range: { low: 60, high: 72 },
    })
    expect(intervalsWarning(config)).toBe(
      'Double Octave cannot be played with the current range and play modes, so it is being skipped.',
    )
  })

  it('lists several unreachable intervals in the plural', () => {
    const config = settings({
      intervals: [7, 23, 24],
      playModes: ['ascending'],
      range: { low: 60, high: 72 },
    })
    expect(intervalsWarning(config)).toBe(
      'Major 14th and Double Octave cannot be played with the current range and play modes, so they are being skipped.',
    )
  })

  it('explains why a play mode is being skipped', () => {
    const config = settings({
      intervals: [13],
      playModes: ['ascending', 'descending'],
      range: { low: 21, high: 108 },
    })
    expect(playModesWarning(config)).toContain('Descending')
    expect(playModesWarning(config)).toContain('Minor 2nd through Octave')
  })

  it('tells the user how much range the widest interval needs', () => {
    const config = settings({
      intervals: [7, 12],
      playModes: ['ascending'],
      range: { low: 60, high: 68 },
    })
    expect(rangeWarning(config)).toBe(
      'The range is 8 semitones wide, but Octave needs 12. Widen the range or switch some intervals off.',
    )
  })

  it('reports the narrowest interval that still does not fit', () => {
    // Both are too wide; the message should name the achievable one.
    const config = settings({
      intervals: [12, 24],
      playModes: ['ascending'],
      range: { low: 60, high: 66 },
    })
    expect(rangeWarning(config)).toContain('Octave needs 12')
  })

  it('ignores intervals that are unreachable for reasons other than range', () => {
    // Compound intervals can't go descending at all, so the range isn't why.
    const config = settings({
      intervals: [7, 13],
      playModes: ['descending'],
      range: { low: 21, high: 108 },
    })
    expect(rangeWarning(config)).toBeNull()
  })
})

describe('isStuck', () => {
  it('is false whenever at least one mode works', () => {
    expect(isStuck(settings())).toBe(false)
  })

  it('is true when no enabled mode can produce an enabled interval', () => {
    expect(
      isStuck(settings({ intervals: [13], playModes: ['descending'] })),
    ).toBe(true)
  })

  it('is true when the range is narrower than every enabled interval', () => {
    expect(
      isStuck(
        settings({
          intervals: [12],
          playModes: ['ascending'],
          range: { low: 60, high: 65 },
        }),
      ),
    ).toBe(true)
  })
})

describe('playModeName', () => {
  it('gives every mode a readable name for screen readers', () => {
    expect(playModeName('ascending-harmonic')).toBe('Ascending then harmonic')
    expect(playModeName('harmonic')).toBe('Harmonic')
  })
})
