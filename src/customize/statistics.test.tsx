import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  chordSettingsStore,
  chordStatsStore,
  progressionStatsStore,
  recordInStore,
  rootStatsStore,
} from '../settings'
import {
  CHORD_STATS_VIEW,
  PROGRESSION_STATS_VIEW,
  ROOT_STATS_VIEW,
} from '../exercises'
import { CHORD_ABOUT } from '../about/pages'
import { ChordSettingsMenu } from './ChordSettingsMenu'
import { StatisticsScreen } from './StatisticsScreen'

function openMenu(view = CHORD_STATS_VIEW, statsStore = chordStatsStore) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <ChordSettingsMenu
        store={chordSettingsStore}
        statsStore={statsStore}
        statsView={view}
        about={CHORD_ABOUT}
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

/**
 * The card or block under a given heading.
 *
 * Two shapes reach this. A `ListCard` title now sits in a header *row*, so a
 * section control can stand beside it, which puts the card one further up. A
 * statistics section heading sits directly in the block holding its cards.
 */
function cardUnder(title: string) {
  const heading = screen.getByRole('heading', { name: title })
  const parent = heading.parentElement
  const card =
    parent?.parentElement?.tagName === 'SECTION' ? parent.parentElement : parent
  if (!card) throw new Error(`no card for ${title}`)
  return within(card)
}

/**
 * The names listed under a row, in order.
 *
 * Confusions are lines under the label now rather than a clause inside it, so
 * they are read off the row's own element rather than matched as a sentence.
 */
function confusionElements(label: string): Element[] {
  const row = screen.getByText(label).closest('div')
  if (!row) throw new Error(`no row for ${label}`)
  const lead = within(row).getByText('often mistaken for:')
  return [...(lead.parentElement?.children ?? [])].slice(1)
}

function confusionsUnder(label: string): string[] {
  return confusionElements(label).map((node) => node.textContent ?? '')
}

function times(item: string, correct: boolean, n: number, answered?: string) {
  return Array.from({ length: n }, () => ({ item, correct, answered }))
}

/**
 * Section headings in the order the screen renders them.
 *
 * Minus the modal's own title, which is chrome rather than part of the screen.
 */
function headings(): string[] {
  return screen
    .getAllByRole('heading')
    .map((h) => h.textContent ?? '')
    .filter((text) => text && text !== 'Statistics')
}

