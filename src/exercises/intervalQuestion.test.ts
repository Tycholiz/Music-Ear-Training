import { describe, expect, it } from 'vitest'
import { nameToMidi } from '../theory'
import type { IntervalPlayMode, IntervalSettings } from '../settings'
import { DEFAULT_INTERVAL_SETTINGS } from '../settings'
import {
  answerFor,
  candidateAnswers,
  canGenerate,
  gapForAnswer,
  generateIntervalQuestion,
  groupsForAnswerPreview,
  groupsForQuestion,
  isCorrect,
  isDescending,
  previewNotes,
  usablePlayModes,
} from './intervalQuestion'

function settings(overrides: Partial<IntervalSettings> = {}): IntervalSettings {
  return { ...DEFAULT_INTERVAL_SETTINGS, ...overrides }
}

/** Deterministic stand-in for Math.random, cycling through fixed values. */
function fixedRandom(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

const ALL_MODES: IntervalPlayMode[] = [
  'ascending',
  'descending',
  'harmonic',
  'ascending-harmonic',
  'descending-harmonic',
]

describe('isDescending', () => {
  it('covers both descending modes and nothing else', () => {
    expect(ALL_MODES.filter(isDescending)).toEqual([
      'descending',
      'descending-harmonic',
    ])
  })
})

describe('answerFor — the descending naming rule', () => {
  const C4 = nameToMidi('C4')

  it.each([
    ['B3', 1, 'Major 7th', 11],
    ['A3', 3, 'Major 6th', 9],
    ['F#3', 6, 'Tritone', 6],
    ['D3', 10, 'Major 2nd', 2],
    ['C#3', 11, 'Minor 2nd', 1],
    ['C3', 12, 'Octave', 12],
  ])('C4 down to %s (%i semitones) is a %s', (note, _gap, _name, expected) => {
    expect(answerFor(C4, nameToMidi(note), 'descending')).toBe(expected)
  })

  it('applies the same rule to descending-harmonic', () => {
    expect(answerFor(C4, nameToMidi('B3'), 'descending-harmonic')).toBe(11)
  })

  it('names ascending intervals by their actual distance', () => {
    expect(answerFor(C4, nameToMidi('B4'), 'ascending')).toBe(11)
    expect(answerFor(C4, nameToMidi('D5'), 'ascending')).toBe(14)
    expect(answerFor(C4, nameToMidi('C6'), 'ascending')).toBe(24)
  })

  it('distinguishes a Major 9th from a Major 2nd when ascending', () => {
    expect(answerFor(C4, nameToMidi('D4'), 'ascending')).toBe(2)
    expect(answerFor(C4, nameToMidi('D5'), 'ascending')).toBe(14)
  })

  it('names harmonic dyads by distance, like ascending', () => {
    expect(answerFor(C4, nameToMidi('G4'), 'harmonic')).toBe(7)
  })

  it('calls two identical notes a Unison in any mode', () => {
    for (const mode of ALL_MODES) {
      expect(answerFor(C4, C4, mode), mode).toBe(0)
    }
  })
})

describe('gapForAnswer', () => {
  it('is the answer itself when ascending', () => {
    expect(gapForAnswer(7, false)).toBe(7)
    expect(gapForAnswer(24, false)).toBe(24)
  })

  it('is the octave complement when descending', () => {
    expect(gapForAnswer(11, true)).toBe(1)
    expect(gapForAnswer(1, true)).toBe(11)
    expect(gapForAnswer(12, true)).toBe(12)
  })

  it('round trips against answerFor for every descending answer', () => {
    const first = nameToMidi('C5')
    for (let answer = 1; answer <= 12; answer++) {
      const second = first - gapForAnswer(answer, true)
      expect(answerFor(first, second, 'descending'), `answer ${answer}`).toBe(
        answer,
      )
    }
  })
})

describe('candidateAnswers', () => {
  it('offers the full range ascending', () => {
    const enabled = [1, 12, 13, 24]
    const result = candidateAnswers(
      'ascending',
      settings({ intervals: enabled, range: { low: 21, high: 108 } }),
    )
    expect(result).toEqual([1, 12, 13, 24])
  })

  it('drops compound intervals descending', () => {
    const result = candidateAnswers(
      'descending',
      settings({ intervals: [1, 12, 13, 24], range: { low: 21, high: 108 } }),
    )
    expect(result).toEqual([1, 12])
  })

  it('drops Unison descending, where it would read as an octave', () => {
    expect(
      candidateAnswers('descending', settings({ intervals: [0, 5] })),
    ).toEqual([5])
  })

  it('keeps Unison ascending and harmonic', () => {
    expect(
      candidateAnswers('ascending', settings({ intervals: [0, 5] })),
    ).toEqual([0, 5])
    expect(
      candidateAnswers('harmonic', settings({ intervals: [0, 5] })),
    ).toEqual([0, 5])
  })

  it('drops intervals wider than the range', () => {
    // One octave of headroom.
    const range = { low: 60, high: 72 }
    expect(
      candidateAnswers(
        'ascending',
        settings({ intervals: [7, 12, 13], range }),
      ),
    ).toEqual([7, 12])
  })

  it('measures the descending gap, not the answer, against the range', () => {
    // Six semitones of room. A Major 7th answer is a 1-semitone gap, so it
    // fits; a Minor 2nd answer is an 11-semitone gap, so it does not.
    const range = { low: 60, high: 66 }
    expect(
      candidateAnswers('descending', settings({ intervals: [1, 11], range })),
    ).toEqual([11])
  })
})

describe('usablePlayModes and canGenerate', () => {
  it('drops a mode that cannot produce anything', () => {
    // Only compound intervals enabled, so descending has no candidates.
    const config = settings({
      intervals: [13, 14],
      playModes: ['ascending', 'descending'],
      range: { low: 21, high: 108 },
    })
    expect(usablePlayModes(config)).toEqual(['ascending'])
    expect(canGenerate(config)).toBe(true)
  })

  it('reports that nothing can be generated when no mode works', () => {
    const config = settings({ intervals: [13], playModes: ['descending'] })
    expect(usablePlayModes(config)).toEqual([])
    expect(canGenerate(config)).toBe(false)
  })

  it('reports failure when the range is narrower than every interval', () => {
    const config = settings({
      intervals: [12],
      playModes: ['ascending'],
      range: { low: 60, high: 65 },
    })
    expect(canGenerate(config)).toBe(false)
  })
})

describe('generateIntervalQuestion', () => {
  it('throws rather than hanging when nothing can be generated', () => {
    expect(() =>
      generateIntervalQuestion(
        settings({ intervals: [13], playModes: ['descending'] }),
      ),
    ).toThrow(/No interval question can be generated/)
  })

  it('never picks a play mode that is disabled', () => {
    const config = settings({ playModes: ['harmonic'] })
    for (let i = 0; i < 200; i++) {
      expect(generateIntervalQuestion(config).playMode).toBe('harmonic')
    }
  })

  it('never picks a disabled interval', () => {
    const enabled = [3, 7, 12]
    const config = settings({
      intervals: enabled,
      playModes: ALL_MODES,
      range: { low: 40, high: 90 },
    })
    for (let i = 0; i < 500; i++) {
      expect(enabled).toContain(generateIntervalQuestion(config).answer)
    }
  })

  it('keeps both notes inside the range', () => {
    const range = { low: 48, high: 72 }
    const config = settings({
      intervals: [1, 5, 12, 13, 24],
      playModes: ALL_MODES,
      range,
    })
    for (let i = 0; i < 500; i++) {
      const { notes } = generateIntervalQuestion(config)
      for (const note of notes) {
        expect(note).toBeGreaterThanOrEqual(range.low)
        expect(note).toBeLessThanOrEqual(range.high)
      }
    }
  })

  it('never drops more than an octave below the reference note', () => {
    const config = settings({
      intervals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      playModes: ['descending', 'descending-harmonic'],
      range: { low: 21, high: 108 },
    })
    for (let i = 0; i < 500; i++) {
      const [first, second] = generateIntervalQuestion(config).notes
      expect(first - second).toBeGreaterThan(0)
      expect(first - second).toBeLessThanOrEqual(12)
    }
  })

  it('plays the second note above the reference when ascending', () => {
    const config = settings({ playModes: ['ascending'], intervals: [3, 7] })
    for (let i = 0; i < 200; i++) {
      const [first, second] = generateIntervalQuestion(config).notes
      expect(second).toBeGreaterThan(first)
    }
  })

  it('agrees with answerFor on every question it generates', () => {
    const config = settings({
      intervals: [0, 1, 5, 11, 12, 13, 24],
      playModes: ALL_MODES,
      range: { low: 36, high: 84 },
    })
    for (let i = 0; i < 1000; i++) {
      const question = generateIntervalQuestion(config)
      expect(
        answerFor(question.notes[0], question.notes[1], question.playMode),
      ).toBe(question.answer)
    }
  })

  it('eventually produces every enabled interval, leaving no dead options', () => {
    const enabled = [1, 6, 12, 18, 24]
    const config = settings({
      intervals: enabled,
      playModes: ['ascending'],
      range: { low: 36, high: 84 },
    })

    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      seen.add(generateIntervalQuestion(config).answer)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(enabled)
  })

  it('eventually uses every enabled play mode', () => {
    const config = settings({
      intervals: [3, 7],
      playModes: ALL_MODES,
      range: { low: 36, high: 84 },
    })

    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      seen.add(generateIntervalQuestion(config).playMode)
    }
    expect([...seen].sort()).toEqual([...ALL_MODES].sort())
  })

  it('is deterministic given a deterministic random source', () => {
    const config = settings({
      intervals: [3, 7],
      playModes: ['ascending'],
      range: { low: 60, high: 72 },
    })
    const first = generateIntervalQuestion(config, fixedRandom(0, 0, 0))
    const second = generateIntervalQuestion(config, fixedRandom(0, 0, 0))
    expect(first).toEqual(second)
    expect(first.notes[0]).toBe(60)
  })
})

