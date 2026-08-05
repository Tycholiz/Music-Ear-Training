import { describe, expect, it } from 'vitest'
import {
  keyChord,
  voiceGuess,
  voiceMovement,
  voiceProgression,
  voicingsFor,
} from './progressionVoicing'
import {
  generateProgressionQuestion,
  type ProgressionQuestion,
} from './progressionQuestion'
import {
  DEFAULT_PROGRESSION_SETTINGS,
  type ProgressionSettings,
} from '../settings'
import {
  CADENCES,
  NUMERALS,
  chordNotes,
  numeralById,
  numeralChord,
  numeralRoot,
  pitchClass,
} from '../theory'
import { isPlayable } from '../audio'

function settingsWith(
  overrides: Partial<ProgressionSettings> = {},
): ProgressionSettings {
  return { ...DEFAULT_PROGRESSION_SETTINGS, ...overrides }
}

/** Everything on, so the voicing is exercised across the whole vocabulary. */
function wideOpen(overrides: Partial<ProgressionSettings> = {}) {
  return settingsWith({
    numerals: NUMERALS.map((n) => n.id),
    cadences: [...CADENCES],
    length: 6,
    ...overrides,
  })
}

function sample(settings: ProgressionSettings, count = 100) {
  return Array.from({ length: count }, () =>
    generateProgressionQuestion(settings),
  )
}

/** Total voice movement across a whole voiced progression. */
function totalMovement(groups: readonly (readonly number[])[]): number {
  return groups
    .slice(1)
    .reduce((sum, chord, i) => sum + voiceMovement(groups[i], chord), 0)
}

/** What the same progression would cost as root-position block chords. */
function rootPositionMovement(question: ProgressionQuestion): number {
  const groups = question.numerals.map((id) => {
    const numeral = numeralById(id)
    return chordNotes(
      numeralRoot(numeral, question.tonic),
      numeralChord(numeral),
      0,
    )
  })
  return totalMovement(groups)
}

describe('voiceMovement', () => {
  it('is nothing when the chord does not change', () => {
    expect(voiceMovement([60, 64, 67], [60, 64, 67])).toBe(0)
  })

  it('charges nothing for a common tone held', () => {
    // C major to A minor share C and E; only the G has to move.
    expect(voiceMovement([60, 64, 67], [60, 64, 69])).toBe(2)
  })

  it('adds up what every voice travels', () => {
    expect(voiceMovement([60, 64, 67], [62, 65, 69])).toBe(2 + 1 + 2)
  })

  it('pairs the voices in pitch order, not the order they were given', () => {
    expect(voiceMovement([67, 60, 64], [64, 67, 60])).toBe(0)
  })
})

