import { describe, expect, it } from 'vitest'
import { CHORDS, chordById, maxInversion, nameToMidi } from '../theory'
import { DEFAULT_CHORD_SETTINGS, type ChordSettings } from '../settings'
import {
  ALL_CHORD_IDS,
  acceptableAnswers,
  canGenerateChord,
  chordCandidates,
  chordRootPitch,
  generateChordQuestion,
  groupsForChordQuestion,
  isAmbiguous,
  isChordCorrect,
} from './chordQuestion'

function settings(overrides: Partial<ChordSettings> = {}): ChordSettings {
  return { ...DEFAULT_CHORD_SETTINGS, ...overrides }
}

const WIDE = { low: 21, high: 108 }

describe('chordCandidates', () => {
  it('pairs each enabled chord with each enabled inversion', () => {
    const config = settings({
      chords: ['major', 'dominant-7th'],
      inversions: [0, 1],
      range: WIDE,
    })
    expect(chordCandidates(config)).toHaveLength(4)
  })

  it('skips 3rd inversion for triads without dropping the triad', () => {
    const config = settings({
      chords: ['major'],
      inversions: [0, 3],
      range: WIDE,
    })
    const candidates = chordCandidates(config)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].inversion).toBe(0)
  })

  it('offers 3rd inversion once a chord has four voices', () => {
    const config = settings({
      chords: ['dominant-7th'],
      inversions: [3],
      range: WIDE,
    })
    expect(chordCandidates(config)).toHaveLength(1)
  })

  it('drops pairings too wide for the range', () => {
    // A 13th chord spans 21 semitones in root position.
    const config = settings({
      chords: ['major', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 72 },
    })
    expect(chordCandidates(config).map((c) => c.chord.id)).toEqual(['major'])
  })

  it('accounts for inversion when measuring the span, not just root position', () => {
    // A major triad spans 7 semitones at root and 8 in first inversion.
    const config = settings({
      chords: ['major'],
      inversions: [0, 1],
      range: { low: 60, high: 67 },
    })
    expect(chordCandidates(config).map((c) => c.inversion)).toEqual([0])
  })
})

describe('canGenerateChord', () => {
  it('accepts the defaults', () => {
    expect(canGenerateChord(settings())).toBe(true)
  })

  it('rejects only-triads with only 3rd inversion', () => {
    expect(
      canGenerateChord(
        settings({ chords: ['major', 'minor'], inversions: [3], range: WIDE }),
      ),
    ).toBe(false)
  })

  it('rejects a range too narrow for anything enabled', () => {
    expect(
      canGenerateChord(
        settings({ chords: ['major'], range: { low: 60, high: 63 } }),
      ),
    ).toBe(false)
  })

  it('rejects an empty play mode list', () => {
    expect(canGenerateChord(settings({ playModes: [], range: WIDE }))).toBe(
      false,
    )
  })
})

describe('generateChordQuestion', () => {
  it('throws rather than hanging when nothing can be generated', () => {
    expect(() =>
      generateChordQuestion(
        settings({ chords: ['major'], inversions: [3], range: WIDE }),
      ),
    ).toThrow(/No chord question can be generated/)
  })

  it('keeps every voice inside the range', () => {
    const range = { low: 48, high: 84 }
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range,
    })
    for (let i = 0; i < 1000; i++) {
      for (const note of generateChordQuestion(config).notes) {
        expect(note).toBeGreaterThanOrEqual(range.low)
        expect(note).toBeLessThanOrEqual(range.high)
      }
    }
  })

  it('never generates a disabled chord or inversion', () => {
    const config = settings({
      chords: ['major', 'minor-7th'],
      inversions: [0, 2],
      range: WIDE,
    })
    for (let i = 0; i < 500; i++) {
      const question = generateChordQuestion(config)
      expect(['major', 'minor-7th']).toContain(question.chordId)
      expect([0, 2]).toContain(question.inversion)
    }
  })

  it('never puts a triad in 3rd inversion', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 1000; i++) {
      const question = generateChordQuestion(config)
      expect(
        question.inversion,
        `${question.chordId} inv ${question.inversion}`,
      ).toBeLessThanOrEqual(maxInversion(chordById(question.chordId)))
    }
  })

  it('produces the right number of notes, lowest first', () => {
    const config = settings({ chords: ALL_CHORD_IDS, range: WIDE })
    for (let i = 0; i < 300; i++) {
      const question = generateChordQuestion(config)
      const chord = chordById(question.chordId)
      expect(question.notes).toHaveLength(chord.offsets.length)
      expect([...question.notes]).toEqual(
        [...question.notes].sort((a, b) => a - b),
      )
    }
  })

  it('eventually uses every enabled chord, inversion and play mode', () => {
    const config = settings({
      chords: ['major', 'dominant-7th'],
      inversions: [0, 1],
      playModes: ['block', 'arpeggiated'],
      range: WIDE,
    })

    const chords = new Set<string>()
    const inversions = new Set<number>()
    const modes = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const question = generateChordQuestion(config)
      chords.add(question.chordId)
      inversions.add(question.inversion)
      modes.add(question.playMode)
    }

    expect([...chords].sort()).toEqual(['dominant-7th', 'major'])
    expect([...inversions].sort()).toEqual([0, 1])
    expect([...modes].sort()).toEqual(['arpeggiated', 'block'])
  })

  it('always generates something its own answer checker accepts', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0, 1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 500; i++) {
      const question = generateChordQuestion(config)
      expect(isChordCorrect(question, question.chordId), question.chordId).toBe(
        true,
      )
    }
  })
})

