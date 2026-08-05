import { beforeEach, describe, expect, it } from 'vitest'
import {
  EMPTY_ITEM_STATS,
  RECENT_WINDOW,
  forgetInStore,
  forgetItem,
  itemId,
  itemsInNamespace,
  recordAttempt,
  recordAttempts,
  recordInStore,
  type ExerciseStats,
} from './stats'
import { chordStatsStore } from './stores'

/** A fixed clock, so `lastSeen` can be asserted rather than shrugged at. */
const NOW = 1_700_000_000_000

beforeEach(() => {
  localStorage.clear()
  chordStatsStore.reset()
})

describe('recordAttempt', () => {
  it('starts an item from nothing', () => {
    const stats = recordAttempt({}, { item: 'chord:major', correct: true }, NOW)

    expect(stats['chord:major']).toEqual({
      attempts: 1,
      correct: 1,
      recent: [{ correct: true }],
      lastSeen: NOW,
    })
  })

  it('counts a miss as an attempt but not as correct', () => {
    const stats = recordAttempt(
      {},
      { item: 'chord:major', correct: false },
      NOW,
    )

    expect(stats['chord:major'].attempts).toBe(1)
    expect(stats['chord:major'].correct).toBe(0)
  })

  it('leaves the other items alone', () => {
    const before = recordAttempt({}, { item: 'chord:minor', correct: true }, 1)
    const after = recordAttempt(
      before,
      { item: 'chord:major', correct: false },
      NOW,
    )

    expect(after['chord:minor']).toEqual(before['chord:minor'])
  })

  it('does not mutate what it was given', () => {
    const before: ExerciseStats = {}
    recordAttempt(before, { item: 'chord:major', correct: true }, NOW)
    expect(before).toEqual({})
  })

  it('leaves EMPTY_ITEM_STATS untouched when it starts from it', () => {
    // Shared as a default across every new item, so mutating it would have one
    // chord's history leak into the next chord ever played.
    recordAttempt({}, { item: 'chord:major', correct: true }, NOW)
    expect(EMPTY_ITEM_STATS).toEqual({
      attempts: 0,
      correct: 0,
      recent: [],
      lastSeen: 0,
    })
  })
})

describe('the recent window', () => {
  it('keeps the newest outcomes and drops the oldest', () => {
    // One more than the window, so the first outcome has to fall off.
    let stats: ExerciseStats = {}
    for (let i = 0; i <= RECENT_WINDOW; i++) {
      stats = recordAttempt(
        stats,
        { item: 'chord:major', correct: i > 0 },
        NOW + i,
      )
    }

    const { recent } = stats['chord:major']
    expect(recent).toHaveLength(RECENT_WINDOW)
    // The single false was first and is now gone.
    expect(recent.every((a) => a.correct)).toBe(true)
  })

  it('reads forwards in time, newest last', () => {
    let stats = recordAttempt({}, { item: 'chord:major', correct: false }, 1)
    stats = recordAttempt(stats, { item: 'chord:major', correct: true }, 2)

    expect(stats['chord:major'].recent).toEqual([
      { correct: false },
      { correct: true },
    ])
  })

  it('keeps the lifetime count past the window', () => {
    // The two numbers answer different questions, and the window rolling must
    // not take the total with it.
    let stats: ExerciseStats = {}
    for (let i = 0; i < RECENT_WINDOW * 2; i++) {
      stats = recordAttempt(stats, { item: 'chord:major', correct: true }, NOW)
    }

    expect(stats['chord:major'].attempts).toBe(RECENT_WINDOW * 2)
    expect(stats['chord:major'].recent).toHaveLength(RECENT_WINDOW)
  })
})

describe('what was answered instead', () => {
  it('rides along with the attempt that got it wrong', () => {
    // On the attempt rather than in a lifetime tally, so a mistake expires
    // with the window that holds it.
    const stats = recordAttempt(
      {},
      { item: 'chord:diminished', correct: false, answered: 'minor' },
      NOW,
    )

    expect(stats['chord:diminished'].recent).toEqual([
      { correct: false, answered: 'minor' },
    ])
  })

  it('falls out of the window with the attempt it belongs to', () => {
    // The whole point of moving it here. A mistake made twenty questions ago
    // is not a fact about how the user hears this chord now.
    let stats = recordAttempt(
      {},
      { item: 'chord:diminished', correct: false, answered: 'minor' },
      NOW,
    )
    stats = recordAttempts(
      stats,
      Array.from({ length: RECENT_WINDOW }, () => ({
        item: 'chord:diminished',
        correct: true,
      })),
      NOW,
    )

    expect(stats['chord:diminished'].recent).toHaveLength(RECENT_WINDOW)
    expect(
      stats['chord:diminished'].recent.some((a) => a.answered !== undefined),
    ).toBe(false)
  })

  it('says nothing on a correct answer', () => {
    // "You confused X with X" is not a fact about anything, and recording it
    // would bury the pairs that mean something under every right answer.
    const stats = recordAttempt(
      {},
      { item: 'chord:major', correct: true, answered: 'major' },
      NOW,
    )

    expect(stats['chord:major'].recent).toEqual([{ correct: true }])
  })

  it('stays absent for a self-graded exercise', () => {
    const stats = recordAttempt(
      {},
      { item: 'chord:major', correct: false },
      NOW,
    )
    expect(stats['chord:major'].recent).toEqual([{ correct: false }])
  })
})

