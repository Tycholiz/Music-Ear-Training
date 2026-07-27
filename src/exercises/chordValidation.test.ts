import { describe, expect, it } from 'vitest'
import { DEFAULT_CHORD_SETTINGS, type ChordSettings } from '../settings'
import {
  chordRangeWarning,
  chordsWarning,
  inversionsWarning,
  isChordStuck,
  isChordUsable,
  isInversionUsable,
  rangeSpanOf,
} from './chordValidation'

function settings(overrides: Partial<ChordSettings> = {}): ChordSettings {
  return { ...DEFAULT_CHORD_SETTINGS, ...overrides }
}

const WIDE = { low: 21, high: 108 }

describe('isChordUsable', () => {
  it('accepts a chord that fits in an enabled inversion', () => {
    expect(
      isChordUsable('major', settings({ inversions: [0], range: WIDE })),
    ).toBe(true)
  })

  it('rejects a triad when only 3rd inversion is enabled', () => {
    const config = settings({ inversions: [3], range: WIDE })
    expect(isChordUsable('major', config)).toBe(false)
    expect(isChordUsable('dominant-7th', config)).toBe(true)
  })

  it('rejects a chord too wide for the range', () => {
    // A 13th chord spans 21 semitones in root position.
    const config = settings({ inversions: [0], range: { low: 60, high: 72 } })
    expect(isChordUsable('dominant-13th', config)).toBe(false)
    expect(isChordUsable('major', config)).toBe(true)
  })

  it('accepts a chord if any one enabled inversion fits', () => {
    // Root position spans 7, first inversion spans 8.
    const config = settings({
      inversions: [0, 1],
      range: { low: 60, high: 67 },
    })
    expect(isChordUsable('major', config)).toBe(true)
  })
})

describe('isInversionUsable', () => {
  it('rejects 3rd inversion when only triads are enabled', () => {
    const config = settings({ chords: ['major', 'minor'], range: WIDE })
    expect(isInversionUsable(3, config)).toBe(false)
    expect(isInversionUsable(2, config)).toBe(true)
  })

  it('accepts 3rd inversion once a four-voice chord is enabled', () => {
    const config = settings({
      chords: ['major', 'dominant-7th'],
      range: WIDE,
    })
    expect(isInversionUsable(3, config)).toBe(true)
  })

  it('rejects an inversion the range cannot accommodate', () => {
    const config = settings({ chords: ['major'], range: { low: 60, high: 67 } })
    expect(isInversionUsable(0, config)).toBe(true)
    expect(isInversionUsable(1, config)).toBe(false)
  })
})

describe('rangeSpanOf', () => {
  it('is the distance between the bounds', () => {
    expect(rangeSpanOf(settings({ range: { low: 48, high: 72 } }))).toBe(24)
  })
})

describe('warnings', () => {
  it('stays silent when everything works', () => {
    const config = settings({ range: WIDE })
    expect(chordsWarning(config)).toBeNull()
    expect(inversionsWarning(config)).toBeNull()
    expect(chordRangeWarning(config)).toBeNull()
  })

  it('names a single skipped chord in the singular', () => {
    const config = settings({
      chords: ['major', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 72 },
    })
    expect(chordsWarning(config)).toBe(
      'Dominant 13th cannot be played with the current range and inversions, so it is being skipped.',
    )
  })

  it('lists several skipped chords in the plural', () => {
    const config = settings({
      chords: ['major', 'minor'],
      inversions: [3],
      range: WIDE,
    })
    expect(chordsWarning(config)).toBe(
      'Major Triad and Minor Triad cannot be played with the current range and inversions, so they are being skipped.',
    )
  })

  it('explains why an inversion is being skipped', () => {
    const config = settings({
      chords: ['major', 'minor'],
      inversions: [0, 3],
      range: WIDE,
    })
    expect(inversionsWarning(config)).toContain('3rd inversion')
    expect(inversionsWarning(config)).toContain('four or more voices')
  })

  it('tells the user how much range the narrowest missing chord needs', () => {
    const config = settings({
      chords: ['major', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 68 },
    })
    expect(chordRangeWarning(config)).toBe(
      'The range is 8 semitones wide, but Dominant 13th needs 21. Widen the range or switch some chords off.',
    )
  })

  it('reports the narrowest shortfall when several chords do not fit', () => {
    const config = settings({
      chords: ['dominant-7th', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 64 },
    })
    // Dominant 7th spans 10, the 13th spans 21 — name the achievable one.
    expect(chordRangeWarning(config)).toContain('Dominant 7th needs 10')
  })

  it('ignores chords that are unplayable for reasons other than range', () => {
    // A triad in 3rd inversion is impossible at any range, so widening the
    // range would not rescue it and the range warning should stay silent.
    const config = settings({
      chords: ['major'],
      inversions: [3],
      range: WIDE,
    })
    expect(chordRangeWarning(config)).toBeNull()
  })
})

describe('isChordStuck', () => {
  it('is false for the defaults', () => {
    expect(isChordStuck(settings())).toBe(false)
  })

  it('is true for only-triads with only 3rd inversion', () => {
    expect(
      isChordStuck(
        settings({ chords: ['major', 'minor'], inversions: [3], range: WIDE }),
      ),
    ).toBe(true)
  })

  it('is true when the range is too narrow for anything enabled', () => {
    expect(
      isChordStuck(
        settings({ chords: ['major'], range: { low: 60, high: 63 } }),
      ),
    ).toBe(true)
  })

  it('is true when no play mode is selected', () => {
    expect(isChordStuck(settings({ playModes: [], range: WIDE }))).toBe(true)
  })
})
