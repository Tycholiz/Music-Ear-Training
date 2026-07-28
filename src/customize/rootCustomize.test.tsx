import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  DEFAULT_CHORD_SETTINGS,
  DEFAULT_ROOT_SETTINGS,
  chordSettingsStore,
  rootInputModeStore,
  rootSettingsStore,
} from '../settings'
import { CHORDS, UNAMBIGUOUS_ROOT_CHORDS } from '../theory'
import { ChordSettingsMenu } from './ChordSettingsMenu'
import { InputModeRow } from './InputModeScreen'

/**
 * The chord and chord-root exercises share one Customize tree and differ only
 * in the store they pass. These tests are about that seam — the screens
 * themselves are already covered by chordCustomize.test.tsx.
 */

function openRootMenu() {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <ChordSettingsMenu
        store={rootSettingsStore}
        onResetScore={vi.fn()}
        availableChords={UNAMBIGUOUS_ROOT_CHORDS}
        extraRows={<InputModeRow />}
      />
    </ModalSheet>,
  )
  return { user }
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

beforeEach(() => {
  localStorage.clear()
  rootSettingsStore.reset()
  chordSettingsStore.reset()
  rootInputModeStore.reset()
})

describe('the root exercise gets the same four settings', () => {
  it('offers chords, inversions, range and play mode', async () => {
    const { user } = openRootMenu()
    await goTo(user)

    expect(screen.getByRole('button', { name: /Chords/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Inversions/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Range/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Play Mode/ })).toBeVisible()
  })

  it('applies the same validation', async () => {
    rootSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major', 'minor'],
      inversions: [3],
      range: { low: 21, high: 108 },
    })
    const { user } = openRootMenu()
    await goTo(user)

    expect(screen.getByText(/Nothing can be played/)).toBeVisible()
  })
})

describe('independence from the chord exercise', () => {
  it('writes changes to its own store', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Inversions')

    await user.click(screen.getByRole('checkbox', { name: '1st inversion' }))

    await waitFor(() =>
      expect(rootSettingsStore.read().inversions).toEqual([0, 1]),
    )
    // The point of two stores: identifying a root over inverted voicings is
    // worth practising long before identifying their quality is.
    expect(chordSettingsStore.read().inversions).toEqual([0])
  })

  it('does not see changes made to the chord exercise', async () => {
    chordSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major-9th'],
    })

    const { user } = openRootMenu()
    await goTo(user, 'Chords')

    expect(screen.getByRole('checkbox', { name: 'Major Triad' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Major 9th' }),
    ).not.toBeChecked()
  })

  it('keeps its range separate', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Range')

    const lowest = screen.getByRole('group', { name: 'Lowest note' })
    await user.click(within(lowest).getByRole('button', { name: 'A2' }))

    await waitFor(() => expect(rootSettingsStore.read().range.low).toBe(45))
    expect(chordSettingsStore.read().range.low).toBe(48)
  })

  it('persists independently across a remount', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Chords')
    await user.click(screen.getByRole('checkbox', { name: 'Major 9th' }))

    await waitFor(() =>
      expect(rootSettingsStore.read().chords).toContain('major-9th'),
    )
    expect(chordSettingsStore.read().chords).not.toContain('major-9th')
  })
})

describe('chords with no identifiable root are not offered', () => {
  it('leaves them out of the list entirely', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Chords')

    // G C D is a Gsus4 and equally a Csus2 — there is no right answer.
    expect(screen.queryByRole('checkbox', { name: 'Sus2' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Sus4' })).toBeNull()
    expect(
      screen.queryByRole('checkbox', { name: 'Diminished 7th' }),
    ).toBeNull()
    expect(
      screen.queryByRole('checkbox', { name: 'Augmented Triad' }),
    ).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Minor 7th' })).toBeNull()
  })

  it('still offers the ones that do have an answer', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Chords')

    expect(screen.getByRole('checkbox', { name: 'Major Triad' })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Dominant 7th' })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Major 7th' })).toBeVisible()
  })

  it('offers exactly the unambiguous chords, and no more', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Chords')

    expect(screen.getAllByRole('checkbox')).toHaveLength(
      UNAMBIGUOUS_ROOT_CHORDS.length,
    )
  })

  it('hides a category left empty by the filter', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Chords')

    // Both sixth chords are ambiguous, so the heading would sit over nothing.
    expect(screen.queryByRole('heading', { name: 'Sixths' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Triads' })).toBeVisible()
  })

  it('the chord exercise still offers all of them', async () => {
    const user = userEvent.setup()
    render(
      <ModalSheet open onClose={vi.fn()} title="Menu">
        <ChordSettingsMenu store={chordSettingsStore} onResetScore={vi.fn()} />
      </ModalSheet>,
    )
    await goTo(user, 'Chords')

    // Ambiguity of root is irrelevant when the question is which chord it is.
    expect(screen.getByRole('checkbox', { name: 'Sus2' })).toBeVisible()
    expect(screen.getAllByRole('checkbox')).toHaveLength(CHORDS.length)
  })
})

describe('the store refuses an ambiguous chord', () => {
  it('strips one written straight into storage', () => {
    localStorage.setItem(
      'met.settings.chordRoot',
      JSON.stringify({
        version: 1,
        value: {
          ...DEFAULT_CHORD_SETTINGS,
          chords: ['major', 'sus2', 'diminished-7th', 'minor-7th'],
        },
      }),
    )

    expect(rootSettingsStore.read().chords).toEqual(['major'])
  })

  it('falls back to the defaults when nothing survives', () => {
    localStorage.setItem(
      'met.settings.chordRoot',
      JSON.stringify({
        version: 1,
        value: { ...DEFAULT_CHORD_SETTINGS, chords: ['sus2', 'sus4'] },
      }),
    )

    expect(rootSettingsStore.read().chords).toEqual(
      DEFAULT_ROOT_SETTINGS.chords,
    )
  })

  it('strips one written through the typed API too', () => {
    // The store keeps its own invariant rather than trusting whichever screen
    // called it.
    rootSettingsStore.write({
      ...DEFAULT_ROOT_SETTINGS,
      chords: ['major', 'sus2'],
    })

    expect(rootSettingsStore.read().chords).toEqual(['major'])
  })
})

describe('input mode', () => {
  it('defaults to Reveal, which works without permission', async () => {
    const { user } = openRootMenu()
    await goTo(user)

    expect(
      screen.getByRole('button', { name: /Input Mode/ }),
    ).toHaveTextContent('Reveal')
  })

  it('switches to Microphone and remembers it', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Input Mode')

    await user.click(screen.getByRole('checkbox', { name: /Microphone/ }))
    await waitFor(() => expect(rootInputModeStore.read()).toBe('microphone'))
  })

  it('pins the active mode, since exactly one has to be on', async () => {
    const { user } = openRootMenu()
    await goTo(user, 'Input Mode')

    expect(screen.getByRole('checkbox', { name: /Reveal/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Microphone/ })).toBeEnabled()
  })

  it('is offered to the root exercise only', async () => {
    const user = userEvent.setup()
    render(
      <ModalSheet open onClose={vi.fn()} title="Menu">
        <ChordSettingsMenu store={chordSettingsStore} onResetScore={vi.fn()} />
      </ModalSheet>,
    )
    await goTo(user)

    // The chord exercise has no microphone mode to select.
    expect(screen.queryByRole('button', { name: /Input Mode/ })).toBeNull()
  })
})