describe('voiceProgression', () => {
  it('voices one chord per numeral, in order', () => {
    for (const question of sample(wideOpen(), 40)) {
      const groups = voiceProgression(question, wideOpen())
      expect(groups).toHaveLength(question.numerals.length)
      for (const chord of groups) expect(chord).toHaveLength(3)
    }
  })

  it('plays the chords the numerals name, whatever the inversion', () => {
    // An inversion changes which note is lowest, not which notes are there.
    const settings = wideOpen()
    for (const question of sample(settings, 60)) {
      const groups = voiceProgression(question, settings)

      for (const [i, chord] of groups.entries()) {
        const numeral = numeralById(question.numerals[i])
        const expected = new Set(
          chordNotes(
            numeralRoot(numeral, question.tonic),
            numeralChord(numeral),
            0,
          ).map(pitchClass),
        )
        expect(new Set(chord.map(pitchClass)), numeral.label).toEqual(expected)
      }
    }
  })

  it('picks the least-moving voicing available at every step', () => {
    // The contract, asserted exactly: what it chose has to be as good as
    // anything it could have chosen instead. Comparing totals against a naive
    // baseline is not enough — an arbitrary but range-legal choice beats
    // fixed-octave root position by accident, so a test written that way passes
    // for a voicing that is doing no leading at all.
    const settings = wideOpen({ length: 8 })

    for (const question of sample(settings, 100)) {
      const groups = voiceProgression(question, settings)

      for (const [i, chord] of groups.slice(1).entries()) {
        const previous = groups[i]
        const options = voicingsFor(
          numeralById(question.numerals[i + 1]),
          question.tonic,
          settings,
        )
        const lowest = Math.min(
          ...options.map((option) => voiceMovement(previous, option)),
        )
        expect(
          voiceMovement(previous, chord),
          `${question.numerals[i]} → ${question.numerals[i + 1]}`,
        ).toBe(lowest)
      }
    }
  })

  it('moves the voices far less than root-position block chords would', () => {
    // Measured at about 25 semitones per eight-chord progression against 98.
    const settings = wideOpen({ length: 8 })
    let voiced = 0
    let root = 0

    for (const question of sample(settings, 200)) {
      voiced += totalMovement(voiceProgression(question, settings))
      root += rootPositionMovement(question)
    }

    expect(voiced).toBeLessThan(root / 2)
  })

  it('never lurches on a single chord change', () => {
    // Total movement can be low while one change is still ugly, and a single
    // lurch is what a listener actually notices. Measured at 9 semitones
    // across three voices at worst, against 33 for root position alone.
    const settings = wideOpen({ length: 8 })

    for (const question of sample(settings, 200)) {
      const groups = voiceProgression(question, settings)
      for (const [i, chord] of groups.slice(1).entries()) {
        expect(voiceMovement(groups[i], chord)).toBeLessThan(15)
      }
    }
  })

  it('keeps every note inside the range', () => {
    const range = { low: 48, high: 79 }
    const settings = wideOpen({ range, length: 8 })

    for (const question of sample(settings, 100)) {
      for (const chord of voiceProgression(question, settings)) {
        for (const note of chord) {
          expect(note).toBeGreaterThanOrEqual(range.low)
          expect(note).toBeLessThanOrEqual(range.high)
        }
      }
    }
  })

  it('keeps every note on the piano', () => {
    for (const question of sample(wideOpen({ length: 8 }), 60)) {
      for (const chord of voiceProgression(question, wideOpen({ length: 8 }))) {
        for (const note of chord) expect(isPlayable(note)).toBe(true)
      }
    }
  })

  it('uses only the inversions that are enabled', () => {
    // Root position puts the root lowest; the others do not.
    const settings = wideOpen({ inversions: [0], length: 6 })

    for (const question of sample(settings, 60)) {
      const groups = voiceProgression(question, settings)
      for (const [i, chord] of groups.entries()) {
        const numeral = numeralById(question.numerals[i])
        const lowest = Math.min(...chord)
        expect(pitchClass(lowest), numeral.label).toBe(
          pitchClass(numeralRoot(numeral, question.tonic)),
        )
      }
    }
  })

  it('still voices a progression with root position alone', () => {
    const settings = wideOpen({ inversions: [0], length: 6 })
    for (const question of sample(settings, 40)) {
      const groups = voiceProgression(question, settings)
      expect(groups).toHaveLength(question.numerals.length)
    }
  })

  it('gains from being allowed more inversions, not less', () => {
    const length = 8
    const open = wideOpen({ inversions: [0, 1, 2], length })
    const closed = wideOpen({ inversions: [0], length })

    let withInversions = 0
    let rootOnly = 0
    for (const question of sample(open, 200)) {
      withInversions += totalMovement(voiceProgression(question, open))
      rootOnly += totalMovement(voiceProgression(question, closed))
    }

    expect(withInversions).toBeLessThan(rootOnly)
  })

  it('places the opening chord near the middle of the range', () => {
    // It has nothing to lead from, and starting at an edge leaves the
    // progression nowhere to go but back.
    const range = { low: 48, high: 84 }
    const middle = (range.low + range.high) / 2
    const settings = wideOpen({ range, length: 4 })

    for (const question of sample(settings, 60)) {
      const [first] = voiceProgression(question, settings)
      const mean = first.reduce((s, n) => s + n, 0) / first.length
      expect(Math.abs(mean - middle)).toBeLessThan(9)
    }
  })

  it('is deterministic for the same question and settings', () => {
    // Nothing random here: the voicing follows from the progression, so the
    // same progression must sound the same twice.
    const settings = wideOpen()
    const [question] = sample(settings, 1)
    expect(voiceProgression(question, settings)).toEqual(
      voiceProgression(question, settings),
    )
  })
})

