import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  chordSettingsStore,
  chordStatsStore,
  recordInStore,
  rootStatsStore,
} from '../settings'
import { CHORD_STATS_VIEW, ROOT_STATS_VIEW } from '../exercises'
import { ChordSettingsMenu } from './ChordSettingsMenu'

function openMenu(view = CHORD_STATS_VIEW, statsStore = chordStatsStore) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <ChordSettingsMenu
        store={chordSettingsStore}
        statsStore={statsStore}
        statsView={view}
        onResetScore={vi.fn()}
      />
    </ModalSheet>,
  )
  return user
}

async function openStatistics(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^Statistics/ }))
}

/** The card under a given section heading. */
function cardUnder(title: string) {
  const heading = screen.getByRole('heading', { name: title })
  const card = heading.parentElement
  if (!card) throw new Error(`no card for ${title}`)
  return within(card)
}

function times(item: string, correct: boolean, n: number, answered?: string) {
  return Array.from({ length: n }, () => ({ item, correct, answered }))
}

beforeEach(() => {
  localStorage.clear()
  chordSettingsStore.reset()
  chordStatsStore.reset()
  rootStatsStore.reset()
})

describe('an empty record', () => {
  it('says what to do rather than showing zeroes', async () => {
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText(/Nothing recorded yet/i)).toBeVisible()
    expect(screen.queryByText('0%')).toBeNull()
  })
})

describe('what am I bad at', () => {
  beforeEach(() => {
    recordInStore(chordStatsStore, [
      ...times('chord:major', true, 20),
      ...times('chord:diminished', false, 12, 'minor'),
      ...times('chord:augmented', true, 14),
      ...times('chord:augmented', false, 6),
    ])
  })

  it('puts what is going worst in its own section, first', async () => {
    const user = openMenu()
    await openStatistics(user)

    const headings = screen
      .getAllByRole('heading')
      .map((h) => h.textContent)
      .filter((t) => t && ['Needs work', 'Getting there', 'Solid'].includes(t))

    expect(headings[0]).toBe('Needs work')
    expect(cardUnder('Needs work').getByText('Diminished Triad')).toBeVisible()
    expect(cardUnder('Solid').getByText('Major Triad')).toBeVisible()
  })

  it('names what the chord is being mistaken for', async () => {
    // The only diagnostic thing on the screen. "41%" says practise more, which
    // the user knew; "you hear it as minor" says what to listen for.
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText(/Heard as Minor Triad/)).toBeVisible()
  })

  it('shows the confusion on the row it belongs to, not in a list of its own', async () => {
    const user = openMenu()
    await openStatistics(user)

    expect(
      cardUnder('Needs work').getByText(/Heard as Minor Triad/),
    ).toBeVisible()
  })

  it('says what the percentage is a percentage of, and nothing else', async () => {
    // "70% of 20" read like a fraction — 70% *of the number* 20. The sample
    // size is not shown at all: the threshold already guarantees the figure is
    // worth trusting, so it would be a number with no job.
    const user = openMenu()
    await openStatistics(user)

    // A statistics row is not pressable, so it is a div rather than a button.
    const row = screen.getByText('Augmented Triad').closest('div')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/70% accurate/)).toBeVisible()
    expect(within(row!).queryByText(/20 attempts/)).toBeNull()
  })
})

describe('thin evidence', () => {
  it('keeps a barely-answered item out of the buckets, not just out of the numbers', async () => {
    // One correct answer used to land under "Getting there" with no percentage
    // beside it: a verdict delivered on evidence the same screen was refusing
    // to summarise. It is now not shown at all.
    recordInStore(chordStatsStore, times('chord:major', true, 1))
    const user = openMenu()
    await openStatistics(user)

    expect(screen.queryByText('Major Triad')).toBeNull()
    expect(screen.queryByText('Getting there')).toBeNull()
  })

  it('counts what is missing in one line rather than per row', async () => {
    // The user does not need to know how many more attempts each one wants,
    // only that some things have not been practised enough yet.
    recordInStore(chordStatsStore, [
      ...times('chord:major', true, 10),
      ...times('chord:minor', true, 2),
      ...times('chord:diminished', false, 1),
    ])
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText('Major Triad')).toBeVisible()
    expect(screen.getByText(/2 others need more practice/)).toBeVisible()
    expect(screen.queryByText(/more to go/)).toBeNull()
  })

  it('agrees with itself when only one item is short', async () => {
    recordInStore(chordStatsStore, [
      ...times('chord:major', true, 10),
      ...times('chord:minor', true, 2),
    ])
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText(/1 other needs more practice/)).toBeVisible()
  })

  it('says something useful when nothing has been answered enough', async () => {
    // Otherwise the screen is a Reset button and a count of things it will not
    // talk about.
    recordInStore(chordStatsStore, times('chord:major', true, 2))
    const user = openMenu()
    await openStatistics(user)

    expect(
      screen.getByText(/Nothing has been answered enough times yet/),
    ).toBeVisible()
  })
})

describe('the breakdowns', () => {
  it('gives chord root its inversion figures, which are its whole difficulty', async () => {
    recordInStore(rootStatsStore, [
      ...times('chord:major', true, 10),
      ...times('inversion:0', true, 9),
      ...times('inversion:0', false, 1),
      ...times('inversion:2', false, 8),
      ...times('inversion:2', true, 2),
    ])
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    const inversions = cardUnder('By inversion')
    expect(inversions.getByText('Root position')).toBeVisible()
    expect(inversions.getByText(/90%/)).toBeVisible()
    expect(inversions.getByText(/20%/)).toBeVisible()
  })

  it('shows no confusions for a self-graded exercise', async () => {
    // There is no wrong answer to name — only the user's word that they had
    // the note or did not.
    recordInStore(rootStatsStore, times('chord:major', false, 10))
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    expect(screen.queryByText(/Heard as/)).toBeNull()
  })
})

describe('resetting', () => {
  it('clears this exercise and says what else that affects', async () => {
    recordInStore(chordStatsStore, times('chord:major', true, 10))
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText(/adaptive difficulty reads this/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Reset Statistics/ }))

    await waitFor(() => expect(chordStatsStore.read()).toEqual({}))
    expect(screen.getByText(/Nothing recorded yet/i)).toBeVisible()
  })

  it('leaves the other exercises alone', async () => {
    recordInStore(chordStatsStore, times('chord:major', true, 10))
    recordInStore(rootStatsStore, times('chord:major', true, 10))
    const user = openMenu()
    await openStatistics(user)

    await user.click(screen.getByRole('button', { name: /Reset Statistics/ }))

    await waitFor(() => expect(chordStatsStore.read()).toEqual({}))
    expect(Object.keys(rootStatsStore.read())).toContain('chord:major')
  })
})
