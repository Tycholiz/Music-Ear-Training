import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  DEFAULT_INTERVAL_SETTINGS,
  intervalSettingsStore,
  type IntervalSettings,
} from '../settings'
import { IntervalMenu } from './IntervalMenu'

function openMenu(onResetScore = vi.fn()) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <IntervalMenu onResetScore={onResetScore} />
    </ModalSheet>,
  )
  return { user, onResetScore }
}

async function goTo(
  user: ReturnType<typeof userEvent.setup>,
  ...screens: string[]
) {
  await user.click(screen.getByRole('button', { name: 'Customize Exercise' }))
  for (const name of screens) {
    await user.click(screen.getByRole('button', { name: new RegExp(name) }))
  }
}

function write(overrides: Partial<IntervalSettings>) {
  intervalSettingsStore.write({ ...DEFAULT_INTERVAL_SETTINGS, ...overrides })
}

beforeEach(() => {
  localStorage.clear()
  intervalSettingsStore.reset()
})

describe('menu root', () => {
  it('offers Reset Score and Customize Exercise', () => {
    openMenu()
    expect(screen.getByRole('button', { name: 'Reset Score' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Customize Exercise/ }),
    ).toBeVisible()
  })

  it('calls back on Reset Score rather than touching settings', async () => {
    const { user, onResetScore } = openMenu()
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))
    expect(onResetScore).toHaveBeenCalledOnce()
  })
})

describe('customize screen', () => {
  it('summarises each setting on its row', async () => {
    const { user } = openMenu()
    await goTo(user)

    expect(screen.getByRole('button', { name: /Intervals/ })).toHaveTextContent(
      '12 selected',
    )
    expect(screen.getByRole('button', { name: /Play Mode/ })).toHaveTextContent(
      '2 selected',
    )
    expect(screen.getByRole('button', { name: /Range/ })).toHaveTextContent(
      'C3–C5',
    )
  })

  it('warns when no question can be generated at all', async () => {
    write({ intervals: [13], playModes: ['descending'] })
    const { user } = openMenu()
    await goTo(user)

    expect(screen.getByText(/Nothing can be played/)).toBeVisible()
  })

  it('stays silent when settings are workable', async () => {
    const { user } = openMenu()
    await goTo(user)
    expect(screen.queryByText(/Nothing can be played/)).toBeNull()
  })
})

