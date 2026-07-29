import { describe, expect, it } from 'vitest'
import {
  BACKING_NAMES,
  MELODY_LENGTHS,
  featuredWarning,
  isMelodyStuck,
  melodyRangeWarning,
  melodyStuckReason,
} from './melodyValidation'
import {
  DEFAULT_MELODY_SETTINGS,
  MELODY_BACKINGS,
  type MelodySettings,
} from '../settings'

function settingsWith(overrides: Partial<MelodySettings> = {}): MelodySettings {
  return { ...DEFAULT_MELODY_SETTINGS, ...overrides }
}

describe('MELODY_LENGTHS', () => {
  it('runs from the shortest melody with a shape to the longest worth asking', () => {
    expect(MELODY_LENGTHS).toEqual([3, 4, 5, 6, 7, 8])
  })

  it('contains the default, so the setting is always reachable', () => {
    expect(MELODY_LENGTHS).toContain(DEFAULT_MELODY_SETTINGS.length)
  })
})

describe('BACKING_NAMES', () => {
  it('names every backing the settings allow', () => {
    for (const backing of MELODY_BACKINGS) {
      expect(BACKING_NAMES[backing]).toBeTruthy()
    }
  })
})

describe('melodyRangeWarning', () => {
  it('says nothing when an octave fits', () => {
    expect(melodyRangeWarning(settingsWith())).toBeNull()
    expect(
      melodyRangeWarning(settingsWith({ range: { low: 60, high: 72 } })),
    ).toBeNull()
  })

  it('says how much more room is needed, not just that there is too little', () => {
    const warning = melodyRangeWarning(
      settingsWith({ range: { low: 60, high: 67 } }),
    )
    expect(warning).toMatch(/7 semitones/)
    expect(warning).toMatch(/5 more/)
  })

  it('reads properly when the range is a single semitone', () => {
    expect(
      melodyRangeWarning(settingsWith({ range: { low: 60, high: 61 } })),
    ).toMatch(/1 semitone wide/)
  })
})

describe('featuredWarning', () => {
  it('says nothing when everything featured can fit', () => {
    expect(
      featuredWarning(
        settingsWith({ scaleId: 'major', featured: [0, 4], length: 5 }),
      ),
    ).toBeNull()
  })

  it('says nothing when nothing is featured', () => {
    expect(featuredWarning(settingsWith({ featured: [] }))).toBeNull()
  })

  it('allows exactly as many featured degrees as there are notes', () => {
    expect(
      featuredWarning(
        settingsWith({ scaleId: 'major', featured: [0, 4, 7], length: 3 }),
      ),
    ).toBeNull()
  })

  it('names the degrees that cannot all fit', () => {
    const warning = featuredWarning(
      settingsWith({ scaleId: 'major', featured: [0, 4, 7, 11], length: 3 }),
    )
    expect(warning).toMatch(/1, 3, 5, 7/)
    expect(warning).toMatch(/3 notes long/)
  })

  it('counts a degree listed twice only once', () => {
    expect(
      featuredWarning(
        settingsWith({ scaleId: 'major', featured: [4, 4], length: 1 }),
      ),
    ).toBeNull()
  })
})

describe('melodyStuckReason', () => {
  it('says nothing when the settings work', () => {
    expect(melodyStuckReason(settingsWith())).toBeNull()
  })

  it('blames the range when the range is the problem', () => {
    expect(
      melodyStuckReason(settingsWith({ range: { low: 60, high: 64 } })),
    ).toMatch(/A melody spans an octave/)
  })

  it('blames the featured degrees when they are the problem', () => {
    expect(
      melodyStuckReason(
        settingsWith({ scaleId: 'major', featured: [0, 4, 7, 11], length: 3 }),
      ),
    ).toMatch(/cannot all appear/)
  })

  it('explains a featured degree the scale does not have', () => {
    // Unreachable through the UI, since choosing a scale reconciles them and
    // the store drops them on read. A hand-edited blob can still get here, and
    // saying so beats a blank exercise screen.
    expect(
      melodyStuckReason(settingsWith({ scaleId: 'major', featured: [10] })),
    ).toMatch(/b7 cannot be featured: Major does not contain it/)
  })

  it('gives a reason for every way of being stuck', () => {
    const stuck = [
      settingsWith({ range: { low: 60, high: 64 } }),
      settingsWith({ scaleId: 'major', featured: [0, 2, 4, 5], length: 3 }),
      settingsWith({ scaleId: 'major', featured: [10] }),
      settingsWith({ scaleId: 'nonesuch' }),
    ]

    for (const settings of stuck) {
      expect(isMelodyStuck(settings)).toBe(true)
      expect(melodyStuckReason(settings)).toBeTruthy()
    }
  })
})
