import { describe, expect, it } from 'vitest'
import {
  HIGHEST_NOTE,
  LOWEST_NOTE,
  SAMPLED_NOTES,
  isPlayable,
  nearestSample,
  playbackRate,
  sampleUrl,
} from './samples'

describe('SAMPLED_NOTES', () => {
  it('is ascending with no duplicates', () => {
    expect([...SAMPLED_NOTES]).toEqual([...SAMPLED_NOTES].sort((a, b) => a - b))
    expect(new Set(SAMPLED_NOTES).size).toBe(SAMPLED_NOTES.length)
  })

  it('spans the full 88-key piano, A0 to C8', () => {
    expect(LOWEST_NOTE).toBe(21)
    expect(HIGHEST_NOTE).toBe(108)
  })

  it('never leaves a note more than a semitone from a sample', () => {
    for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++) {
      expect(
        Math.abs(nearestSample(midi) - midi),
        `note ${midi}`,
      ).toBeLessThanOrEqual(1)
    }
  })
})

describe('isPlayable', () => {
  it('accepts the endpoints and rejects just outside them', () => {
    expect(isPlayable(LOWEST_NOTE)).toBe(true)
    expect(isPlayable(HIGHEST_NOTE)).toBe(true)
    expect(isPlayable(LOWEST_NOTE - 1)).toBe(false)
    expect(isPlayable(HIGHEST_NOTE + 1)).toBe(false)
  })
})

describe('nearestSample', () => {
  it('returns a note exactly when it has its own sample', () => {
    for (const midi of SAMPLED_NOTES) {
      expect(nearestSample(midi)).toBe(midi)
    }
  })

  it('always returns a note that actually has a sample file', () => {
    for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++) {
      expect(SAMPLED_NOTES, `note ${midi}`).toContain(nearestSample(midi))
    }
  })

  it('breaks ties downward so gaps are pitched up, not down', () => {
    // 21 and 23 are sampled, 22 is not and is equidistant.
    expect(nearestSample(22)).toBe(21)
  })

  it('throws outside the piano range', () => {
    expect(() => nearestSample(20)).toThrow(RangeError)
    expect(() => nearestSample(109)).toThrow(RangeError)
  })
})

describe('playbackRate', () => {
  it('is 1 when the sample is already the right pitch', () => {
    expect(playbackRate(60, 60)).toBe(1)
  })

  it('doubles an octave up and halves an octave down', () => {
    expect(playbackRate(72, 60)).toBeCloseTo(2)
    expect(playbackRate(48, 60)).toBeCloseTo(0.5)
  })

  it('shifts a semitone by the twelfth root of two', () => {
    expect(playbackRate(61, 60)).toBeCloseTo(1.0594631)
  })

  it('stays within a semitone of unity for every playable note', () => {
    for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++) {
      const rate = playbackRate(midi, nearestSample(midi))
      expect(rate, `note ${midi}`).toBeGreaterThan(0.94)
      expect(rate, `note ${midi}`).toBeLessThan(1.06)
    }
  })
})

describe('sampleUrl', () => {
  it('points at the bundled mp3 for that note', () => {
    expect(sampleUrl(60)).toContain('samples/piano/60.mp3')
  })
})
