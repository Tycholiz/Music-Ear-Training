import { describe, expect, it } from 'vitest'
import {
  CHORD_STATS_VIEW,
  INTERVAL_STATS_VIEW,
  MELODY_STATS_VIEW,
  MIN_ATTEMPTS_TO_REPORT,
  PROGRESSION_STATS_VIEW,
  ROOT_STATS_VIEW,
  confusionsFor,
  hasAnyStats,
  mastery,
  reportableRows,
  statsRows,
} from './statsView'
import {
  RECENT_WINDOW,
  recordAttempts,
  type Attempt,
  type ExerciseStats,
} from '../settings'

function record(...attempts: Attempt[]): ExerciseStats {
  return recordAttempts({}, attempts, 1)
}

function repeat(item: string, correct: boolean, times: number): Attempt[] {
  return Array.from({ length: times }, () => ({ item, correct }))
}

describe('labels', () => {
  it('turns each namespace back into something a musician reads', () => {
    expect(INTERVAL_STATS_VIEW.answer.label('7')).toBe('Perfect 5th')
    expect(CHORD_STATS_VIEW.answer.label('major-7th')).toBe('Major 7th')
    expect(PROGRESSION_STATS_VIEW.answer.label('vii-dim')).toBe('vii°')
    expect(MELODY_STATS_VIEW.answer.label('leap-down')).toBe('Leap down')
    expect(MELODY_STATS_VIEW.answer.label('opening')).toBe('First note')
  })

  it('counts progression positions from one, not from zero', () => {
    // The record is indexed; the user is looking at the first chord.
    const positions = PROGRESSION_STATS_VIEW.breakdowns.find(
      (s) => s.namespace === 'position',
    )
    expect(positions?.label('0')).toBe('Chord 1')
    expect(positions?.label('3')).toBe('Chord 4')
  })

  it('falls back to the raw id rather than throwing on a stale record', () => {
    // A chord removed from the table would otherwise take the whole screen
    // down, and a statistics screen is the last place worth crashing.
    expect(CHORD_STATS_VIEW.answer.label('no-such-chord')).toBe('no-such-chord')
    expect(INTERVAL_STATS_VIEW.answer.label('nonsense')).toBe('nonsense')
  })
})

describe('what each exercise breaks down by', () => {
  it('leads chord root with inversion, which is its whole difficulty', () => {
    expect(ROOT_STATS_VIEW.breakdowns[0].namespace).toBe('inversion')
  })

  it('breaks intervals down by play mode, since descending is its own skill', () => {
    expect(INTERVAL_STATS_VIEW.breakdowns.map((s) => s.namespace)).toContain(
      'mode',
    )
  })

  it('breaks progressions down by cadence and by position', () => {
    expect(PROGRESSION_STATS_VIEW.breakdowns.map((s) => s.namespace)).toEqual([
      'cadence',
      'position',
    ])
  })

  it('never lists a breakdown under the answer namespace', () => {
    // They would double-count: the same items shown twice, once bucketed and
    // once flat, reading as two different findings.
    for (const view of [
      INTERVAL_STATS_VIEW,
      CHORD_STATS_VIEW,
      ROOT_STATS_VIEW,
      MELODY_STATS_VIEW,
      PROGRESSION_STATS_VIEW,
    ]) {
      for (const breakdown of view.breakdowns) {
        expect(breakdown.namespace).not.toBe(view.answer.namespace)
      }
    }
  })
})