beforeEach(() => {
  localStorage.clear()
  chordSettingsStore.reset()
  chordStatsStore.reset()
  rootStatsStore.reset()
  progressionStatsStore.reset()
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
      ...times('chord:diminished', true, 4),
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

    expect(screen.getByText('often mistaken for:')).toBeVisible()
    expect(confusionsUnder('Diminished Triad')).toEqual(['Minor Triad'])
  })

  it('shows the confusion on the row it belongs to, not in a list of its own', async () => {
    const user = openMenu()
    await openStatistics(user)

    expect(
      cardUnder('Needs work').getByText('often mistaken for:'),
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

describe('several ways to get one thing wrong', () => {
  it('names both when a mistake splits two ways', async () => {
    // A perfect 5th heard as an octave half the time and a major 3rd a fifth
    // of the time: two habits, and only naming the commoner one hides half
    // the diagnosis.
    recordInStore(chordStatsStore, [
      ...times('chord:major', false, 10, 'minor'),
      ...times('chord:major', false, 4, 'augmented'),
      ...times('chord:major', true, 6),
    ])
    const user = openMenu()
    await openStatistics(user)

    // One per line rather than joined into a clause, so a third name costs a
    // line instead of making the sentence unreadable.
    expect(confusionsUnder('Major Triad')).toEqual([
      'Minor Triad',
      'Augmented Triad',
    ])
    // Not "Minor Triad and Augmented Triad" in one run of text.
    expect(screen.queryByText(/Minor Triad and/)).toBeNull()
    // And genuinely one per *line*. Reading the names off separate elements
    // says nothing about how they lay out — they were flipped to `inline` by
    // accident in #132 and every assertion here still passed while the screen
    // showed them run together on one line.
    for (const node of confusionElements('Major Triad')) {
      expect(node.className, node.textContent ?? '').toContain('block')
    }
  })

  it('stays silent about a mistake that is not a habit', async () => {
    recordInStore(chordStatsStore, [
      ...times('chord:major', false, 8, 'minor'),
      ...times('chord:major', false, 1, 'augmented'),
      ...times('chord:major', true, 11),
    ])
    const user = openMenu()
    await openStatistics(user)

    expect(confusionsUnder('Major Triad')).toEqual(['Minor Triad'])
    expect(screen.queryByText(/Augmented/)).toBeNull()
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

  it('keeps its heading while it is still filling up', async () => {
    // Melody's opening degrees accrue one per melody, not one per note, so
    // this section is the last to appear and the most useful when it does.
    // Vanishing silently left the screen saying "you struggle with the first
    // note" and nothing about which one — which is the complaint that led
    // here.
    recordInStore(rootStatsStore, [
      ...times('chord:major', true, 10),
      ...times('inversion:1', true, 2),
    ])
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    expect(screen.getByRole('heading', { name: 'By inversion' })).toBeVisible()
    expect(screen.getByText(/still being measured/)).toBeVisible()
    expect(
      screen.getByText(/keep practising and this will fill in/),
    ).toBeVisible()
  })

  it('says nothing about a breakdown with no data at all', async () => {
    // Nothing to promise, so no heading. Only a section that has started
    // collecting earns a placeholder.
    recordInStore(rootStatsStore, times('chord:major', true, 10))
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    expect(screen.queryByRole('heading', { name: 'By inversion' })).toBeNull()
  })

  it('shows no confusions for a self-graded exercise', async () => {
    // There is no wrong answer to name — only the user's word that they had
    // the note or did not. Seeded *with* answers, which chord root cannot
    // produce, so this fails if the screen reports whatever it finds instead
    // of what the section asked for. That is exactly how a stale record kept
    // showing "♭3 often mistaken for 2" after melody stopped writing it.
    recordInStore(rootStatsStore, times('chord:major', false, 10, 'minor'))
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    expect(screen.getByText('Major Triad')).toBeVisible()
    expect(screen.queryByText('often mistaken for:')).toBeNull()
  })
})

describe('the accuracy column', () => {
  it('keeps every figure on one line, whatever its length', async () => {
    // "33% accurate" is a word longer than "0% accurate". Squeezed by a long
    // label the longer one broke over two lines and the shorter one did not,
    // which is what put two figures in one card at different heights.
    recordInStore(chordStatsStore, [
      ...times('chord:major', true, 20),
      ...times('chord:diminished', false, 20, 'minor'),
    ])
    const user = openMenu()
    await openStatistics(user)

    for (const text of ['100% accurate', '0% accurate']) {
      expect(screen.getByText(text).className).toContain('whitespace-nowrap')
    }
  })

  it('lines the figure up with the row label, not the middle of the row', async () => {
    // The rows are different heights, because some carry confusion lines and
    // some do not. Centred, each figure drifts to the middle of its own row.
    recordInStore(
      chordStatsStore,
      times('chord:diminished', false, 20, 'minor'),
    )
    const user = openMenu()
    await openStatistics(user)

    const row = screen.getByText('0% accurate').closest('div.flex')
    expect(row?.className).toContain('items-baseline')
  })

  it('sets the figure smaller than the item it describes', async () => {
    // A supporting figure rather than the row's headline: the item name is
    // what the reader is scanning for, and at the row's own size the number
    // competed with it.
    recordInStore(chordStatsStore, times('chord:major', true, 20))
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText('100% accurate').className).toContain('text-xs')
    expect(screen.getByText('Major Triad').className).not.toContain('text-xs')
  })
})

/**
 * The coarse finding, for the user the per-chord rows cannot serve.
 *
 * Both halves are on screen at once and neither replaces the other: the
 * quality roll-up is what a beginner needs, the per-chord confusions are what
 * someone working on extensions needs, and a screen showing only one of them
 * is wrong for half its users.
 */
describe('the chord-quality roll-up', () => {
  it('names a habit before any single chord row can appear', async () => {
    // Four major chords with four attempts each, one of them heard as a minor
    // chord — a different minor chord every time. Every row is under the
    // reporting threshold and the screen shows none of them, while a quarter
    // of the sixteen attempts between them went to a minor chord.
    recordInStore(chordStatsStore, [
      ...times('chord:major', false, 1, 'minor'),
      ...times('chord:major', true, 3),
      ...times('chord:major-6th', false, 1, 'minor-6th'),
      ...times('chord:major-6th', true, 3),
      ...times('chord:major-7th', false, 1, 'minor-7th'),
      ...times('chord:major-7th', true, 3),
      ...times('chord:add9', false, 1, 'minor-add9'),
      ...times('chord:add9', true, 3),
    ])
    const user = openMenu()
    await openStatistics(user)

    expect(screen.getByText('Major chords answered as minor')).toBeVisible()
    expect(screen.getByText('25% of the time')).toBeVisible()
    // Nothing chord by chord: this is the whole screen for this user, and
    // before the roll-up existed it said only that four things were still
    // being measured.
    expect(screen.queryByText('often mistaken for:')).toBeNull()
    expect(screen.queryByText('Major Triad')).toBeNull()
  })

  it('leads the screen, above what the chords say one at a time', async () => {
    recordInStore(chordStatsStore, [
      ...times('chord:major', false, 6, 'minor'),
      ...times('chord:major', true, 14),
    ])
    const user = openMenu()
    await openStatistics(user)

    const shown = headings()
    expect(shown[0]).toBe('Hearing one kind of chord as another')
    expect(shown).toContain('Naming each chord')
    // Both halves, on one screen. The roll-up says the habit runs through
    // every major chord; the row below still says which one it was measured on.
    expect(confusionsUnder('Major Triad')).toEqual(['Minor Triad'])
  })

  it('is not there at all for a user who has no such habit', async () => {
    // Which is what makes it safe to put first. Someone past this stage opens
    // the screen on the buckets, as they did before it existed.
    recordInStore(chordStatsStore, [
      ...times('chord:major', false, 6, 'major-7th'),
      ...times('chord:major', true, 14),
    ])
    const user = openMenu()
    await openStatistics(user)

    expect(headings()[0]).toBe('Naming each chord')
    expect(
      screen.queryByRole('heading', {
        name: 'Hearing one kind of chord as another',
      }),
    ).toBeNull()
  })

  it('offers no swipe to reset, having no single record behind it', async () => {
    // A per-row action that would have to clear three chords' records to
    // clear one row. The row the user means is swipeable in the section below.
    recordInStore(chordStatsStore, [
      ...times('chord:major', false, 6, 'minor'),
      ...times('chord:major', true, 14),
    ])
    const user = openMenu()
    await openStatistics(user)

    expect(
      screen.queryByRole('button', {
        name: /Reset Major chords answered as minor/,
      }),
    ).toBeNull()
    // The per-chord row still has one.
    expect(
      screen.getByRole('button', { name: 'Reset Major Triad' }),
    ).toBeInTheDocument()
  })

  it('stays off the chord root screen, which is self-graded', async () => {
    // Seeded with answers chord root cannot produce, so this fails if the
    // roll-up reads the record instead of the view.
    recordInStore(rootStatsStore, times('chord:major', false, 20, 'minor'))
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    expect(screen.queryByText(/answered as minor/)).toBeNull()
  })
})

describe('sections and the buckets inside them', () => {
  it('gives every section a heading, not just the bucketed one', async () => {
    // They are peers in the model and used to render a tier apart: the
    // bucketed measure got a real heading, everything else got only the small
    // uppercase strip a card draws. Nothing on screen said the two were at the
    // same level, which is the whole complaint that led here.
    recordInStore(rootStatsStore, [
      ...times('chord:major', true, 10),
      ...times('inversion:0', true, 10),
    ])
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    // Section, then its subsection; section, then its subsection-less card.
    expect(headings()).toEqual(['Naming each chord', 'Solid', 'By inversion'])
  })

  it('leads the progression screen with the first chord', async () => {
    // The first chord is heard against the key alone; every later chord has
    // the one before it as a landmark. The harder measure used to sit below a
    // bucketed figure that was quietly averaging it in.
    recordInStore(progressionStatsStore, [
      ...times('opening:I', true, 6),
      ...times('opening:V', false, 6, 'I'),
      ...times('numeral:IV', true, 10),
    ])
    render(
      <StatisticsScreen
        store={progressionStatsStore}
        view={PROGRESSION_STATS_VIEW}
        onReset={vi.fn()}
      />,
    )

    const shown = headings()
    expect(shown[0]).toBe('First chord recognition')
    expect(shown).toContain('Naming each chord after the first')
    expect(shown.indexOf('First chord recognition')).toBeLessThan(
      shown.indexOf('Naming each chord after the first'),
    )
  })

  it('diagnoses the first chord even though it is not bucketed', async () => {
    // A plain list can still be the most diagnostic thing on the screen.
    recordInStore(progressionStatsStore, times('opening:V', false, 8, 'I'))
    render(
      <StatisticsScreen
        store={progressionStatsStore}
        view={PROGRESSION_STATS_VIEW}
        onReset={vi.fn()}
      />,
    )

    expect(cardUnder('First chord recognition').getByText('I')).toBeVisible()
    expect(confusionsUnder('V')).toEqual(['I'])
  })

  it('keeps the opening chord out of the buckets', async () => {
    // The recording side stopped writing openings to `numeral`, so a `V` the
    // user only ever meets as an opening has nothing to bucket. Seeded with
    // both namespaces holding the same numeral, which is what a record written
    // before the split looks like — the buckets must show only the one.
    recordInStore(progressionStatsStore, [
      ...times('opening:V', false, 10, 'I'),
      ...times('numeral:IV', true, 10),
    ])
    render(
      <StatisticsScreen
        store={progressionStatsStore}
        view={PROGRESSION_STATS_VIEW}
        onReset={vi.fn()}
      />,
    )

    const buckets = cardUnder('Naming each chord after the first')
    expect(buckets.getByText('IV')).toBeVisible()
    expect(buckets.queryByText('V')).toBeNull()
  })

  it('reads root and bass movement as two sections, each holding only its own', async () => {
    // One list called "By root and bass movement" was two findings under one
    // heading. Worst-first interleaves them, so a reader had to check each row's
    // prefix to know which measure it belonged to.
    recordInStore(progressionStatsStore, [
      ...times('root-movement:up-fourth', true, 10),
      ...times('bass-movement:third', false, 10),
    ])
    render(
      <StatisticsScreen
        store={progressionStatsStore}
        view={PROGRESSION_STATS_VIEW}
        onReset={vi.fn()}
      />,
    )

    const root = cardUnder('By root movement')
    expect(root.getByText('Root moves up a fourth')).toBeVisible()
    expect(root.queryByText(/^Bass/)).toBeNull()

    const bass = cardUnder('By bass movement')
    expect(bass.getByText('Bass moves by a third')).toBeVisible()
    expect(bass.queryByText(/^Root/)).toBeNull()
  })

  it('lists cadences the way the Customize screen does, whatever the accuracy', async () => {
    // A user who has just chosen four cadences on one screen should not meet
    // them shuffled on the next. Seeded worst-to-best in reverse of the
    // canonical order, so accuracy sorting would produce the exact opposite.
    recordInStore(progressionStatsStore, [
      ...times('cadence:deceptive', false, 10),
      ...times('cadence:half', true, 5),
      ...times('cadence:half', false, 5),
      ...times('cadence:plagal', true, 8),
      ...times('cadence:plagal', false, 2),
      ...times('cadence:authentic', true, 10),
    ])
    render(
      <StatisticsScreen
        store={progressionStatsStore}
        view={PROGRESSION_STATS_VIEW}
        onReset={vi.fn()}
      />,
    )

    const rows = cardUnder('By cadence')
      .getAllByText(/^(Authentic|Plagal|Half|Deceptive|Secondary)$/)
      .map((node) => node.textContent)

    expect(rows).toEqual(['Authentic', 'Plagal', 'Half', 'Deceptive'])
  })

  it('says nothing at all about movement records written before the split', async () => {
    // `movement:root-up-fourth` is what this looked like beforehand. No section
    // reads that namespace now, so the rows are simply gone rather than
    // surfacing under a heading that no longer describes them — and the screen
    // still renders the sections it does have data for.
    recordInStore(progressionStatsStore, [
      ...times('movement:root-up-fourth', true, 10),
      ...times('movement:bass-third', false, 10),
      ...times('numeral:IV', true, 10),
    ])
    render(
      <StatisticsScreen
        store={progressionStatsStore}
        view={PROGRESSION_STATS_VIEW}
        onReset={vi.fn()}
      />,
    )

    expect(headings()).not.toContain('By root movement')
    expect(headings()).not.toContain('By bass movement')
    expect(screen.queryByText(/Root moves up a fourth/)).toBeNull()
    expect(
      cardUnder('Naming each chord after the first').getByText('IV'),
    ).toBeVisible()
  })
})

describe('resetting one statistic', () => {
  it('clears only the item that was reset', async () => {
    // Improvement is per item. Someone who has fixed one interval should not
    // have to choose between waiting twenty questions for the window to roll
    // and throwing away everything they know about every other one.
    recordInStore(chordStatsStore, [
      ...times('chord:major', true, 20),
      ...times('chord:diminished', false, 20, 'minor'),
    ])
    const user = openMenu()
    await openStatistics(user)

    await user.click(
      screen.getByRole('button', { name: 'Reset Diminished Triad' }),
    )

    await waitFor(() =>
      expect(Object.keys(chordStatsStore.read())).toEqual(['chord:major']),
    )
  })

  it('takes the row off the screen rather than leaving it at zero', async () => {
    // The item has not been practised too little, it has not been practised at
    // all — which is exactly where it was before the user first met it.
    recordInStore(chordStatsStore, [
      ...times('chord:major', true, 20),
      ...times('chord:diminished', false, 20, 'minor'),
    ])
    const user = openMenu()
    await openStatistics(user)

    await user.click(
      screen.getByRole('button', { name: 'Reset Diminished Triad' }),
    )

    await waitFor(() =>
      expect(screen.queryByText('Diminished Triad')).toBeNull(),
    )
    expect(screen.getByText('Major Triad')).toBeVisible()
    expect(screen.queryByText(/1 other needs more practice/)).toBeNull()
  })

  it('offers the same reset on a breakdown row', async () => {
    // Nothing makes a chord's record worth clearing while an inversion's is
    // not — "I have fixed this and the number is lagging" applies to both.
    recordInStore(rootStatsStore, [
      ...times('chord:major', true, 20),
      ...times('inversion:0', true, 20),
      ...times('inversion:1', false, 20),
    ])
    const user = openMenu(ROOT_STATS_VIEW, rootStatsStore)
    await openStatistics(user)

    await user.click(
      screen.getByRole('button', { name: 'Reset 1st inversion' }),
    )

    await waitFor(() =>
      expect('inversion:1' in rootStatsStore.read()).toBe(false),
    )
    expect(rootStatsStore.read()['inversion:0']).toBeDefined()
  })

  it('leaves the other exercises untouched', async () => {
    recordInStore(chordStatsStore, times('chord:major', true, 20))
    recordInStore(rootStatsStore, times('chord:major', true, 20))
    const user = openMenu()
    await openStatistics(user)

    await user.click(screen.getByRole('button', { name: 'Reset Major Triad' }))

    await waitFor(() => expect(chordStatsStore.read()).toEqual({}))
    expect(rootStatsStore.read()['chord:major']).toBeDefined()
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
