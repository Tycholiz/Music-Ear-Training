import { describe, expect, it } from 'vitest'
import {
  TIMING,
  buildSchedule,
  groupDurationMs,
  scheduleDurationMs,
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
  type Timing,
} from './schedule'

/** Round numbers so expectations read clearly. */
const timing: Timing = { noteMs: 100, chordMs: 200, gapMs: 10 }

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

describe('groupDurationMs', () => {
  it('rings a chord longer than a single note', () => {
    expect(groupDurationMs([60], timing)).toBe(100)
    expect(groupDurationMs([60, 64], timing)).toBe(200)
    expect(groupDurationMs([60, 64, 67], timing)).toBe(200)
  })
})

describe('buildSchedule', () => {
  it('sounds a lone note immediately', () => {
    expect(buildSchedule([[60]], timing)).toEqual([
      { midi: 60, startMs: 0, durationMs: 100 },
    ])
  })

  it('staggers a sequence by note length plus the gap', () => {
    expect(buildSchedule(sequence([60, 64]), timing)).toEqual([
      { midi: 60, startMs: 0, durationMs: 100 },
      { midi: 64, startMs: 110, durationMs: 100 },
    ])
  })

  it('starts every note of a harmonic group at the same instant', () => {
    const scheduled = buildSchedule(simultaneous([60, 64, 67]), timing)
    expect(scheduled.map((n) => n.startMs)).toEqual([0, 0, 0])
    expect(scheduled.map((n) => n.midi)).toEqual([60, 64, 67])
  })

  it('places the dyad after the sequence in the combined shape', () => {
    expect(buildSchedule(sequenceThenSimultaneous([60, 64]), timing)).toEqual([
      { midi: 60, startMs: 0, durationMs: 100 },
      { midi: 64, startMs: 110, durationMs: 100 },
      { midi: 60, startMs: 220, durationMs: 200 },
      { midi: 64, startMs: 220, durationMs: 200 },
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

  it('excludes the trailing gap', () => {
    expect(scheduleDurationMs([[60]], timing)).toBe(100)
    expect(scheduleDurationMs(sequence([60, 64]), timing)).toBe(210)
    expect(scheduleDurationMs(sequenceThenSimultaneous([60, 64]), timing)).toBe(
      420,
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
  it('gives chords longer than single notes and a short gap', () => {
    expect(TIMING.chordMs).toBeGreaterThan(TIMING.noteMs)
    expect(TIMING.gapMs).toBeGreaterThan(0)
    expect(TIMING.gapMs).toBeLessThan(TIMING.noteMs)
  })
})
