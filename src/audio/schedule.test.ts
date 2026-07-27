import { describe, expect, it } from 'vitest'
import {
  TIMING,
  buildSchedule,
  scheduleDurationMs,
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
  type Timing,
} from './schedule'

/** Round numbers so expectations read clearly. */
const timing: Timing = { onsetMs: 100, releaseMs: 200, chordReleaseMs: 300 }

describe('shape helpers', () => {
  it('builds the ascending and descending interval shapes', () => {
    expect(sequence([60, 64])).toEqual([[60], [64]])
    expect(sequence([64, 60])).toEqual([[64], [60]])
  })

  it('builds the harmonic shape', () => {
    expect(simultaneous([60, 64])).toEqual([[60, 64]])
  })

  it('builds the two combined interval shapes', () => {
    expect(sequenceThenSimultaneous([60, 64])).toEqual([[60], [64], [60, 64]])
    expect(sequenceThenSimultaneous([64, 60])).toEqual([[64], [60], [64, 60]])
  })

  it('builds block and arpeggiated chord shapes', () => {
    expect(simultaneous([60, 64, 67])).toEqual([[60, 64, 67]])
    expect(sequence([60, 64, 67])).toEqual([[60], [64], [67]])
  })
})

describe('buildSchedule', () => {
  it('sounds a lone note immediately', () => {
    expect(buildSchedule([[60]], timing)).toEqual([
      { midi: 60, startMs: 0, durationMs: 200 },
    ])
  })

  it('staggers a sequence by the onset interval', () => {
    expect(
      buildSchedule(sequence([60, 64]), timing).map((n) => n.startMs),
    ).toEqual([0, 100])
  })

  it('holds every note of a sequence until the phrase ends, like a pedal', () => {
    // The first note is still sounding when the second is struck, and both
    // stop together — that is what makes an arpeggio accumulate into a chord
    // rather than sound as separate notes.
    expect(buildSchedule(sequence([60, 64, 67]), timing)).toEqual([
      { midi: 60, startMs: 0, durationMs: 400 },
      { midi: 64, startMs: 100, durationMs: 300 },
      { midi: 67, startMs: 200, durationMs: 200 },
    ])
  })

  it('ends every note of a phrase at the same instant', () => {
    const ends = buildSchedule(sequence([60, 64, 67]), timing).map(
      (n) => n.startMs + n.durationMs,
    )
    expect(new Set(ends).size).toBe(1)
  })

  it('overlaps successive notes rather than leaving silence between them', () => {
    const [first, second] = buildSchedule(sequence([60, 64]), timing)
    expect(first.startMs + first.durationMs).toBeGreaterThan(second.startMs)
  })

  it('starts every note of a harmonic group at the same instant', () => {
    const scheduled = buildSchedule(simultaneous([60, 64, 67]), timing)
    expect(scheduled.map((n) => n.startMs)).toEqual([0, 0, 0])
    expect(scheduled.map((n) => n.midi)).toEqual([60, 64, 67])
  })

  it('rings longer when the phrase ends on a chord than on a single note', () => {
    expect(buildSchedule(simultaneous([60, 64]), timing)[0].durationMs).toBe(
      300,
    )
    expect(buildSchedule([[60]], timing)[0].durationMs).toBe(200)
  })

  it('carries the sequence under the closing dyad in the combined shape', () => {
    expect(buildSchedule(sequenceThenSimultaneous([60, 64]), timing)).toEqual([
      { midi: 60, startMs: 0, durationMs: 500 },
      { midi: 64, startMs: 100, durationMs: 400 },
      { midi: 60, startMs: 200, durationMs: 300 },
      { midi: 64, startMs: 200, durationMs: 300 },
    ])
  })

  it('handles an empty schedule', () => {
    expect(buildSchedule([], timing)).toEqual([])
  })

  it('never schedules a note before playback starts', () => {
    for (const note of buildSchedule(sequenceThenSimultaneous([60, 64]))) {
      expect(note.startMs).toBeGreaterThanOrEqual(0)
      expect(note.durationMs).toBeGreaterThan(0)
    }
  })
})

describe('scheduleDurationMs', () => {
  it('is zero for nothing to play', () => {
    expect(scheduleDurationMs([], timing)).toBe(0)
  })

  it('runs from the first onset to the pedal lifting', () => {
    expect(scheduleDurationMs([[60]], timing)).toBe(200)
    expect(scheduleDurationMs(sequence([60, 64]), timing)).toBe(300)
    expect(scheduleDurationMs(sequenceThenSimultaneous([60, 64]), timing)).toBe(
      500,
    )
  })

  it('agrees with the end of the last scheduled note', () => {
    const groups = sequenceThenSimultaneous([60, 64])
    const scheduled = buildSchedule(groups, timing)
    const lastEnd = Math.max(...scheduled.map((n) => n.startMs + n.durationMs))
    expect(scheduleDurationMs(groups, timing)).toBe(lastEnd)
  })
})

describe('default TIMING', () => {
  it('rings on past each onset, so notes overlap', () => {
    expect(TIMING.releaseMs).toBeGreaterThan(0)
    expect(TIMING.chordReleaseMs).toBeGreaterThan(TIMING.releaseMs)
    expect(TIMING.onsetMs).toBeGreaterThan(0)
  })

  it('sustains a real sequence into an overlap', () => {
    const [first, second] = buildSchedule(sequence([60, 64]))
    expect(first.startMs + first.durationMs).toBeGreaterThan(second.startMs)
  })
})