describe('recordAttempts', () => {
  it('records every item of one question', () => {
    const stats = recordAttempts(
      {},
      [
        { item: 'chord:major-7th', correct: false, answered: 'major' },
        { item: 'inversion:1', correct: false },
      ],
      NOW,
    )

    expect(Object.keys(stats).sort()).toEqual([
      'chord:major-7th',
      'inversion:1',
    ])
  })
})

describe('recordInStore', () => {
  it('reads the store rather than a snapshot, so two writes both land', () => {
    // The bug this exists to prevent: two presses inside one React batch both
    // read the value their render was built with, and the second write lands
    // on top of the first with the first attempt missing from it.
    const snapshot = chordStatsStore.read()

    recordInStore(
      chordStatsStore,
      [{ item: 'chord:major', correct: true }],
      NOW,
    )
    recordInStore(
      chordStatsStore,
      [{ item: 'chord:major', correct: false }],
      NOW,
    )

    expect(chordStatsStore.read()['chord:major'].attempts).toBe(2)
    // The stale snapshot is exactly what a render would have handed back.
    expect(snapshot['chord:major']).toBeUndefined()
  })

  it('persists, so a reload keeps the record', () => {
    recordInStore(
      chordStatsStore,
      [{ item: 'chord:major', correct: true }],
      NOW,
    )
    expect(localStorage.getItem('met.stats.chords')).toContain('chord:major')
  })
})

describe('item ids', () => {
  it('namespaces a value', () => {
    expect(itemId('chord', 'major-7th')).toBe('chord:major-7th')
    expect(itemId('interval', 6)).toBe('interval:6')
  })

  it('groups one namespace out of a mixed record', () => {
    const stats = recordAttempts(
      {},
      [
        { item: 'chord:major', correct: true },
        { item: 'inversion:0', correct: true },
        { item: 'inversion:2', correct: false },
      ],
      NOW,
    )

    expect(Object.keys(itemsInNamespace(stats, 'inversion')).sort()).toEqual([
      '0',
      '2',
    ])
    expect(Object.keys(itemsInNamespace(stats, 'chord'))).toEqual(['major'])
  })

  it('does not match a namespace that is a prefix of another', () => {
    // `mode` must not sweep up `modeSomething`, or a breakdown silently
    // includes items from a dimension it is not about.
    const stats = recordAttempts(
      {},
      [
        { item: 'mode:block', correct: true },
        { item: 'modeExtra:x', correct: true },
      ],
      NOW,
    )

    expect(Object.keys(itemsInNamespace(stats, 'mode'))).toEqual(['block'])
  })
})

describe('forgetting one item', () => {
  it('removes the entry rather than zeroing it', () => {
    // An item with a record of no attempts is not the same as an item with no
    // record: the sanitiser throws zero-attempt entries away on the next read
    // anyway, and every consumer already knows what to do with an item it has
    // never heard of.
    const stats = recordAttempts(
      {},
      [
        { item: 'interval:7-asc', correct: true },
        { item: 'interval:5-asc', correct: false },
      ],
      NOW,
    )

    const after = forgetItem(stats, 'interval:7-asc')
    expect('interval:7-asc' in after).toBe(false)
    expect(after['interval:5-asc']).toEqual(stats['interval:5-asc'])
  })

  it('leaves everything else exactly as it was', () => {
    const stats = recordAttempts(
      {},
      [
        { item: 'chord:major', correct: true },
        { item: 'chord:minor', correct: false, answered: 'major' },
        { item: 'inversion:1', correct: true },
      ],
      NOW,
    )

    expect(forgetItem(stats, 'chord:major')).toEqual({
      'chord:minor': stats['chord:minor'],
      'inversion:1': stats['inversion:1'],
    })
  })

  it('does not mutate what it was given', () => {
    const stats = recordAttempts(
      {},
      [{ item: 'chord:major', correct: true }],
      NOW,
    )
    forgetItem(stats, 'chord:major')
    expect('chord:major' in stats).toBe(true)
  })

  it('says nothing about an item it has never heard of', () => {
    const stats = recordAttempts(
      {},
      [{ item: 'chord:major', correct: true }],
      NOW,
    )
    expect(forgetItem(stats, 'chord:nonesuch')).toEqual(stats)
  })

  it('reads the store fresh, like recordInStore', () => {
    // The same rule and the same reason: a render-time snapshot loses whatever
    // was written between the render and the tap.
    const store = chordStatsStore
    store.reset()
    recordInStore(store, [
      { item: 'chord:major', correct: true },
      { item: 'chord:minor', correct: true },
    ])

    forgetInStore(store, 'chord:major')

    expect(Object.keys(store.read())).toEqual(['chord:minor'])
  })
})