describe('statsRows', () => {
  it('sorts worst first, which is the only order worth reading', () => {
    const stats = record(
      ...repeat('chord:good', true, 10),
      ...repeat('chord:bad', false, 10),
      ...repeat('chord:mixed', true, 5),
      ...repeat('chord:mixed', false, 5),
    )

    expect(
      statsRows(stats, CHORD_STATS_VIEW.answer).map((row) => row.id),
    ).toEqual(['bad', 'mixed', 'good'])
  })

  it('withholds a percentage until there is enough to report one', () => {
    // Two out of three is not 67%, and a screen that says so is worse than one
    // that says nothing, because the user acts on it.
    const stats = record(...repeat('chord:major', true, 2))
    const [row] = statsRows(stats, CHORD_STATS_VIEW.answer)

    expect(row.accuracy).toBeNull()
    expect(reportableRows([row])).toEqual([])
  })

  it('reports one as soon as the threshold is reached', () => {
    const stats = record(
      ...repeat('chord:major', true, MIN_ATTEMPTS_TO_REPORT - 1),
      ...repeat('chord:major', false, 1),
    )
    const [row] = statsRows(stats, CHORD_STATS_VIEW.answer)

    expect(reportableRows([row])).toHaveLength(1)
    expect(row.accuracy).toBeCloseTo(
      (MIN_ATTEMPTS_TO_REPORT - 1) / MIN_ATTEMPTS_TO_REPORT,
    )
  })

  it('holds a thin item out of the buckets entirely, not just out of the numbers', () => {
    // The bug behind the confusing screen: `mastery` smooths and so always
    // produces an answer, so one correct attempt was bucketed as "Getting
    // there" while its percentage abstained — a verdict on evidence the same
    // screen was refusing to summarise.
    const stats = record({ item: 'chord:major', correct: true })
    const [row] = statsRows(stats, CHORD_STATS_VIEW.answer)

    expect(mastery(row.item)).toBe('practising')
    expect(reportableRows([row])).toEqual([])
  })

  it('reports the recent window, not the lifetime record', () => {
    // Someone who was bad at a chord months ago and has since fixed it would
    // otherwise read a low percentage while sitting under "Solid" — the bucket
    // and the number describing different stretches of time.
    const stats = record(
      ...repeat('chord:major', false, 30),
      ...repeat('chord:major', true, 20),
    )
    const [row] = statsRows(stats, CHORD_STATS_VIEW.answer)

    expect(row.item.attempts).toBe(50)
    // Lifetime is 40%; the last twenty were all correct.
    expect(row.accuracy).toBe(1)
  })

  it('agrees in direction with the bucket it is shown under', () => {
    // The two are computed differently — the bucket smooths — but they must
    // never point opposite ways, which is what a lifetime figure allowed.
    const stats = record(
      ...repeat('chord:fixed', false, 30),
      ...repeat('chord:fixed', true, 20),
    )
    const [row] = statsRows(stats, CHORD_STATS_VIEW.answer)

    expect(mastery(row.item)).toBe('solid')
    expect(row.accuracy).toBeGreaterThan(0.85)
  })

  it("keeps one namespace out of another one's section", () => {
    const stats = record(
      { item: 'chord:major', correct: true },
      { item: 'inversion:1', correct: false },
    )

    expect(
      statsRows(stats, CHORD_STATS_VIEW.answer).map((row) => row.id),
    ).toEqual(['major'])
  })
})

describe('mastery buckets', () => {
  it('agrees with what adaptive difficulty is doing', () => {
    // Two definitions of struggling would have the app contradicting itself:
    // the screen calling a chord solid while the exercise drills it.
    const solid = record(...repeat('chord:a', true, 20))
    const learning = record(...repeat('chord:b', false, 20))

    expect(mastery(solid['chord:a'])).toBe('solid')
    expect(mastery(learning['chord:b'])).toBe('learning')
  })

  it('does not call one right answer solid', () => {
    const stats = record({ item: 'chord:a', correct: true })
    expect(mastery(stats['chord:a'])).not.toBe('solid')
  })

  it('has somewhere for a middling item to go', () => {
    const stats = record(
      ...repeat('chord:a', true, 15),
      ...repeat('chord:a', false, 5),
    )
    expect(mastery(stats['chord:a'])).toBe('practising')
  })
})

