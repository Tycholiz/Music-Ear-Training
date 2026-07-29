import { describe, expect, it } from 'vitest'
import {
  backingNotes,
  canGenerateMelody,
  checkMelody,
  generateMelodyQuestion,
  phraseForMelodyQuestion,
  type MelodyQuestion,
} from './melodyQuestion'
import { DEFAULT_MELODY_SETTINGS, type MelodySettings } from '../settings'
import { isPlayable } from '../audio'
import { degreeOf, scaleById } from '../theory'

function settingsWith(overrides: Partial<MelodySettings> = {}): MelodySettings {
  return { ...DEFAULT_MELODY_SETTINGS, ...overrides }
}

/** Many melodies, since almost everything here is a statistical property. */
function sample(settings: MelodySettings, count = 200): MelodyQuestion[] {
  return Array.from({ length: count }, () => generateMelodyQuestion(settings))
}

/** Positions of each note within its scale, for step-vs-leap counting. */
function scalePositions(question: MelodyQuestion): number[] {
  const scale = scaleById(question.scaleId)
  return question.notes.map((note) => {
    const degree = degreeOf(question.tonic, note)
    const index = scale.degrees.indexOf(degree)
    // An octave up counts as a position past the top of the scale, so the
    // step from the 7 to the tonic above reads as one step, not a fall.
    const octave = Math.floor((note - question.tonic) / 12)
    return index + octave * scale.degrees.length
  })
}

describe('canGenerateMelody', () => {
  it('accepts the defaults', () => {
    expect(canGenerateMelody(DEFAULT_MELODY_SETTINGS)).toBe(true)
  })

  it('rejects a range too narrow to hold an octave', () => {
    expect(
      canGenerateMelody(settingsWith({ range: { low: 60, high: 67 } })),
    ).toBe(false)
    // Exactly an octave is enough.
    expect(
      canGenerateMelody(settingsWith({ range: { low: 60, high: 72 } })),
    ).toBe(true)
  })

  it('rejects a melody too short to fit everything it must feature', () => {
    const settings = settingsWith({
      scaleId: 'major',
      featured: [4, 5, 11],
      length: 2,
    })
    expect(canGenerateMelody(settings)).toBe(false)
    expect(canGenerateMelody({ ...settings, length: 3 })).toBe(true)
  })

  it('rejects a featured degree the scale does not contain', () => {
    // A b7 cannot be featured in a major scale; it is not in it.
    expect(
      canGenerateMelody(settingsWith({ scaleId: 'major', featured: [10] })),
    ).toBe(false)
    expect(
      canGenerateMelody(
        settingsWith({ scaleId: 'mixolydian', featured: [10] }),
      ),
    ).toBe(true)
  })

  it('rejects a length below one, and an unknown scale', () => {
    expect(canGenerateMelody(settingsWith({ length: 0 }))).toBe(false)
    expect(canGenerateMelody(settingsWith({ scaleId: 'nonesuch' }))).toBe(false)
  })

  it('reports rather than throwing, so a stale setting cannot crash a screen', () => {
    expect(() =>
      canGenerateMelody(settingsWith({ scaleId: 'gone' })),
    ).not.toThrow()
  })
})

describe('generateMelodyQuestion', () => {
  it('refuses to generate what it cannot, instead of looping', () => {
    expect(() =>
      generateMelodyQuestion(
        settingsWith({ scaleId: 'major', featured: [10] }),
      ),
    ).toThrow(/No melody can be generated/)
  })

  it('produces as many notes as asked for', () => {
    for (const length of [1, 3, 5, 8]) {
      const question = generateMelodyQuestion(settingsWith({ length }))
      expect(question.notes).toHaveLength(length)
      expect(question.degrees).toHaveLength(length)
    }
  })

  it('answers with the degree of every note it plays', () => {
    for (const question of sample(settingsWith({ length: 6 }), 50)) {
      const actual = question.notes.map((note) =>
        degreeOf(question.tonic, note),
      )
      expect(question.degrees).toEqual(actual)
    }
  })

  it('only uses degrees from the chosen scale', () => {
    for (const id of ['major-pentatonic', 'major', 'blues', 'harmonic-minor']) {
      const scale = scaleById(id)
      for (const question of sample(settingsWith({ scaleId: id }), 40)) {
        for (const degree of question.degrees) {
          expect(scale.degrees, `${id} played ${degree}`).toContain(degree)
        }
      }
    }
  })

  it('keeps every note inside the configured range', () => {
    const range = { low: 55, high: 76 }
    for (const question of sample(settingsWith({ range, length: 8 }), 100)) {
      for (const note of question.notes) {
        expect(note).toBeGreaterThanOrEqual(range.low)
        expect(note).toBeLessThanOrEqual(range.high)
      }
    }
  })

  it('keeps every note playable on the piano', () => {
    for (const question of sample(settingsWith({ length: 8 }), 50)) {
      for (const note of [...question.notes, ...question.backing]) {
        expect(isPlayable(note)).toBe(true)
      }
    }
  })

  it('spans no more than an octave', () => {
    for (const question of sample(settingsWith({ length: 8 }), 100)) {
      const span = Math.max(...question.notes) - Math.min(...question.notes)
      expect(span).toBeLessThanOrEqual(12)
    }
  })

  it('moves the tonic around rather than always asking in the same key', () => {
    const tonics = new Set(sample(settingsWith(), 100).map((q) => q.tonic))
    expect(tonics.size).toBeGreaterThan(3)
  })
})

