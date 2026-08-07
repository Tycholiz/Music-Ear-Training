import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrillsScreen } from './DrillsScreen'
import {
  chordDrillStatsStore,
  chordStatsStore,
  itemId,
  recordInStore,
} from '../settings'
import { DRILLS, DRILL_NAMESPACE, drillProgress } from '../exercises'

function drilled(id: string, correct: boolean, times: number) {
  recordInStore(
    chordDrillStatsStore,
    Array.from({ length: times }, () => ({
      item: itemId(DRILL_NAMESPACE, id),
      correct,
    })),
  )
}

beforeEach(() => {
  localStorage.clear()
  chordDrillStatsStore.reset()
  chordStatsStore.reset()
})

describe('the list', () => {
  it('names both chords of every pair', () => {
    render(<DrillsScreen onStart={vi.fn()} />)

    expect(screen.getByText('Major Triad vs Minor Triad')).toBeVisible()
    expect(screen.getByText('Dominant 7th vs Dominant 9th')).toBeVisible()
  })

  it('says what to listen for on each one', () => {
    render(<DrillsScreen onStart={vi.fn()} />)

    expect(
      screen.getByText(/The third\. Everything else about the two chords/),
    ).toBeVisible()
  })

  it('leaves an untried drill out of the buckets', () => {
    // An untried drill is not a weak one. Putting it under "needs work" would
    // be a verdict on evidence nobody has collected.
    render(<DrillsScreen onStart={vi.fn()} />)

    expect(screen.queryByText('Needs work')).toBeNull()
    expect(screen.getByText(/Each drill is/)).toBeVisible()
  })

  it('buckets a drill once it has been done', () => {
    drilled('major-minor', false, 10)
    render(<DrillsScreen onStart={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Needs work' })).toBeVisible()
  })

  it('separates a solid drill from one that needs work', () => {
    drilled('major-minor', true, 10)
    drilled('dominant-7th-9th', false, 10)
    render(<DrillsScreen onStart={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Solid' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Needs work' })).toBeVisible()
  })

  it('starts the drill that was pressed', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<DrillsScreen onStart={onStart} />)

    await user.click(screen.getByText('Major Triad vs Minor Triad'))
    expect(onStart).toHaveBeenCalledWith('major-minor')
  })
})

describe('the order', () => {
  it('is by how fundamental the distinction is, not how hard', () => {
    // Someone working down the list builds on what they already have. Ordering
    // by difficulty would open with the extensions and bury major against
    // minor, which everything else depends on.
    const ids = drillProgress({}).map((entry) => entry.drill.id)

    expect(ids[0]).toBe('major-minor')
    expect(ids.indexOf('major-minor')).toBeLessThan(
      ids.indexOf('dominant-11th-13th'),
    )
  })

  it('covers every drill exactly once', () => {
    const ids = drillProgress({}).map((entry) => entry.drill.id)

    expect(ids).toHaveLength(DRILLS.length)
    expect(new Set(ids).size).toBe(DRILLS.length)
  })
})

/** `n` recent attempts at `chord`, `mistaken` of them answered as `other`. */
function played(chord: string, n: number, mistaken = 0, other?: string): void {
  recordInStore(chordStatsStore, [
    ...Array.from({ length: mistaken }, () => ({
      item: itemId('chord', chord),
      correct: false,
      answered: other,
    })),
    ...Array.from({ length: n - mistaken }, () => ({
      item: itemId('chord', chord),
      correct: true,
    })),
  ])
}

describe('what ordinary play already says', () => {
  it('marks a pair solid without it ever being drilled', () => {
    // The point of the whole thing: an experienced musician is never pushed
    // through major against minor to prove something they demonstrate every
    // time they use the exercise.
    played('major', 20)
    played('minor', 20)

    const entry = drillProgress({}, chordStatsStore.read()).find(
      (e) => e.drill.id === 'major-minor',
    )!
    expect(entry.evidence.kind).toBe('no-confusion')
    expect(entry.bucket).toBe('solid')
  })

  it('says on the row where that came from', () => {
    // A drill marked solid that the user never opened looks like a lost record
    // unless the screen says otherwise.
    played('major', 20)
    played('minor', 20)
    render(<DrillsScreen onStart={vi.fn()} />)

    expect(
      screen.getByText('You already tell these apart in the exercise.'),
    ).toBeVisible()
  })

  it('needs both chords to have been met, not just one', () => {
    // A clean record on one chord says nothing about telling it from a chord
    // the user has never heard.
    played('major', 20)

    const entry = drillProgress({}, chordStatsStore.read()).find(
      (e) => e.drill.id === 'major-minor',
    )!
    expect(entry.evidence.kind).toBe('unknown')
    expect(entry.bucket).toBeNull()
  })

  it('calls a pair confused when the mistakes are a habit', () => {
    played('major', 20, 8, 'minor')
    played('minor', 20)

    const entry = drillProgress({}, chordStatsStore.read()).find(
      (e) => e.drill.id === 'major-minor',
    )!
    expect(entry.evidence.kind).toBe('confused')
  })

  it('reads one slip as a slip rather than a habit', () => {
    // The same threshold the statistics screen uses to decide a mistake is
    // worth naming, read from the other side.
    played('major', 20, 1, 'minor')
    played('minor', 20)

    const entry = drillProgress({}, chordStatsStore.read()).find(
      (e) => e.drill.id === 'major-minor',
    )!
    expect(entry.evidence.kind).toBe('no-confusion')
  })

  it('lets a drill the user actually did outrank what was inferred', () => {
    // Direct evidence beats inference: the drill asked the same question.
    played('major', 20)
    played('minor', 20)
    drilled('major-minor', false, 10)

    const entry = drillProgress(
      chordDrillStatsStore.read(),
      chordStatsStore.read(),
    ).find((e) => e.drill.id === 'major-minor')!
    expect(entry.evidence.kind).toBe('drilled')
    expect(entry.bucket).toBe('learning')
  })
})

describe('the order the list puts them in', () => {
  it('puts a confused pair above untouched ones, however advanced', () => {
    played('dominant-11th', 20, 8, 'dominant-13th')
    played('dominant-13th', 20)

    const ids = drillProgress({}, chordStatsStore.read()).map((e) => e.drill.id)
    expect(ids[0]).toBe('dominant-11th-13th')
  })

  it('still works up from the most fundamental within a tier', () => {
    // Someone who mixes up both should fix major against minor first, whichever
    // they get wrong more often, because everything else is built on it.
    played('major', 20, 8, 'minor')
    played('minor', 20)
    played('dominant-11th', 20, 12, 'dominant-13th')
    played('dominant-13th', 20)

    const ids = drillProgress({}, chordStatsStore.read()).map((e) => e.drill.id)
    expect(ids.indexOf('major-minor')).toBeLessThan(
      ids.indexOf('dominant-11th-13th'),
    )
  })

  it('drops what is already filed to the bottom of the working list', () => {
    played('major', 20)
    played('minor', 20)

    const ids = drillProgress({}, chordStatsStore.read()).map((e) => e.drill.id)
    expect(ids.at(-1)).toBe('major-minor')
  })
})
