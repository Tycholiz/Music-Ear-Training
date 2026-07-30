import { describe, expect, it } from 'vitest'
import {
  canGenerateProgression,
  checkProgression,
  generateProgressionQuestion,
  progressionNumerals,
  usableCadences,
  type ProgressionQuestion,
} from './progressionQuestion'
import {
  DEFAULT_PROGRESSION_SETTINGS,
  type ProgressionSettings,
} from '../settings'
import { CADENCES, NUMERALS, cadenceNumerals } from '../theory'

function settingsWith(
  overrides: Partial<ProgressionSettings> = {},
): ProgressionSettings {
  return { ...DEFAULT_PROGRESSION_SETTINGS, ...overrides }
}

/** Every numeral the table knows, for exercising the whole vocabulary. */
const ALL_NUMERALS = NUMERALS.map((n) => n.id)

/** Many progressions, since almost everything here is a statistical property. */
function sample(
  settings: ProgressionSettings,
  count = 200,
): ProgressionQuestion[] {
  return Array.from({ length: count }, () =>
    generateProgressionQuestion(settings),
  )
}

describe('canGenerateProgression', () => {
  it('accepts the defaults', () => {
    expect(canGenerateProgression(DEFAULT_PROGRESSION_SETTINGS)).toBe(true)
  })

  it('rejects a cadence whose chords are switched off', () => {
    // A plagal cadence is IV then I; without IV there is no way to make one.
    expect(
      canGenerateProgression(
        settingsWith({ numerals: ['I', 'V'], cadences: ['plagal'] }),
      ),
    ).toBe(false)
    expect(
      canGenerateProgression(
        settingsWith({ numerals: ['I', 'IV'], cadences: ['plagal'] }),
      ),
    ).toBe(true)
  })

  it('rejects a progression too short for its cadence', () => {
    // An authentic cadence is two chords; one leaves nowhere to put them.
    expect(
      canGenerateProgression(
        settingsWith({ cadences: ['authentic'], length: 1 }),
      ),
    ).toBe(false)
    expect(
      canGenerateProgression(
        settingsWith({ cadences: ['authentic'], length: 2 }),
      ),
    ).toBe(true)
  })

  it('accepts a one-chord progression when the cadence is a half', () => {
    // A half cadence is an arrival on V and nothing more.
    expect(
      canGenerateProgression(
        settingsWith({ cadences: ['half'], length: 1, numerals: ['I', 'V'] }),
      ),
    ).toBe(true)
  })

  it('rejects no cadences at all', () => {
    expect(canGenerateProgression(settingsWith({ cadences: [] }))).toBe(false)
  })

  it('rejects a range too narrow to voice a chord in', () => {
    expect(
      canGenerateProgression(settingsWith({ range: { low: 60, high: 67 } })),
    ).toBe(false)
  })

  it('reports rather than throwing, so a stale setting cannot crash a screen', () => {
    expect(() =>
      canGenerateProgression(settingsWith({ numerals: ['nonesuch'] })),
    ).not.toThrow()
  })
})

describe('usableCadences', () => {
  it('keeps only the ones whose chords are enabled', () => {
    const settings = settingsWith({
      numerals: ['I', 'IV', 'V'],
      cadences: [...CADENCES],
    })
    // Deceptive needs vi, which is off.
    expect(usableCadences(settings)).toEqual(['authentic', 'plagal', 'half'])
  })

  it('names the chords a cadence needs', () => {
    expect(cadenceNumerals('authentic')).toEqual(['V', 'I'])
    expect(cadenceNumerals('plagal')).toEqual(['IV', 'I'])
    expect(cadenceNumerals('half')).toEqual(['V'])
    expect(cadenceNumerals('deceptive')).toEqual(['V', 'vi'])
    expect(cadenceNumerals('secondary')).toEqual(['III', 'vi'])
  })
})