describe('groupsForChordQuestion', () => {
  const base = {
    notes: [60, 64, 67],
    chordId: 'major',
    inversion: 0,
    root: 60,
  } as const

  it('sounds a block chord all at once', () => {
    expect(groupsForChordQuestion({ ...base, playMode: 'block' })).toEqual([
      [60, 64, 67],
    ])
  })

  it('sounds an arpeggio one note at a time, lowest first', () => {
    expect(
      groupsForChordQuestion({ ...base, playMode: 'arpeggiated' }),
    ).toEqual([[60], [64], [67]])
  })

  it('plays no reference tone when nothing enabled collides with it', () => {
    // A plain major triad, unambiguous among the default chord set.
    expect(
      groupsForChordQuestion({ ...base, playMode: 'block' }, ALL_CHORD_IDS),
    ).toEqual([[60, 64, 67]])
  })

  it('plays the root alone first when the chord is ambiguous', () => {
    // C6 root position collides with Am7 among these two enabled chords.
    const c6 = {
      notes: [60, 64, 67, 69],
      chordId: 'major-6th',
      inversion: 0,
      root: 60,
    } as const

    expect(
      groupsForChordQuestion({ ...c6, playMode: 'block' }, [
        'major-6th',
        'minor-7th',
      ]),
    ).toEqual([[60], [60, 64, 67, 69]])

    expect(
      groupsForChordQuestion({ ...c6, playMode: 'arpeggiated' }, [
        'major-6th',
        'minor-7th',
      ]),
    ).toEqual([[60], [60], [64], [67], [69]])
  })

  it('plays the root at its inverted pitch, not the bass note', () => {
    // C Eb G A is Cm6 root position, and also Am7b5 (half-diminished-7th)
    // first inversion — the same collision as the acceptableAnswers test
    // above, from the other chord's side. Root here is A (57), which the
    // inversion moves to 69: distinct from the bass note actually sounding
    // (60), which is what makes this worth a dedicated case.
    const am7flat5FirstInversion = {
      notes: [60, 63, 67, 69],
      chordId: 'half-diminished-7th',
      inversion: 1,
      root: 57,
      playMode: 'block' as const,
    }

    expect(
      isAmbiguous(am7flat5FirstInversion, ['minor-6th', 'half-diminished-7th']),
    ).toBe(true)
    expect(chordRootPitch(am7flat5FirstInversion)).toBe(69)
    expect(chordRootPitch(am7flat5FirstInversion)).not.toBe(
      am7flat5FirstInversion.notes[0],
    )

    expect(
      groupsForChordQuestion(am7flat5FirstInversion, [
        'minor-6th',
        'half-diminished-7th',
      ]),
    ).toEqual([[69], [60, 63, 67, 69]])
  })
})

describe('chordRootPitch', () => {
  it('is the lowest note when the chord is in root position', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [0],
      range: WIDE,
    })
    for (let i = 0; i < 300; i++) {
      const question = generateChordQuestion(config)
      expect(chordRootPitch(question)).toBe(question.notes[0])
    }
  })

  it('is exactly one octave above the root, for every inversion and chord size', () => {
    const config = settings({
      chords: ALL_CHORD_IDS,
      inversions: [1, 2, 3],
      range: WIDE,
    })
    for (let i = 0; i < 1000; i++) {
      const question = generateChordQuestion(config)
      expect(chordRootPitch(question)).toBe(question.root + 12)
      // It really is one of the pitches actually sounding, not an octave
      // that happens to fall outside the voicing.
      expect(question.notes).toContain(chordRootPitch(question))
    }
  })
})

describe('isAmbiguous', () => {
  it('is false when only one enabled chord matches', () => {
    const question = generateChordQuestion(
      settings({ chords: ['major'], inversions: [0], range: WIDE }),
    )
    expect(isAmbiguous(question, ['major'])).toBe(false)
  })

  it('is true for the C6 / Am7 collision when both are enabled', () => {
    const c6 = {
      notes: [60, 64, 67, 69],
      chordId: 'major-6th',
      inversion: 0,
      playMode: 'block' as const,
      root: 60,
    }
    expect(isAmbiguous(c6, ['major-6th', 'minor-7th'])).toBe(true)
  })

  it('is false for the same collision when only one side is enabled', () => {
    const c6 = {
      notes: [60, 64, 67, 69],
      chordId: 'major-6th',
      inversion: 0,
      playMode: 'block' as const,
      root: 60,
    }
    expect(isAmbiguous(c6, ['major-6th'])).toBe(false)
  })
})