describe('melodic shape', () => {
  it('takes more steps than leaps', () => {
    // The whole reason the generator is weighted at all: notes picked
    // uniformly sound like noise that happens to be in key.
    let steps = 0
    let leaps = 0

    for (const question of sample(settingsWith({ length: 8 }), 200)) {
      const positions = scalePositions(question)
      for (let i = 1; i < positions.length; i++) {
        const distance = Math.abs(positions[i] - positions[i - 1])
        if (distance === 0) continue
        if (distance === 1) steps++
        else leaps++
      }
    }

    expect(steps).toBeGreaterThan(leaps)
  })

  it('turns back after a leap more often than it leaps on', () => {
    let turnedBack = 0
    let carriedOn = 0

    for (const question of sample(settingsWith({ length: 8 }), 300)) {
      const positions = scalePositions(question)
      for (let i = 2; i < positions.length; i++) {
        const leap = positions[i - 1] - positions[i - 2]
        if (Math.abs(leap) < 2) continue

        const after = positions[i] - positions[i - 1]
        if (after === 0) continue
        if (Math.sign(after) !== Math.sign(leap)) turnedBack++
        else carriedOn++
      }
    }

    expect(turnedBack).toBeGreaterThan(carriedOn)
  })

  it('usually comes to rest, but not so reliably that it gives itself away', () => {
    // Measured at about 90%. The upper bound is the point of the test: a
    // melody that *always* ended on a chord tone would let a user rule out
    // four of the seven degrees before hearing a note, and the advantage
    // would grow with every question they answered.
    const questions = sample(settingsWith({ scaleId: 'major', length: 6 }), 400)
    const chord = [0, 4, 7]

    const atRest =
      questions.filter((q) => chord.includes(q.degrees.at(-1)!)).length /
      questions.length

    expect(atRest).toBeGreaterThan(0.78)
    expect(atRest).toBeLessThan(0.99)
  })

  it('closes on more than one degree', () => {
    const endings = new Set(
      sample(settingsWith({ scaleId: 'major', length: 6 }), 200).map((q) =>
        q.degrees.at(-1),
      ),
    )
    expect(endings.size).toBeGreaterThan(2)
  })

  it('starts in different places rather than always on the tonic', () => {
    // The backing chord holds the tonic throughout, so the melody does not
    // have to establish it. Opening on 1 every time would be a tell.
    const openings = sample(settingsWith({ length: 5 }), 200).map(
      (q) => q.degrees[0],
    )
    expect(new Set(openings).size).toBeGreaterThan(2)

    const onTonic = openings.filter((degree) => degree === 0).length
    expect(onTonic / openings.length).toBeLessThan(0.6)
  })
})

describe('featured degrees', () => {
  it('always places the featured degree', () => {
    const settings = settingsWith({
      scaleId: 'major',
      featured: [11],
      length: 5,
    })
    for (const question of sample(settings, 300)) {
      expect(question.degrees, question.degrees.join('-')).toContain(11)
    }
  })

  it('places every one of several featured degrees', () => {
    const settings = settingsWith({
      scaleId: 'major',
      featured: [5, 11],
      length: 5,
    })
    for (const question of sample(settings, 300)) {
      expect(question.degrees).toContain(5)
      expect(question.degrees).toContain(11)
    }
  })

  it('copes when the melody is exactly as long as the requirement', () => {
    const settings = settingsWith({
      scaleId: 'major',
      featured: [2, 5, 11],
      length: 3,
    })
    for (const question of sample(settings, 200)) {
      expect([...question.degrees].sort((a, b) => a - b)).toEqual([2, 5, 11])
    }
  })

  it('ignores a degree listed twice', () => {
    const settings = settingsWith({
      scaleId: 'major',
      featured: [11, 11],
      length: 2,
    })
    expect(canGenerateMelody(settings)).toBe(true)
    for (const question of sample(settings, 50)) {
      expect(question.degrees).toContain(11)
    }
  })

  it('still produces a shaped melody, not just the featured notes', () => {
    const settings = settingsWith({
      scaleId: 'major',
      featured: [11],
      length: 8,
    })
    const questions = sample(settings, 100)
    const everyNoteFeatured = questions.filter((q) =>
      q.degrees.every((d) => d === 11),
    )
    expect(everyNoteFeatured).toHaveLength(0)
  })
})