describe('generateProgressionQuestion', () => {
  it('refuses to generate what it cannot, instead of looping', () => {
    expect(() =>
      generateProgressionQuestion(settingsWith({ cadences: [] })),
    ).toThrow(/No progression can be generated/)
  })

  it('produces as many chords as asked for', () => {
    for (const length of [2, 3, 4, 6, 8]) {
      const settings = settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length,
      })
      for (const question of sample(settings, 30)) {
        expect(question.numerals, `length ${length}`).toHaveLength(length)
      }
    }
  })

  it('only uses chords that are enabled', () => {
    const numerals = ['I', 'IV', 'V', 'vi']
    for (const question of sample(
      settingsWith({ numerals, cadences: [...CADENCES], length: 5 }),
      100,
    )) {
      for (const id of question.numerals) {
        expect(numerals, id).toContain(id)
      }
    }
  })

  it('names every chord it plays, so the answer is always resolvable', () => {
    for (const question of sample(
      settingsWith({ numerals: ALL_NUMERALS, cadences: [...CADENCES] }),
      50,
    )) {
      expect(() => progressionNumerals(question)).not.toThrow()
      expect(progressionNumerals(question)).toHaveLength(
        question.numerals.length,
      )
    }
  })

  it('moves the key around rather than always asking in the same one', () => {
    const tonics = new Set(sample(settingsWith(), 100).map((q) => q.tonic))
    expect(tonics.size).toBeGreaterThan(3)
  })
})

describe('always the length that was asked for', () => {
  /** Every selection a user could plausibly narrow down to. */
  const tight: ProgressionSettings[] = [
    settingsWith({ numerals: ['I', 'V'], cadences: ['authentic'], length: 8 }),
    settingsWith({ numerals: ['I', 'V'], cadences: ['half'], length: 8 }),
    settingsWith({ numerals: ['I', 'IV'], cadences: ['plagal'], length: 7 }),
    settingsWith({
      numerals: ['I', 'V', 'vi'],
      cadences: ['deceptive'],
      length: 8,
    }),
    settingsWith({
      numerals: ['I', 'V', 'vii-dim'],
      cadences: ['authentic'],
      length: 6,
    }),
    settingsWith({
      numerals: ['I', 'II', 'V'],
      cadences: ['authentic'],
      length: 5,
    }),
  ]

  it('never returns fewer chords than the settings ask for', () => {
    // The failure this guards is silent: a generator that could not reach the
    // cadence would hand back a shorter progression, and nothing would raise.
    for (const settings of tight) {
      if (!canGenerateProgression(settings)) continue
      for (const question of sample(settings, 40)) {
        expect(
          question.numerals,
          `${settings.numerals.join(',')} → ${settings.cadences[0]}`,
        ).toHaveLength(settings.length)
      }
    }
  })

  it('says it cannot rather than producing something shorter', () => {
    // The two claims have to agree: whatever canGenerateProgression accepts,
    // the generator must be able to build at full length.
    for (const settings of tight) {
      if (canGenerateProgression(settings)) {
        expect(() => generateProgressionQuestion(settings)).not.toThrow()
      } else {
        expect(() => generateProgressionQuestion(settings)).toThrow()
      }
    }
  })

  it('holds across every length for a small selection', () => {
    for (let length = 2; length <= 8; length++) {
      const settings = settingsWith({
        numerals: ['I', 'IV', 'V'],
        cadences: [...CADENCES],
        length,
      })
      if (!canGenerateProgression(settings)) continue
      for (const question of sample(settings, 30)) {
        expect(question.numerals, `length ${length}`).toHaveLength(length)
      }
    }
  })
})