describe('acceptableAnswers — collisions', () => {
  it('accepts both C6 and Am7 for the notes they share', () => {
    // C E G A is C6 in root position and Am7 in first inversion.
    const notes = [nameToMidi('C4'), 64, 67, 69]
    const answers = acceptableAnswers(notes, ALL_CHORD_IDS)
    expect(answers).toContain('major-6th')
    expect(answers).toContain('minor-7th')
  })

  it('accepts both Cm6 and Am7b5 for the notes they share', () => {
    // C Eb G A is Cm6 in root position and Am7b5 in first inversion.
    const notes = [nameToMidi('C4'), 63, 67, 69]
    const answers = acceptableAnswers(notes, ALL_CHORD_IDS)
    expect(answers).toContain('minor-6th')
    expect(answers).toContain('half-diminished-7th')
  })

  it('only offers answers the user has enabled', () => {
    const notes = [nameToMidi('C4'), 64, 67, 69]
    const answers = acceptableAnswers(notes, ['major-6th'])
    expect([...answers]).toEqual(['major-6th'])
  })

  it('accepts a symmetric diminished 7th in any of its inversions', () => {
    const notes = [nameToMidi('C4'), 63, 66, 69]
    expect(acceptableAnswers(notes, ALL_CHORD_IDS)).toContain('diminished-7th')
  })

  it('accepts the collision from the other side too', () => {
    // A C E G is Am7 in root position and C6 in third inversion — the same
    // four notes, so both stay correct whichever way round they are played.
    const notes = [nameToMidi('A3'), 60, 64, 67]
    const answers = acceptableAnswers(notes, ALL_CHORD_IDS)
    expect(answers).toContain('minor-7th')
    expect(answers).toContain('major-6th')
  })

  it('treats Sus2 and Sus4 as the same chord inverted, because they are', () => {
    // C D G is Csus2; the same pitches with G in the bass are Gsus4.
    const notes = [nameToMidi('C4'), 62, 67]
    const answers = acceptableAnswers(notes, ALL_CHORD_IDS)
    expect(answers).toContain('sus2')
    expect(answers).toContain('sus4')
  })

  it('rejects a voicing whose bass no inversion could produce', () => {
    // Add9 puts its 9th an octave up, so no inversion ever brings D to the
    // bottom. D E G C shares Cadd9's pitch classes but is not that chord.
    const cAdd9 = [60, 64, 67, 74]
    expect(acceptableAnswers(cAdd9, ALL_CHORD_IDS)).toContain('add9')

    const dInTheBass = [62, 64, 67, 72]
    expect(acceptableAnswers(dInTheBass, ALL_CHORD_IDS)).not.toContain('add9')
  })

  it('rejects a chord that shares no pitches', () => {
    const cMajor = [60, 64, 67]
    expect(acceptableAnswers(cMajor, ALL_CHORD_IDS)).not.toContain('minor')
  })

  it('matches a plain major triad in every register', () => {
    for (const root of [36, 48, 60, 72, 84]) {
      expect(
        acceptableAnswers([root, root + 4, root + 7], ALL_CHORD_IDS),
        `root ${root}`,
      ).toContain('major')
    }
  })

  it('accepts nothing when the user has enabled nothing', () => {
    expect(acceptableAnswers([60, 64, 67], []).size).toBe(0)
  })

  it('finds at least one answer for every chord in the table', () => {
    // Nothing in the table should be unrecognisable by its own checker.
    for (const chord of CHORDS) {
      const notes = chord.offsets.map((offset) => 60 + offset)
      expect(acceptableAnswers(notes, ALL_CHORD_IDS), chord.name).toContain(
        chord.id,
      )
    }
  })
})

describe('isChordCorrect', () => {
  // C6 root position — notes shared with Am7 first inversion, which is
  // exactly the case the root reference tone exists to resolve.
  const question = {
    notes: [60, 64, 67, 69],
    chordId: 'major-6th',
    inversion: 0,
    playMode: 'block',
    root: 60,
  } as const

  it('accepts the generated chord', () => {
    expect(isChordCorrect(question, 'major-6th')).toBe(true)
  })

  it('rejects a chord that only collides by pitch, even though it is enabled', () => {
    // With the root played first, the listener has enough to tell C6 from
    // Am7 — so unlike acceptableAnswers, only one of them is correct here.
    expect(isChordCorrect(question, 'minor-7th')).toBe(false)
  })

  it('rejects a genuinely different chord', () => {
    expect(isChordCorrect(question, 'major')).toBe(false)
  })
})