describe('intervals screen', () => {
  it('lists all 24 intervals, split into simple and compound', async () => {
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    // Twenty-four, not twenty-five: there is no Unison to offer. The "All …"
    // rows are checkboxes too and stand for groups rather than intervals.
    expect(
      screen
        .getAllByRole('checkbox')
        .filter((box) => !/^All /.test(box.textContent ?? '')),
    ).toHaveLength(24)
    expect(screen.getByRole('heading', { name: 'Simple' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Compound' })).toBeVisible()
  })

  it('offers no Unison at all, and leaves the compounds off', async () => {
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    expect(screen.queryByRole('checkbox', { name: 'Unison' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Minor 2nd' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Octave' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Minor 9th' }),
    ).not.toBeChecked()
  })

  it('persists a toggle straight away', async () => {
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    await user.click(screen.getByRole('checkbox', { name: 'Minor 9th' }))
    await waitFor(() =>
      expect(intervalSettingsStore.read().intervals).toContain(13),
    )

    await user.click(screen.getByRole('checkbox', { name: 'Minor 2nd' }))
    await waitFor(() =>
      expect(intervalSettingsStore.read().intervals).not.toContain(1),
    )
  })

  it('disables intervals the range cannot reach', async () => {
    write({ range: { low: 60, high: 66 }, intervals: [1, 2] })
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    // Seven semitones of room, so an Octave can't be switched on.
    expect(screen.getByRole('checkbox', { name: 'Octave' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Perfect 4th' })).toBeEnabled()
  })

  it('disables compound intervals when only descending is enabled', async () => {
    write({ playModes: ['descending'], range: { low: 21, high: 108 } })
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    expect(screen.getByRole('checkbox', { name: 'Minor 9th' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Octave' })).toBeEnabled()
  })

  it('lets the last remaining interval go', async () => {
    // Switching off the last one is allowed now. The exercise says it has
    // nothing to ask — a state it already shows for a range too narrow to
    // play in — rather than the screen refusing the tap, which made the
    // section "select all" work on one list and silently not on another.
    write({ intervals: [7] })
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    const only = screen.getByRole('checkbox', { name: 'Perfect 5th' })
    expect(only).toBeEnabled()

    await user.click(only)
    await waitFor(() =>
      expect(intervalSettingsStore.read().intervals).toEqual([]),
    )
  })

  it('still allows switching off an interval that has become unreachable', async () => {
    // Enabled but too wide for the range: it must stay removable.
    write({ intervals: [7, 24], range: { low: 60, high: 72 } })
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    const doubleOctave = screen.getByRole('checkbox', { name: 'Double Octave' })
    expect(doubleOctave).toBeEnabled()
    await user.click(doubleOctave)
    await waitFor(() =>
      expect(intervalSettingsStore.read().intervals).not.toContain(24),
    )
  })

  it('explains which enabled intervals are being skipped', async () => {
    write({
      intervals: [7, 24],
      playModes: ['ascending'],
      range: { low: 60, high: 72 },
    })
    const { user } = openMenu()
    await goTo(user, 'Intervals')

    expect(screen.getByText(/Double Octave cannot be played/)).toBeVisible()
  })
})

describe('play mode screen', () => {
  it('offers all five modes, named for screen readers', async () => {
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(5)
    expect(screen.getByRole('checkbox', { name: 'Ascending' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Harmonic' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Descending' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Ascending then harmonic' }),
    ).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'Descending then harmonic' }),
    ).toBeVisible()
  })

  it('keeps the stored order canonical however modes are toggled on', async () => {
    write({ playModes: ['harmonic'] })
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    await user.click(screen.getByRole('checkbox', { name: 'Ascending' }))
    await waitFor(() =>
      expect(intervalSettingsStore.read().playModes).toEqual([
        'ascending',
        'harmonic',
      ]),
    )
  })

  it('lets the last remaining mode go', async () => {
    write({ playModes: ['harmonic'] })
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    expect(screen.getByRole('checkbox', { name: 'Harmonic' })).toBeEnabled()
  })

  it('disables a mode that could not produce any enabled interval', async () => {
    write({ intervals: [13, 24], range: { low: 21, high: 108 } })
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    expect(screen.getByRole('checkbox', { name: 'Descending' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Ascending' })).toBeEnabled()
  })
})

describe('range screen', () => {
  it('shows a picker for each bound at the stored notes', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    const highest = screen.getByRole('group', { name: 'Highest note' })
    expect(
      within(lowest).getByRole('button', { pressed: true }),
    ).toHaveTextContent('C3')
    expect(
      within(highest).getByRole('button', { pressed: true }),
    ).toHaveTextContent('C5')
  })

  it('persists a new bound', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    await user.click(within(lowest).getByRole('button', { name: 'A2' }))

    await waitFor(() => expect(intervalSettingsStore.read().range.low).toBe(45))
  })

  it('cannot be inverted: each picker bounds the other', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    const highest = screen.getByRole('group', { name: 'Highest note' })

    // C5 is the current high, so the low picker stops there.
    expect(within(lowest).getByRole('button', { name: 'C6' })).toBeDisabled()
    expect(within(highest).getByRole('button', { name: 'C2' })).toBeDisabled()
  })

  it('restores the default range', async () => {
    write({ range: { low: 40, high: 90 } })
    const { user } = openMenu()
    await goTo(user, 'Range')

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() =>
      expect(intervalSettingsStore.read().range).toEqual({ low: 48, high: 72 }),
    )
  })

  it('explains itself and warns when the range is too narrow', async () => {
    write({
      intervals: [12],
      playModes: ['ascending'],
      range: { low: 60, high: 68 },
    })
    const { user } = openMenu()
    await goTo(user, 'Range')

    expect(
      screen.getByText(/Range determines the available pitches/),
    ).toBeVisible()
    expect(screen.getByText(/Octave needs 12/)).toBeVisible()
  })
})

describe('navigation', () => {
  it('goes three levels deep and back out again', async () => {
    const { user } = openMenu()
    await goTo(user, 'Intervals')
    expect(screen.getByRole('heading', { name: 'Intervals' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Customize' })).toBeVisible(),
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Menu' })).toBeVisible(),
    )
  })

  it('reflects a change made on a sub-screen back on Customize', async () => {
    const { user } = openMenu()
    await goTo(user, 'Intervals')
    await user.click(screen.getByRole('checkbox', { name: 'Minor 9th' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Intervals/ }),
      ).toHaveTextContent('13 selected'),
    )
  })
})
