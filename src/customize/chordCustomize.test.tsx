import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  DEFAULT_CHORD_SETTINGS,
  chordSettingsStore,
  type ChordSettings,
} from '../settings'
import { CHORDS } from '../theory'
import { ChordSettingsMenu } from './ChordSettingsMenu'

function openMenu(onResetScore = vi.fn()) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <ChordSettingsMenu
        store={chordSettingsStore}
        onResetScore={onResetScore}
      />
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

function write(overrides: Partial<ChordSettings>) {
  chordSettingsStore.write({ ...DEFAULT_CHORD_SETTINGS, ...overrides })
}

const WIDE = { low: 21, high: 108 }

beforeEach(() => {
  localStorage.clear()
  chordSettingsStore.reset()
})

describe('customize screen', () => {
  it('summarises each setting on its row', async () => {
    const { user } = openMenu()
    await goTo(user)

    expect(screen.getByRole('button', { name: /Chords/ })).toHaveTextContent(
      '8 selected',
    )
    expect(
      screen.getByRole('button', { name: /Inversions/ }),
    ).toHaveTextContent('1 selected')
    expect(screen.getByRole('button', { name: /Range/ })).toHaveTextContent(
      'C3–C5',
    )
    expect(screen.getByRole('button', { name: /Play Mode/ })).toHaveTextContent(
      '1 selected',
    )
  })

  it('warns when no question can be generated at all', async () => {
    write({ chords: ['major', 'minor'], inversions: [3], range: WIDE })
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

describe('chords screen', () => {
  it('lists every chord, grouped by category', async () => {
    const { user } = openMenu()
    await goTo(user, 'Chords')

    expect(screen.getAllByRole('checkbox')).toHaveLength(CHORDS.length)
    expect(screen.getByRole('heading', { name: 'Triads' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Thirteenths' })).toBeVisible()
  })

  it('checks the eight defaults and nothing else', async () => {
    const { user } = openMenu()
    await goTo(user, 'Chords')

    expect(screen.getByRole('checkbox', { name: 'Major Triad' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Half-diminished 7th' }),
    ).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sus2' })).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Dominant 13th' }),
    ).not.toBeChecked()
  })

  it('persists a toggle straight away', async () => {
    const { user } = openMenu()
    await goTo(user, 'Chords')

    await user.click(screen.getByRole('checkbox', { name: 'Sus2' }))
    await waitFor(() =>
      expect(chordSettingsStore.read().chords).toContain('sus2'),
    )
  })

  it('keeps the stored order canonical however chords are toggled on', async () => {
    write({ chords: ['minor-7th'], range: WIDE })
    const { user } = openMenu()
    await goTo(user, 'Chords')

    await user.click(screen.getByRole('checkbox', { name: 'Major Triad' }))
    await waitFor(() =>
      // Major Triad comes first in the chord table, so it sorts ahead.
      expect(chordSettingsStore.read().chords).toEqual(['major', 'minor-7th']),
    )
  })

  it('disables chords too wide for the range', async () => {
    write({ chords: ['major'], inversions: [0], range: { low: 60, high: 72 } })
    const { user } = openMenu()
    await goTo(user, 'Chords')

    expect(
      screen.getByRole('checkbox', { name: 'Dominant 13th' }),
    ).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Minor Triad' })).toBeEnabled()
  })

  it('disables triads when only 3rd inversion is enabled', async () => {
    write({ chords: ['dominant-7th'], inversions: [3], range: WIDE })
    const { user } = openMenu()
    await goTo(user, 'Chords')

    expect(screen.getByRole('checkbox', { name: 'Major Triad' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Major 7th' })).toBeEnabled()
  })

  it('pins the last remaining chord', async () => {
    write({ chords: ['major'], range: WIDE })
    const { user } = openMenu()
    await goTo(user, 'Chords')

    expect(screen.getByRole('checkbox', { name: 'Major Triad' })).toBeDisabled()
  })

  it('still allows switching off a chord that has become unplayable', async () => {
    write({
      chords: ['major', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 72 },
    })
    const { user } = openMenu()
    await goTo(user, 'Chords')

    const thirteenth = screen.getByRole('checkbox', { name: 'Dominant 13th' })
    expect(thirteenth).toBeEnabled()
    await user.click(thirteenth)
    await waitFor(() =>
      expect(chordSettingsStore.read().chords).not.toContain('dominant-13th'),
    )
  })

  it('explains which enabled chords are being skipped', async () => {
    write({
      chords: ['major', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 72 },
    })
    const { user } = openMenu()
    await goTo(user, 'Chords')

    expect(screen.getByText(/Dominant 13th cannot be played/)).toBeVisible()
  })
})

describe('inversions screen', () => {
  it('offers all four inversions', async () => {
    const { user } = openMenu()
    await goTo(user, 'Inversions')

    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(
      screen.getByRole('checkbox', { name: 'Root position' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: '3rd inversion' }),
    ).not.toBeChecked()
  })

  it('explains the four-voice requirement even when nothing is wrong', async () => {
    const { user } = openMenu()
    await goTo(user, 'Inversions')

    expect(screen.getByText(/four or more voices/)).toBeVisible()
  })

  it('disables 3rd inversion when only triads are enabled', async () => {
    write({ chords: ['major', 'minor'], range: WIDE })
    const { user } = openMenu()
    await goTo(user, 'Inversions')

    expect(
      screen.getByRole('checkbox', { name: '3rd inversion' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: '2nd inversion' }),
    ).toBeEnabled()
  })

  it('enables 3rd inversion once a four-voice chord is selected', async () => {
    write({ chords: ['dominant-7th'], range: WIDE })
    const { user } = openMenu()
    await goTo(user, 'Inversions')

    expect(
      screen.getByRole('checkbox', { name: '3rd inversion' }),
    ).toBeEnabled()
  })

  it('pins the last remaining inversion', async () => {
    const { user } = openMenu()
    await goTo(user, 'Inversions')

    expect(
      screen.getByRole('checkbox', { name: 'Root position' }),
    ).toBeDisabled()
  })

  it('keeps the stored order canonical', async () => {
    write({ chords: ['dominant-7th'], inversions: [2], range: WIDE })
    const { user } = openMenu()
    await goTo(user, 'Inversions')

    await user.click(screen.getByRole('checkbox', { name: 'Root position' }))
    await waitFor(() =>
      expect(chordSettingsStore.read().inversions).toEqual([0, 2]),
    )
  })
})

describe('play mode screen', () => {
  it('offers block and arpeggiated', async () => {
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    expect(screen.getByRole('checkbox', { name: 'Block' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Arpeggiated' }),
    ).not.toBeChecked()
  })

  it('pins the last remaining mode', async () => {
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    expect(screen.getByRole('checkbox', { name: 'Block' })).toBeDisabled()
  })

  it('persists a toggle', async () => {
    const { user } = openMenu()
    await goTo(user, 'Play Mode')

    await user.click(screen.getByRole('checkbox', { name: 'Arpeggiated' }))
    await waitFor(() =>
      expect(chordSettingsStore.read().playModes).toEqual([
        'block',
        'arpeggiated',
      ]),
    )
  })
})

describe('range screen', () => {
  it('shows a picker for each bound at the stored notes', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    expect(
      within(lowest).getByRole('button', { pressed: true }),
    ).toHaveTextContent('C3')
  })

  it('uses chord wording, not interval wording', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    expect(screen.getByText(/all notes of the chord/)).toBeVisible()
  })

  it('persists a new bound', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    await user.click(within(lowest).getByRole('button', { name: 'A2' }))

    await waitFor(() => expect(chordSettingsStore.read().range.low).toBe(45))
  })

  it('cannot be inverted: each picker bounds the other', async () => {
    const { user } = openMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    expect(within(lowest).getByRole('button', { name: 'C6' })).toBeDisabled()
  })

  it('warns when the range is too narrow for an enabled chord', async () => {
    write({
      chords: ['major', 'dominant-13th'],
      inversions: [0],
      range: { low: 60, high: 68 },
    })
    const { user } = openMenu()
    await goTo(user, 'Range')

    expect(screen.getByText(/Dominant 13th needs 21/)).toBeVisible()
  })
})

describe('navigation', () => {
  it('goes two levels deep and back out again', async () => {
    const { user } = openMenu()
    await goTo(user, 'Chords')
    expect(screen.getByRole('heading', { name: 'Chords' })).toBeVisible()

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
    await goTo(user, 'Chords')
    await user.click(screen.getByRole('checkbox', { name: 'Sus2' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Chords/ })).toHaveTextContent(
        '9 selected',
      ),
    )
  })
})

describe('focusing on weak spots', () => {
  it('is on by default, since a user who never finds it is better served by it', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(
      screen.getByRole('checkbox', { name: /Focus on weak spots/ }),
    ).toBeChecked()
  })

  it('can be switched off', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))
    await user.click(
      screen.getByRole('checkbox', { name: /Focus on weak spots/ }),
    )

    await waitFor(() => expect(chordSettingsStore.read().adaptive).toBe(false))
  })

  it('says it never changes the selection, which is the promise it has to keep', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.getByText(/never turns a chord on or off/i)).toBeVisible()
  })
})