describe('groupsForQuestion', () => {
  const notes = [60, 64] as const

  it.each([
    ['ascending', [[60], [64]]],
    ['descending', [[60], [64]]],
    ['harmonic', [[60, 64]]],
    ['ascending-harmonic', [[60], [64], [60, 64]]],
    ['descending-harmonic', [[60], [64], [60, 64]]],
  ])('shapes %s playback', (playMode, expected) => {
    expect(
      groupsForQuestion({
        notes,
        playMode: playMode as IntervalPlayMode,
        answer: 4,
      }),
    ).toEqual(expected)
  })

  it('plays notes in the order stored, so descending really descends', () => {
    expect(
      groupsForQuestion({
        notes: [64, 60],
        playMode: 'descending',
        answer: 8,
      }),
    ).toEqual([[64], [60]])
  })
})

describe('previewNotes', () => {
  const ascending = {
    notes: [60, 67] as const,
    playMode: 'ascending' as const,
    answer: 7,
  }

  it('reproduces the question exactly for the correct answer', () => {
    expect(previewNotes(ascending, 7)).toEqual([60, 67])
  })

  it('builds a wrong guess from the same reference note', () => {
    expect(previewNotes(ascending, 4)).toEqual([60, 64])
    expect(previewNotes(ascending, 12)).toEqual([60, 72])
  })

  it('goes downward for a descending question, using the gap not the answer', () => {
    // Descending, a Major 7th answer is one semitone below the reference.
    const descending = {
      notes: [60, 59] as const,
      playMode: 'descending' as const,
      answer: 11,
    }
    expect(previewNotes(descending, 11)).toEqual([60, 59])
    expect(previewNotes(descending, 1)).toEqual([60, 49])
    expect(previewNotes(descending, 12)).toEqual([60, 48])
  })

  it('handles Unison as both notes the same', () => {
    expect(previewNotes(ascending, 0)).toEqual([60, 60])
  })

  it('returns null when the guess would run off the piano', () => {
    const nearTheTop = {
      notes: [106, 108] as const,
      playMode: 'ascending' as const,
      answer: 2,
    }
    expect(previewNotes(nearTheTop, 24)).toBeNull()
    expect(previewNotes(nearTheTop, 2)).toEqual([106, 108])
  })

  it('is playable for every enabled answer of a generated question', () => {
    const config = settings({
      intervals: [0, 1, 7, 12, 13, 24],
      playModes: ALL_MODES,
      range: { low: 48, high: 72 },
    })
    for (let i = 0; i < 300; i++) {
      const question = generateIntervalQuestion(config)
      for (const answer of config.intervals) {
        // Well away from the ends of the keyboard, every answer the user
        // could press should be soundable.
        expect(previewNotes(question, answer), `${answer}`).not.toBeNull()
      }
    }
  })
})

describe('groupsForAnswerPreview', () => {
  it('follows the question play mode', () => {
    const harmonic = {
      notes: [60, 67] as const,
      playMode: 'harmonic' as const,
      answer: 7,
    }
    expect(groupsForAnswerPreview(harmonic, 4)).toEqual([[60, 64]])

    const combined = {
      notes: [60, 67] as const,
      playMode: 'ascending-harmonic' as const,
      answer: 7,
    }
    expect(groupsForAnswerPreview(combined, 4)).toEqual([[60], [64], [60, 64]])
  })

  it('is null when the guess is unplayable', () => {
    const nearTheTop = {
      notes: [106, 108] as const,
      playMode: 'ascending' as const,
      answer: 2,
    }
    expect(groupsForAnswerPreview(nearTheTop, 24)).toBeNull()
  })
})

describe('isCorrect', () => {
  const question = {
    notes: [60, 59] as const,
    playMode: 'descending' as const,
    answer: 11,
  }

  it('accepts the answer under the descending rule', () => {
    expect(isCorrect(question, 11)).toBe(true)
  })

  it('rejects the raw semitone distance', () => {
    expect(isCorrect(question, 1)).toBe(false)
  })
})