describe('confusions', () => {
  /** `wrong` misses answered as `as`, plus `right` correct attempts. */
  function withMisses(as: string, wrong: number, right: number) {
    return record(
      ...repeat('chord:diminished', false, wrong).map((a) => ({
        ...a,
        answered: as,
      })),
      ...repeat('chord:diminished', true, right),
    )
  }

  const namedFor = (stats: ExerciseStats) =>
    confusionsFor(
      statsRows(stats, CHORD_STATS_VIEW.answer)[0],
      CHORD_STATS_VIEW.answer,
    )

  it('names what was heard instead, commonest first', () => {
    // The user's own example: right 30% of the time, heard as one thing half
    // the time and as another a fifth of the time. Both are worth saying.
    const stats = record(
      ...repeat('chord:diminished', false, 10).map((a) => ({
        ...a,
        answered: 'minor',
      })),
      ...repeat('chord:diminished', false, 4).map((a) => ({
        ...a,
        answered: 'augmented',
      })),
      ...repeat('chord:diminished', true, 6),
    )

    expect(namedFor(stats)).toEqual(['Minor Triad', 'Augmented Triad'])
  })

  it('leaves out a mistake too rare to be a habit', () => {
    // One miss in twenty is noise. Naming it beside a habitual confusion
    // would read as though both were findings.
    const stats = record(
      ...repeat('chord:diminished', false, 8).map((a) => ({
        ...a,
        answered: 'minor',
      })),
      ...repeat('chord:diminished', false, 1).map((a) => ({
        ...a,
        answered: 'augmented',
      })),
      ...repeat('chord:diminished', true, 11),
    )

    expect(namedFor(stats)).toEqual(['Minor Triad'])
  })

  it('names at most two, however many ways it goes wrong', () => {
    const stats = record(
      ...repeat('chord:diminished', false, 5).map((a) => ({
        ...a,
        answered: 'minor',
      })),
      ...repeat('chord:diminished', false, 5).map((a) => ({
        ...a,
        answered: 'augmented',
      })),
      ...repeat('chord:diminished', false, 5).map((a) => ({
        ...a,
        answered: 'sus2',
      })),
      ...repeat('chord:diminished', true, 5),
    )

    expect(namedFor(stats)).toHaveLength(2)
  })

  it('forgets a mistake once it falls out of the window', () => {
    // A confusion from months ago is not a fact about how the user hears this
    // chord now. It expires with the attempt that carried it.
    let stats = withMisses('minor', 10, 0)
    expect(namedFor(stats)).toEqual(['Minor Triad'])

    stats = recordAttempts(
      stats,
      repeat('chord:diminished', true, RECENT_WINDOW),
      2,
    )
    expect(namedFor(stats)).toEqual([])
  })

  it('stays silent for a section that has not asked to diagnose', () => {
    // The bug this guards: melody stopped recording answers on degrees, but
    // every window written before it stopped still had them, and the screen
    // kept reporting them for another twenty questions. The section decides,
    // not the record.
    const stats = record(
      ...repeat('degree:3', false, 10).map((a) => ({ ...a, answered: '2' })),
      ...repeat('degree:3', true, 10),
    )
    const degrees = MELODY_STATS_VIEW.breakdowns.find(
      (s) => s.namespace === 'degree',
    )!
    const [row] = statsRows(stats, degrees)

    // The stale answers really are in the record...
    expect(row.item.recent.some((a) => a.answered === '2')).toBe(true)
    // ...and the screen still says nothing about them.
    expect(confusionsFor(row, degrees)).toEqual([])
  })

  it('stays silent for a self-graded exercise even if answers appear', () => {
    // Chord root cannot produce one, so a record carrying them is corrupt or
    // stale. Either way the exercise has no wrong answer to name.
    const stats = record(
      ...repeat('chord:major', false, 10).map((a) => ({
        ...a,
        answered: 'minor',
      })),
    )
    const [row] = statsRows(stats, ROOT_STATS_VIEW.answer)

    expect(confusionsFor(row, ROOT_STATS_VIEW.answer)).toEqual([])
  })

  it('has none for a self-graded exercise', () => {
    // Chord root records no answer, because there is none to record.
    const stats = record(...repeat('chord:major', false, 5))
    const [row] = statsRows(stats, ROOT_STATS_VIEW.answer)

    expect(confusionsFor(row, ROOT_STATS_VIEW.answer)).toEqual([])
  })
})

describe('hasAnyStats', () => {
  it('is false before anything has been answered', () => {
    expect(hasAnyStats({})).toBe(false)
  })

  it('is true once something has', () => {
    expect(hasAnyStats(record({ item: 'chord:major', correct: true }))).toBe(
      true,
    )
  })
})