describe('backing', () => {
  it('matches the quality of the scale', () => {
    const major = backingNotes(scaleById('major'), 60, 'chord')
    expect(major.map((n) => n - major[0])).toEqual([0, 4, 7])

    const minor = backingNotes(scaleById('natural-minor'), 60, 'chord')
    expect(minor.map((n) => n - minor[0])).toEqual([0, 3, 7])
  })

  it('never sounds a note outside the scale under the melody', () => {
    // A major third under a minor melody is not a reference point, it is a
    // wrong note ringing through every phrase.
    for (const settings of [
      settingsWith({ scaleId: 'natural-minor' }),
      settingsWith({ scaleId: 'blues' }),
      settingsWith({ scaleId: 'harmonic-minor' }),
      settingsWith({ scaleId: 'chromatic' }),
    ]) {
      const scale = scaleById(settings.scaleId)
      for (const question of sample(settings, 20)) {
        for (const note of question.backing) {
          expect(
            scale.degrees,
            `${settings.scaleId} backed with ${degreeOf(question.tonic, note)}`,
          ).toContain(degreeOf(question.tonic, note))
        }
      }
    }
  })

  it('sits below the melody rather than tangling with it', () => {
    for (const question of sample(settingsWith({ length: 8 }), 100)) {
      expect(Math.max(...question.backing)).toBeLessThan(
        Math.min(...question.notes),
      )
    }
  })

  it('drones on the tonic alone, saying nothing about the quality', () => {
    const drone = backingNotes(scaleById('major'), 60, 'drone')
    expect(drone).toHaveLength(1)
    expect(degreeOf(60, drone[0])).toBe(0)
  })

  it('plays nothing at all when switched off', () => {
    expect(backingNotes(scaleById('major'), 60, 'none')).toEqual([])
    for (const question of sample(settingsWith({ backing: 'none' }), 20)) {
      expect(question.backing).toEqual([])
    }
  })

  it('stays on the piano when the tonic is already near the bottom', () => {
    const scale = scaleById('major')
    for (const tonic of [21, 22, 24, 33]) {
      for (const note of backingNotes(scale, tonic, 'chord')) {
        expect(isPlayable(note), `tonic ${tonic} backed with ${note}`).toBe(
          true,
        )
      }
    }
  })
})

describe('phraseForMelodyQuestion', () => {
  it('hands the audio engine the melody and what backs it', () => {
    const question = generateMelodyQuestion(settingsWith({ length: 4 }))
    expect(phraseForMelodyQuestion(question)).toEqual({
      melody: question.notes,
      backing: question.backing,
    })
  })
})

describe('checkMelody', () => {
  const question: MelodyQuestion = {
    degrees: [0, 7, 7, 9],
    notes: [60, 67, 67, 69],
    backing: [48, 52, 55],
    tonic: 60,
    scaleId: 'major-pentatonic',
  }

  it('accepts the melody entered correctly', () => {
    expect(checkMelody([0, 7, 7, 9], question)).toEqual({
      correct: true,
      positions: [true, true, true, true],
    })
  })

  it('says which position was wrong, not just that it was wrong', () => {
    // Being told the fourth note was missed is a lesson; being told the
    // melody was wrong is only a score.
    expect(checkMelody([0, 7, 7, 4], question)).toEqual({
      correct: false,
      positions: [true, true, true, false],
    })
  })

  it('marks every position that was missed', () => {
    expect(checkMelody([2, 7, 4, 9], question).positions).toEqual([
      false,
      true,
      false,
      true,
    ])
  })

  it('treats a short entry as unfinished rather than correct', () => {
    const result = checkMelody([0, 7], question)
    expect(result.correct).toBe(false)
    expect(result.positions).toEqual([true, true, false, false])
  })

  it('rejects an entry longer than the melody', () => {
    expect(checkMelody([0, 7, 7, 9, 9], question).correct).toBe(false)
  })

  it('reports a position per note of the melody, whatever was entered', () => {
    expect(checkMelody([], question).positions).toHaveLength(4)
    expect(checkMelody([0, 0, 0, 0, 0, 0], question).positions).toHaveLength(4)
  })
})
