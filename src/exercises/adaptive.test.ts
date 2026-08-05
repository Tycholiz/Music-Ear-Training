import { describe, expect, it } from 'vitest'
import {
  MAX_WEIGHT_RATIO,
  chordKey,
  intervalKey,
  itemWeight,
  pickAdaptive,
  smoothedAccuracy,
} from './adaptive'
import { recordAttempts, type ExerciseStats } from '../settings'

/** An item with a run of outcomes behind it. */
function withRecord(item: string, correct: number, wrong: number) {
  return recordAttempts(
    {},
    [
      ...Array.from({ length: correct }, () => ({ item, correct: true })),
      ...Array.from({ length: wrong }, () => ({ item, correct: false })),
    ],
    1,
  )
}

describe('smoothedAccuracy', () => {
  it('says nothing much about an item never seen', () => {
    // The prior's own answer. Either extreme would be a guess about a user who
    // has not been asked yet.
    expect(smoothedAccuracy(undefined)).toBe(0.5)
  })

  it('refuses to call one correct answer mastery', () => {
    const stats = withRecord('chord:major', 1, 0)
    // Raw accuracy says 100%. Two thirds is the honest reading of one hit.
    expect(smoothedAccuracy(stats['chord:major'])).toBeCloseTo(2 / 3)
  })

  it('refuses to call one miss a weakness', () => {
    const stats = withRecord('chord:major', 0, 1)
    expect(smoothedAccuracy(stats['chord:major'])).toBeCloseTo(1 / 3)
  })

  it('settles toward the truth as evidence arrives', () => {
    const thin = withRecord('chord:major', 3, 0)
    const thick = withRecord('chord:major', 15, 0)

    expect(smoothedAccuracy(thin['chord:major'])).toBeLessThan(
      smoothedAccuracy(thick['chord:major']),
    )
    expect(smoothedAccuracy(thick['chord:major'])).toBeGreaterThan(0.9)
  })

  it('reads the recent window rather than the lifetime record', () => {
    // Someone who has fixed a chord should stop being drilled on it within a
    // session, not once a lifetime count of hundreds has been outweighed.
    let stats: ExerciseStats = withRecord('chord:major', 0, 20)
    stats = recordAttempts(
      stats,
      Array.from({ length: 20 }, () => ({
        item: 'chord:major',
        correct: true,
      })),
      2,
    )

    expect(stats['chord:major'].attempts).toBe(40)
    expect(smoothedAccuracy(stats['chord:major'])).toBeGreaterThan(0.9)
  })
})

describe('itemWeight', () => {
  it('never reaches zero, so nothing can be starved out', () => {
    // An item that stops being asked stops generating evidence about itself,
    // so a lucky streak would freeze it out permanently.
    const mastered = withRecord('chord:major', 20, 0)
    expect(itemWeight(mastered['chord:major'])).toBeGreaterThan(0)
  })

  it('caps the gap between the worst and the best item', () => {
    const worst = withRecord('chord:a', 0, 20)
    const best = withRecord('chord:b', 20, 0)

    const ratio = itemWeight(worst['chord:a']) / itemWeight(best['chord:b'])
    expect(ratio).toBeLessThanOrEqual(MAX_WEIGHT_RATIO)
    // And it actually gets near the cap, rather than the cap being decoration.
    expect(ratio).toBeGreaterThan(MAX_WEIGHT_RATIO * 0.8)
  })

  it('puts an unseen item between the two, since it needs exposure', () => {
    const worst = withRecord('chord:a', 0, 20)
    const best = withRecord('chord:b', 20, 0)

    expect(itemWeight(undefined)).toBeGreaterThan(itemWeight(best['chord:b']))
    expect(itemWeight(undefined)).toBeLessThan(itemWeight(worst['chord:a']))
  })
})

describe('pickAdaptive', () => {
  const options = ['a', 'b', 'c']
  const key = (id: string) => `chord:${id}`

  /** How often each option comes up over many picks. */
  function distribution(stats: ExerciseStats | undefined, runs = 6000) {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < runs; i++) {
      counts[pickAdaptive(options, key, stats, Math.random)] += 1
    }
    return {
      a: counts.a / runs,
      b: counts.b / runs,
      c: counts.c / runs,
    }
  }

  it('is uniform with no record to go on', () => {
    const share = distribution({})
    for (const option of options) {
      expect(share[option as 'a'], option).toBeGreaterThan(0.28)
      expect(share[option as 'a'], option).toBeLessThan(0.39)
    }
  })

  it('is uniform when adaptivity is switched off', () => {
    const stats = {
      ...withRecord('chord:a', 0, 20),
      ...withRecord('chord:b', 20, 0),
    }
    // `undefined` is how the generators express "the setting is off".
    const share = distribution(undefined)
    expect(share.a).toBeGreaterThan(0.28)
    expect(share.a).toBeLessThan(0.39)
    // Sanity: the same record does shift things when it is honoured.
    expect(distribution(stats).a).toBeGreaterThan(0.4)
  })

  /**
   * Measured, with an upper bound as well as a lower one.
   *
   * "The weak item comes up more" passes for a generator that returns it every
   * single time, which is the failure this is really guarding — the standard
   * way naive spaced repetition becomes unbearable. The melody generator
   * shipped with exactly this shape of assertion and it guarded nothing.
   */
  it('favours the weak item without drilling it to death', () => {
    const stats = {
      ...withRecord('chord:a', 0, 20),
      ...withRecord('chord:b', 20, 0),
      ...withRecord('chord:c', 20, 0),
    }
    const share = distribution(stats)

    // Roughly 4 : 1 : 1, so about two thirds.
    expect(share.a).toBeGreaterThan(0.55)
    expect(share.a).toBeLessThan(0.75)
    // And the mastered ones keep a real share rather than disappearing.
    expect(share.b).toBeGreaterThan(0.1)
    expect(share.c).toBeGreaterThan(0.1)
  })

  it('never starves an item, however well it is going', () => {
    const stats = {
      ...withRecord('chord:a', 20, 0),
      ...withRecord('chord:b', 20, 0),
      ...withRecord('chord:c', 0, 20),
    }
    const share = distribution(stats)

    expect(share.a).toBeGreaterThan(0.05)
    expect(share.b).toBeGreaterThan(0.05)
  })

  it('handles a pool of one without dividing by anything awkward', () => {
    expect(pickAdaptive(['only'], key, {}, Math.random)).toBe('only')
  })
})

describe('item keys', () => {
  it('matches what the exercises record under', () => {
    // If these drift, weighting reads an empty record and silently does
    // nothing at all — the worst kind of broken, since everything still works.
    expect(intervalKey(7, 'asc')).toBe('interval:7-asc')
    expect(chordKey('major-7th')).toBe('chord:major-7th')
  })

  it('keeps an interval apart from the same interval the other way', () => {
    // The two are different skills, so they have to be different records —
    // otherwise weighting averages them and asks more of both when only one
    // is going badly.
    expect(intervalKey(10, 'asc')).not.toBe(intervalKey(10, 'desc'))
    expect(intervalKey(10, 'harmonic')).not.toBe(intervalKey(10, 'asc'))
  })
})
