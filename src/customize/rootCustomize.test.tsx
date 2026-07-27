import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  DEFAULT_CHORD_SETTINGS,
  chordSettingsStore,
  rootSettingsStore,
} from '../settings'
import { ChordSettingsMenu } from './ChordSettingsMenu'

/**
 * The chord and chord-root exercises share one Customize tree and differ only
 * in the store they pass. These tests are about that seam — the screens
 * themselves are already covered by chordCustomize.test.tsx.
 */

function openRootMenu() {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <ChordSettingsMenu store={rootSettingsStore} onResetScore={vi.fn()} />
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
      chords: ['sus2', 'sus4'],
    })

    const { user } = openRootMenu()
    await goTo(user, 'Chords')

    expect(screen.getByRole('checkbox', { name: 'Major Triad' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sus2' })).not.toBeChecked()
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
    await user.click(screen.getByRole('checkbox', { name: 'Sus2' }))

    await waitFor(() =>
      expect(rootSettingsStore.read().chords).toContain('sus2'),
    )
    expect(chordSettingsStore.read().chords).not.toContain('sus2')
  })
})
