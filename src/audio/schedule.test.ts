import { describe, expect, it } from 'vitest'
import { RELEASE_MS } from './piano'
import {
  MELODY_TIMING,
  PROGRESSION_TIMING,
  RING_OUT_MS,
  TIMING,
  buildMelodySchedule,
  buildProgressionSchedule,
  buildSchedule,
  scheduleDurationMs,
  scheduleEndMs,
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
  struck,
  type MelodyTiming,
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

/** Round numbers again. */
const melodyTiming: MelodyTiming = {
  onsetMs: 100,
  noteMs: 120,
  releaseMs: 200,
}

/** Just the melody layer — everything at the default gain. */
function melodyOf(notes: ReturnType<typeof buildMelodySchedule>) {
  return notes.filter((n) => n.gain === undefined)
}

/** Just the backing layer. */
function backingOf(notes: ReturnType<typeof buildMelodySchedule>) {
  return notes.filter((n) => n.gain !== undefined)
}

describe('scheduleEndMs', () => {
  it('is the end of the last note to stop, not the last to start', () => {
    expect(
      scheduleEndMs([
        { midi: 60, startMs: 0, durationMs: 1000 },
        { midi: 64, startMs: 100, durationMs: 200 },
      ]),
    ).toBe(1000)
  })

  it('is zero for an empty schedule', () => {
    expect(scheduleEndMs([])).toBe(0)
  })

  it('agrees with scheduleDurationMs on a note-group schedule', () => {
    const groups = sequenceThenSimultaneous([60, 64])
    expect(scheduleEndMs(buildSchedule(groups, timing))).toBe(
      scheduleDurationMs(groups, timing),
    )
  })
})

describe('buildMelodySchedule', () => {
  it('plays nothing for an empty melody', () => {
    expect(buildMelodySchedule({ melody: [] }, melodyTiming)).toEqual([])
    expect(
      buildMelodySchedule({ melody: [], backing: [60, 64, 67] }, melodyTiming),
    ).toEqual([])
  })

  it('spaces the melody one onset apart, in order', () => {
    const melody = melodyOf(
      buildMelodySchedule({ melody: [60, 62, 64] }, melodyTiming),
    )
    expect(melody.map((n) => n.midi)).toEqual([60, 62, 64])
    expect(melody.map((n) => n.startMs)).toEqual([0, 100, 200])
  })

  it('detaches the melody instead of holding it to the end', () => {
    // The whole reason this exists rather than reusing buildSchedule: eight
    // notes still ringing at the end is a cluster, not a phrase.
    const melody = melodyOf(
      buildMelodySchedule({ melody: [60, 62, 64, 65] }, melodyTiming),
    )
    for (const note of melody) expect(note.durationMs).toBe(120)

    const last = melody.at(-1)!
    for (const note of melody.slice(0, -1)) {
      expect(note.startMs + note.durationMs).toBeLessThan(
        last.startMs + last.durationMs,
      )
    }
  })

  it('overlaps consecutive notes slightly, so they join rather than click apart', () => {
    const [first, second] = melodyOf(
      buildMelodySchedule({ melody: [60, 62] }, melodyTiming),
    )
    expect(first.startMs + first.durationMs).toBeGreaterThan(second.startMs)
  })

  it('plays the melody unaccompanied when there is no backing', () => {
    const notes = buildMelodySchedule({ melody: [60, 62, 64] }, melodyTiming)
    expect(backingOf(notes)).toEqual([])
    expect(notes).toHaveLength(3)
  })

  it('starts the backing with the first melody note', () => {
    const backing = backingOf(
      buildMelodySchedule(
        { melody: [60, 62, 64], backing: [48, 52, 55] },
        melodyTiming,
      ),
    )
    const opening = backing.filter((n) => n.startMs === 0)
    expect(opening.map((n) => n.midi)).toEqual([48, 52, 55])
  })

  it('strikes the backing once and lets it ring', () => {
    // A chord arriving again part-way through is heard as a chord change,
    // which is the wrong thing to say when the point of the backing is that
    // home has not moved.
    const backing = backingOf(
      buildMelodySchedule(
        { melody: [60, 62, 64, 65, 67, 69], backing: [48] },
        melodyTiming,
      ),
    )
    expect(backing).toHaveLength(1)
    expect(backing[0].startMs).toBe(0)
  })

  it('sounds each backing note exactly once, however long the melody', () => {
    for (const length of [1, 4, 8, 16]) {
      const melody = Array.from({ length }, (_, i) => 60 + i)
      const backing = backingOf(
        buildMelodySchedule({ melody, backing: [48, 52, 55] }, melodyTiming),
      )
      expect(backing, `melody of ${length}`).toHaveLength(3)
      expect(new Set(backing.map((n) => n.startMs))).toEqual(new Set([0]))
    }
  })

  it('holds the backing under the whole melody', () => {
    const notes = buildMelodySchedule(
      { melody: [60, 62, 64, 65, 67, 69], backing: [48, 55] },
      melodyTiming,
    )
    const melodyEnd = scheduleEndMs(melodyOf(notes))
    for (const note of backingOf(notes)) {
      expect(note.startMs).toBe(0)
      expect(note.startMs + note.durationMs).toBeGreaterThan(melodyEnd)
    }
  })

  it('rings the backing on past the melody', () => {
    const notes = buildMelodySchedule(
      { melody: [60, 62], backing: [48] },
      melodyTiming,
    )
    expect(scheduleEndMs(notes)).toBe(
      scheduleEndMs(melodyOf(notes)) + melodyTiming.releaseMs,
    )
  })

  it('puts the backing below the melody in volume', () => {
    const notes = buildMelodySchedule(
      { melody: [60, 62], backing: [48, 55] },
      melodyTiming,
    )
    for (const note of backingOf(notes)) {
      expect(note.gain).toBeGreaterThan(0)
      expect(note.gain).toBeLessThan(1)
    }
    for (const note of melodyOf(notes)) {
      expect(note.gain).toBeUndefined()
    }
  })
})

describe('legato', () => {
  it('holds each note at full volume until the next one has begun', () => {
    // The choppiness: at 520ms a note started fading 180ms before its end,
    // 340ms in, while the next did not arrive until 460ms. Every note swelled
    // and died before its successor, so the line pulsed instead of joining up.
    // The handover has to happen while both are still at full volume.
    const notes = melodyOf(
      buildMelodySchedule({ melody: [60, 62, 64, 65, 67] }),
    )

    for (const [i, note] of notes.slice(0, -1).entries()) {
      const fadeBeginsAt = note.startMs + note.durationMs - RELEASE_MS
      expect(fadeBeginsAt, `note ${i}`).toBeGreaterThan(notes[i + 1].startMs)
    }
  })

  it('leaves the same headroom at any melody length', () => {
    for (const length of [3, 5, 8]) {
      const melody = Array.from({ length }, (_, i) => 60 + i)
      const notes = melodyOf(buildMelodySchedule({ melody }))
      for (const [i, note] of notes.slice(0, -1).entries()) {
        expect(
          note.startMs + note.durationMs - RELEASE_MS,
          `length ${length}, note ${i}`,
        ).toBeGreaterThan(notes[i + 1].startMs)
      }
    }
  })

  it('does not hold so long that the melody piles into a chord', () => {
    // Legato is not the pedal. Two notes may overlap; five must not.
    const notes = melodyOf(
      buildMelodySchedule({ melody: [60, 62, 64, 65, 67, 69, 71, 72] }),
    )
    const overlap = notes[0].durationMs / MELODY_TIMING.onsetMs
    expect(overlap).toBeLessThan(3)
  })
})

describe('buildProgressionSchedule', () => {
  const progressionTiming = { onsetMs: 900, chordMs: 1150 }

  const bare = (chords: number[][]) =>
    buildProgressionSchedule(chords, progressionTiming)

  const CHORDS = [
    [60, 64, 67],
    [59, 62, 67],
    [60, 64, 67],
  ]

  it('plays nothing for nothing', () => {
    expect(bare([])).toEqual([])
  })

  it('strikes each chord together, one onset apart', () => {
    const notes = bare(CHORDS)
    expect(notes.filter((n) => n.startMs === 0).map((n) => n.midi)).toEqual([
      60, 64, 67,
    ])
    expect([...new Set(notes.map((n) => n.startMs))]).toEqual([0, 900, 1800])
  })

  it('releases each chord as the next takes over', () => {
    // Not buildSchedule, which holds everything to the end — four triads under
    // that rule finish as a twelve-note cluster, and the user is asked to
    // identify four chords rather than the pile they add up to.
    const notes = bare(CHORDS)
    const first = notes.filter((n) => n.startMs === 0)

    for (const note of first) {
      expect(note.durationMs).toBe(1150)
      expect(note.ringOut).toBeFalsy()
    }
  })

  it('never has more than two chords sounding at once', () => {
    const notes = bare([CHORDS[0], CHORDS[1], CHORDS[2], CHORDS[0], CHORDS[1]])
    const melodyEnd = 4 * 900

    for (let at = 0; at < melodyEnd; at += 50) {
      const sounding = notes.filter(
        (n) => n.startMs <= at && n.startMs + n.durationMs > at,
      )
      // Three notes per chord, so six voices is two chords overlapping.
      expect(sounding.length, `at ${at}ms`).toBeLessThanOrEqual(6)
    }
  })

  it('holds each chord at full volume until the next has begun', () => {
    // The same rule the melody needed: a chord that began fading before its
    // successor struck would make a run of them pulse rather than move.
    const notes = bare(CHORDS)
    const onsets = [...new Set(notes.map((n) => n.startMs))].sort(
      (a, b) => a - b,
    )

    for (const [i, onset] of onsets.slice(0, -1).entries()) {
      const chord = notes.filter((n) => n.startMs === onset)
      const fadeBeginsAt = onset + chord[0].durationMs - RELEASE_MS
      expect(fadeBeginsAt, `chord ${i}`).toBeGreaterThan(onsets[i + 1])
    }
  })

  it('leaves the last chord ringing, because it is the cadence', () => {
    // The whole point of a cadence is the arrival, and cutting it off at a
    // scheduled length is where the sound being taken away is most obvious.
    const notes = bare(CHORDS)
    const last = notes.filter((n) => n.startMs === 1800)

    expect(last).toHaveLength(3)
    for (const note of last) expect(note.ringOut).toBe(true)
  })

  it('rings out a one-chord progression too', () => {
    for (const note of bare([CHORDS[0]])) {
      expect(note.ringOut).toBe(true)
    }
  })
})

describe('default PROGRESSION_TIMING', () => {
  it('changes chords more slowly than a melody moves', () => {
    // At a melody's pace a progression is a blur: a chord needs long enough to
    // be heard as a chord, with its quality settled, before the next arrives.
    expect(PROGRESSION_TIMING.onsetMs).toBeGreaterThan(MELODY_TIMING.onsetMs)
  })

  it('clears the release fade, so a run of chords does not pulse', () => {
    expect(PROGRESSION_TIMING.chordMs - RELEASE_MS).toBeGreaterThan(
      PROGRESSION_TIMING.onsetMs,
    )
  })
})

describe('struck', () => {
  it('sounds every note at once', () => {
    expect(struck([48, 52, 55]).map((n) => n.startMs)).toEqual([0, 0, 0])
  })

  it('asks to ring rather than be faded', () => {
    for (const note of struck([48, 52, 55])) {
      expect(note.ringOut).toBe(true)
    }
  })

  it('reports a length long enough to cover a piano note decaying', () => {
    for (const note of struck([48])) {
      expect(note.durationMs).toBe(RING_OUT_MS)
      expect(note.durationMs).toBeGreaterThan(TIMING.chordReleaseMs)
    }
  })

  it('plays nothing for nothing', () => {
    expect(struck([])).toEqual([])
  })
})

describe('default MELODY_TIMING', () => {
  it('moves faster than an interval question, so a run reads as a phrase', () => {
    expect(MELODY_TIMING.onsetMs).toBeLessThan(TIMING.onsetMs)
  })

  it('rings each note past the next onset', () => {
    expect(MELODY_TIMING.noteMs).toBeGreaterThan(MELODY_TIMING.onsetMs)
  })

  it('holds one backing chord under a realistic melody at the real timing', () => {
    const notes = buildMelodySchedule({
      melody: [60, 62, 64, 65, 67, 69, 71, 72],
      backing: [48, 52, 55],
    })
    const melodyEnd = scheduleEndMs(melodyOf(notes))

    expect(backingOf(notes)).toHaveLength(3)
    for (let at = 0; at < melodyEnd; at += 50) {
      const sounding = backingOf(notes).some(
        (n) => n.startMs <= at && n.startMs + n.durationMs > at,
      )
      expect(sounding, `nothing under the melody at ${at}ms`).toBe(true)
    }
  })
})