describe('cadences', () => {
  it('ends every progression on its cadence', () => {
    for (const cadence of CADENCES) {
      const settings = settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [cadence],
        length: 5,
      })
      const ending = cadenceNumerals(cadence)

      for (const question of sample(settings, 60)) {
        expect(question.cadence).toBe(cadence)
        expect(question.numerals.slice(-ending.length), cadence).toEqual([
          ...ending,
        ])
      }
    }
  })

  it('does not always end on I', () => {
    // The fault the melody generator shipped with: an ending that never varies
    // hands the last answer over before the user has heard anything.
    const questions = sample(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length: 4,
      }),
      400,
    )
    const endings = new Set(questions.map((q) => q.numerals.at(-1)))

    expect(endings.size).toBeGreaterThan(1)
    const onTonic = questions.filter((q) => q.numerals.at(-1) === 'I').length
    expect(onTonic / questions.length).toBeLessThan(0.9)
  })

  it('spreads the final chord across all three landings', () => {
    // Five cadences landing on I, I, V, vi and vi. An upper bound as well as
    // a lower one, because "does not always end on I" passes at 89% and the
    // last answer would still be most of a giveaway.
    const questions = sample(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length: 4,
      }),
      600,
    )
    const share = (id: string) =>
      questions.filter((q) => q.numerals.at(-1) === id).length /
      questions.length

    expect(share('I')).toBeGreaterThan(0.25)
    expect(share('I')).toBeLessThan(0.55)
    expect(share('vi')).toBeGreaterThan(0.25)
    expect(share('vi')).toBeLessThan(0.55)
    expect(share('V')).toBeGreaterThan(0.1)
    expect(share('V')).toBeLessThan(0.3)
  })

  it('reaches every enabled cadence type across many questions', () => {
    const used = new Set(
      sample(
        settingsWith({
          numerals: ALL_NUMERALS,
          cadences: [...CADENCES],
          length: 4,
        }),
        400,
      ).map((q) => q.cadence),
    )
    expect(used).toEqual(new Set(CADENCES))
  })

  it('lands a half cadence on the dominant, unresolved', () => {
    for (const question of sample(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: ['half'],
        length: 4,
      }),
      60,
    )) {
      expect(question.numerals.at(-1)).toBe('V')
    }
  })

  it('lands a secondary cadence on vi, by way of the dominant of vi', () => {
    for (const question of sample(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: ['secondary'],
        length: 4,
      }),
      60,
    )) {
      expect(question.numerals.slice(-2)).toEqual(['III', 'vi'])
    }
  })

  it('approaches III from more than one chord', () => {
    // The failure this cadence shipped with in draft. III was reachable only
    // from I, so every secondary progression ended `I III vi` and a
    // three-chord one had exactly one possible answer — a question that is
    // memorised rather than heard. Measured directly rather than asserted
    // against a threshold, since the broken version scores 1 and any fix
    // scores more.
    const approaches = new Set(
      sample(
        settingsWith({
          numerals: ALL_NUMERALS,
          cadences: ['secondary'],
          length: 3,
        }),
        200,
      ).map((question) => question.numerals[0]),
    )

    expect(approaches.size).toBeGreaterThan(1)
  })

  it('lands a deceptive cadence on vi, having promised I', () => {
    for (const question of sample(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: ['deceptive'],
        length: 4,
      }),
      60,
    )) {
      expect(question.numerals.slice(-2)).toEqual(['V', 'vi'])
    }
  })
})

