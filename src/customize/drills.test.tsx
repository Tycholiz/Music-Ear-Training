import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrillsScreen } from './DrillsScreen'
import { chordDrillStatsStore, itemId, recordInStore } from '../settings'
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
    expect(screen.getByText(/Start anywhere/)).toBeVisible()
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
