import { describe, expect, it } from 'vitest'
import { DEFAULT_CHORD_SETTINGS, type ChordSettings } from '../settings'
import { chordById, midiToName, nameToMidi, pitchClass } from '../theory'
import { ALL_CHORD_IDS } from './chordQuestion'
import {
  generateRootQuestion,
  groupsForRootQuestion,
  matchesRoot,
  rootAnswer,
  type RootQuestion,
} from './rootQuestion'

function settings(overrides: Partial<ChordSettings> = {}): ChordSettings {
  return { ...DEFAULT_CHORD_SETTINGS, ...overrides }
}

const WIDE = { low: 21, high: 108 }

/** C major, root position: C E G. */
const C_MAJOR: RootQuestion = {
  notes: [60, 64, 67],
  chordId: 'major',
  inversion: 0,
  playMode: 'block',
  root: 60,
}

/** C major, first inversion: E G C. The root is the top note, not the bass. */
const C_MAJOR_INVERTED: RootQuestion = {
  notes: [64, 67, 72],
  chordId: 'major',
  inversion: 1,
  playMode: 'block',
  root: 60,
}

describe('rootAnswer', () => {
  it('is the bass note in root position', () => {
    expect(rootAnswer(C_MAJOR)).toBe(60)
    expect(rootAnswer(C_MAJOR)).toBe(C_MAJOR.notes[0])
  })

  it('is not the bass note once inverted', () => {
    // E G C: the bass is E, but the chord is still a C.
    expect(rootAnswer(C_MAJOR_INVERTED)).toBe(72)
    expect(rootAnswer(C_MAJOR_INVERTED)).not.toBe(C_MAJOR_INVERTED.notes[0])
    expect(midiToName(rootAnswer(C_MAJOR_INVERTED))).toBe('C5')
  })

  it('is always one of the notes actually sounding', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 500; i++) {
      const question = generateRootQuestion(config)
      expect(question.notes, question.chordId).toContain(rootAnswer(question))
    }
  })
})

describe('matchesRoot', () => {
  it('accepts the root at its written pitch', () => {
    expect(matchesRoot(60, C_MAJOR)).toBe(true)
  })

  it('accepts the root in any octave', () => {
    // The whole point: a bass cannot hum C6 and a soprano cannot hum C2.
    for (const octave of [24, 36, 48, 60, 72, 84, 96]) {
      expect(matchesRoot(octave, C_MAJOR), `${octave}`).toBe(true)
    }
  })

  it('rejects a different note', () => {
    expect(matchesRoot(64, C_MAJOR)).toBe(false)
    expect(matchesRoot(67, C_MAJOR)).toBe(false)
    expect(matchesRoot(61, C_MAJOR)).toBe(false)
  })

  it('wants the root, not the bass note, of an inverted chord', () => {
    expect(matchesRoot(60, C_MAJOR_INVERTED)).toBe(true)
    // E is the lowest note sounding, and is not the answer.
    expect(matchesRoot(64, C_MAJOR_INVERTED)).toBe(false)
  })

  it('tolerates being up to half a semitone out of tune', () => {
    // Identifying the note is the exercise; singing it in tune is not.
    expect(matchesRoot(60.4, C_MAJOR)).toBe(true)
    expect(matchesRoot(59.6, C_MAJOR)).toBe(true)
  })

  it('stops tolerating once the note is closer to its neighbour', () => {
    expect(matchesRoot(60.6, C_MAJOR)).toBe(false)
    expect(matchesRoot(59.4, C_MAJOR)).toBe(false)
  })

  it('accepts an octave-error detection, which is why octaves are ignored', () => {
    // Autocorrelation sometimes locks onto a harmonic. Octave-agnostic
    // matching means that failure mode never reaches the user.
    expect(matchesRoot(rootAnswer(C_MAJOR) + 12, C_MAJOR)).toBe(true)
    expect(matchesRoot(rootAnswer(C_MAJOR) - 12, C_MAJOR)).toBe(true)
  })

  it('accepts its own answer for every question it generates', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 500; i++) {
      const question = generateRootQuestion(config)
      const answer = rootAnswer(question)
      expect(matchesRoot(answer, question), question.chordId).toBe(true)
      // And in a register the user could actually sing.
      expect(matchesRoot(pitchClass(answer) + 48, question)).toBe(true)
    }
  })

  it('rejects every other pitch class, for every generated question', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 100; i++) {
      const question = generateRootQuestion(config)
      const rootClass = pitchClass(rootAnswer(question))
      for (let offset = 1; offset < 12; offset++) {
        expect(
          matchesRoot(60 + ((rootClass + offset) % 12), question),
          `${question.chordId} +${offset}`,
        ).toBe(false)
      }
    }
  })
})

describe('groupsForRootQuestion', () => {
  it('sounds a block chord all at once', () => {
    expect(groupsForRootQuestion(C_MAJOR)).toEqual([[60, 64, 67]])
  })

  it('sounds an arpeggio one note at a time', () => {
    expect(
      groupsForRootQuestion({ ...C_MAJOR, playMode: 'arpeggiated' }),
    ).toEqual([[60], [64], [67]])
  })

  it('never gives the answer away with a reference tone', () => {
    // The chord exercise prepends the root whenever several enabled chords
    // share the same notes. Here that would announce the answer before asking
    // the question, so this exercise plays the chord and nothing else.
    const c6 = {
      notes: [nameToMidi('C4'), 64, 67, 69],
      chordId: 'major-6th',
      inversion: 0,
      playMode: 'block',
      root: nameToMidi('C4'),
    } as const

    const groups = groupsForRootQuestion(c6)
    expect(groups).toEqual([[60, 64, 67, 69]])
    expect(groups[0]).not.toHaveLength(1)
  })

  it('plays every note of the chord and nothing more', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 300; i++) {
      const question = generateRootQuestion(config)
      const sounded = groupsForRootQuestion(question).flat()
      expect(sounded.length, question.chordId).toBe(
        chordById(question.chordId).offsets.length,
      )
      expect([...sounded].sort((a, b) => a - b)).toEqual([...question.notes])
    }
  })
})