describe('voiceGuess', () => {
  it('sounds a right guess exactly as the progression played it', () => {
    // The point of the whole function: a user comparing what they pressed
    // against what they heard must be comparing the same arrangement, or the
    // right chord in the wrong register reads as the wrong chord.
    const settings = wideOpen({ length: 6 })

    for (const question of sample(settings, 100)) {
      const groups = voiceProgression(question, settings)

      for (const [index, id] of question.numerals.entries()) {
        expect(
          voiceGuess(question, index, id, settings),
          `${id} at ${index}`,
        ).toEqual(groups[index])
      }
    }
  })

  it('puts a wrong guess in the register the progression is in', () => {
    // So what differs between what they pressed and what they heard is the
    // harmony rather than the arrangement.
    const settings = wideOpen({ length: 6 })

    for (const question of sample(settings, 60)) {
      const groups = voiceProgression(question, settings)

      for (let index = 1; index < question.numerals.length; index++) {
        for (const wrong of settings.numerals) {
          if (wrong === question.numerals[index]) continue

          const guess = voiceGuess(question, index, wrong, settings)
          // No further from the chord before it than the real answer's own
          // candidates could manage — it is chosen by the same rule.
          const options = voicingsFor(
            numeralById(wrong),
            question.tonic,
            settings,
          )
          const lowest = Math.min(
            ...options.map((o) => voiceMovement(groups[index - 1], o)),
          )
          expect(voiceMovement(groups[index - 1], guess)).toBe(lowest)
        }
      }
    }
  })

  it('places the opening guess by register, as the progression does', () => {
    const settings = wideOpen({ length: 4 })
    for (const question of sample(settings, 40)) {
      const [first] = voiceProgression(question, settings)
      expect(voiceGuess(question, 0, question.numerals[0], settings)).toEqual(
        first,
      )
    }
  })

  it('keeps a guess inside the range and on the piano', () => {
    const range = { low: 48, high: 79 }
    const settings = wideOpen({ range, length: 6 })

    for (const question of sample(settings, 40)) {
      for (let index = 0; index < question.numerals.length; index++) {
        for (const id of settings.numerals) {
          for (const note of voiceGuess(question, index, id, settings)) {
            expect(note).toBeGreaterThanOrEqual(range.low)
            expect(note).toBeLessThanOrEqual(range.high)
            expect(isPlayable(note)).toBe(true)
          }
        }
      }
    }
  })
})

describe('keyChord', () => {
  const question: ProgressionQuestion = {
    numerals: ['I', 'V', 'I'],
    tonic: 60,
    cadence: 'authentic',
  }

  it('is the tonic chord of the key', () => {
    const notes = keyChord(question, settingsWith())
    expect(new Set(notes.map(pitchClass))).toEqual(
      new Set([60, 64, 67].map(pitchClass)),
    )
  })

  it('does not depend on where the progression happened to go', () => {
    // The user may ask for it before a note has sounded, and it has to be a
    // reference rather than another thing to work out.
    const early = keyChord(question, settingsWith())
    const late = keyChord(
      { ...question, numerals: ['I', 'IV', 'V', 'I'] },
      settingsWith(),
    )
    expect(early).toEqual(late)
  })

  it('stays inside the range and on the piano', () => {
    const range = { low: 48, high: 79 }
    for (const tonic of [48, 55, 60, 67]) {
      const notes = keyChord({ ...question, tonic }, settingsWith({ range }))
      for (const note of notes) {
        expect(note).toBeGreaterThanOrEqual(range.low)
        expect(note).toBeLessThanOrEqual(range.high)
        expect(isPlayable(note)).toBe(true)
      }
    }
  })
})