describe('harmonic shape', () => {
  /** Every consecutive pair across many progressions. */
  function pairs(settings: ProgressionSettings, count = 200) {
    return sample(settings, count).flatMap((q) =>
      q.numerals.slice(0, -1).map((from, i) => [from, q.numerals[i + 1]]),
    )
  }

  it('never repeats a chord back to back', () => {
    // Two of a chord in succession is close to indistinguishable from one held
    // longer, so it would ask the user something the sound cannot answer.
    for (const [from, to] of pairs(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length: 8,
      }),
      200,
    )) {
      expect(from, `${from} → ${to}`).not.toBe(to)
    }
  })

  it('only moves between chords that conventionally follow one another', () => {
    // The whole reason progressions are walked rather than sampled: an
    // unfamiliar chord succession is heard as a mistake, not as music.
    const legal = new Set([
      'I>ii',
      'I>iii',
      'I>IV',
      'I>V',
      'I>vi',
      'I>iv',
      'I>bIII',
      'I>bVI',
      'I>bVII',
      'I>II',
      'I>III',
      'I>VI',
      'I>bII',
      'ii>V',
      'ii>vii-dim',
      'ii>IV',
      'iii>vi',
      'iii>IV',
      'iii>ii',
      'IV>V',
      'IV>I',
      'IV>ii',
      'IV>vii-dim',
      'IV>iv',
      'IV>III',
      'V>I',
      'V>vi',
      'vi>ii',
      'vi>IV',
      'vi>V',
      'vi>iii',
      'vi>III',
      'vii-dim>I',
      'iv>V',
      'iv>I',
      'iv>bVII',
      'bIII>bVI',
      'bIII>bVII',
      'bIII>IV',
      'bIII>I',
      'bVI>bVII',
      'bVI>IV',
      'bVI>V',
      'bVI>I',
      'bVII>I',
      'bVII>IV',
      'bVII>bVI',
      'II>V',
      'III>vi',
      'VI>ii',
      'bII>I',
      'bII>V',
    ])

    for (const [from, to] of pairs(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length: 8,
      }),
      200,
    )) {
      expect(legal.has(`${from}>${to}`), `${from} → ${to}`).toBe(true)
    }
  })

  it('resolves a secondary dominant to the chord it points at', () => {
    for (const [from, to] of pairs(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length: 8,
      }),
      200,
    )) {
      if (from === 'II') expect(to).toBe('V')
      if (from === 'III') expect(to).toBe('vi')
      if (from === 'VI') expect(to).toBe('ii')
    }
  })

  it('opens on more than one chord, without abandoning the tonic', () => {
    const openings = sample(
      settingsWith({
        numerals: ALL_NUMERALS,
        cadences: [...CADENCES],
        length: 5,
      }),
      300,
    ).map((q) => q.numerals[0])

    expect(new Set(openings).size).toBeGreaterThan(2)
    const onTonic = openings.filter((id) => id === 'I').length
    expect(onTonic / openings.length).toBeGreaterThan(0.15)
    expect(onTonic / openings.length).toBeLessThan(0.85)
  })
})

describe('checkProgression', () => {
  const question: ProgressionQuestion = {
    numerals: ['I', 'vi', 'V', 'I'],
    tonic: 60,
    cadence: 'authentic',
  }

  it('accepts the progression entered correctly', () => {
    expect(checkProgression(['I', 'vi', 'V', 'I'], question)).toEqual({
      correct: true,
      positions: [true, true, true, true],
    })
  })

  it('says which position was wrong, not just that it was', () => {
    expect(checkProgression(['I', 'IV', 'V', 'I'], question)).toEqual({
      correct: false,
      positions: [true, false, true, true],
    })
  })

  it('treats a short entry as unfinished rather than correct', () => {
    const result = checkProgression(['I', 'vi'], question)
    expect(result.correct).toBe(false)
    expect(result.positions).toEqual([true, true, false, false])
  })

  it('rejects an entry longer than the progression', () => {
    expect(checkProgression(['I', 'vi', 'V', 'I', 'I'], question).correct).toBe(
      false,
    )
  })

  it('reports a position per chord, whatever was entered', () => {
    expect(checkProgression([], question).positions).toHaveLength(4)
    expect(
      checkProgression(['I', 'I', 'I', 'I', 'I', 'I'], question).positions,
    ).toHaveLength(4)
  })

  it('tells the two chords a repeated numeral appears as apart', () => {
    // I opens and closes this progression; the first press must not credit the
    // last position or vice versa.
    expect(checkProgression(['I'], question).positions).toEqual([
      true,
      false,
      false,
      false,
    ])
  })
})
