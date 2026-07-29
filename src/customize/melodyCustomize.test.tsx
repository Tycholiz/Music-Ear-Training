import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  DEFAULT_MELODY_SETTINGS,
  melodySettingsStore,
  type MelodySettings,
} from '../settings'
import { MelodySettingsMenu } from './MelodySettingsMenu'

function openMenu(onResetScore = vi.fn()) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <MelodySettingsMenu onResetScore={onResetScore} />
    </ModalSheet>,
  )
  return { user, onResetScore }
}

/** Menu → Customize → the named screen. */
async function openScreen(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))
  await user.click(screen.getByRole('button', { name: new RegExp(name) }))
}

function settingsWith(overrides: Partial<MelodySettings> = {}): MelodySettings {
  return { ...DEFAULT_MELODY_SETTINGS, ...overrides }
}

beforeEach(() => {
  localStorage.clear()
  melodySettingsStore.reset()
})

describe('the menu', () => {
  it('resets the score', async () => {
    const { user, onResetScore } = openMenu()
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))
    expect(onResetScore).toHaveBeenCalledOnce()
  })

  it('summarises each setting without opening it', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.getByText('Major Pentatonic')).toBeVisible()
    expect(screen.getByText('None')).toBeVisible()
    expect(screen.getByText('5 notes')).toBeVisible()
    expect(screen.getByText('C3–C5')).toBeVisible()
  })
})

describe('choosing scales', () => {
  it('lists the ladder easiest first, not alphabetically', async () => {
    // The order is the guidance: a user working down the list is following a
    // sensible progression without being told one.
    const { user } = openMenu()
    await openScreen(user, 'Scales')

    const names = screen
      .getAllByRole('checkbox')
      .map((row) => row.textContent ?? '')
    expect(names[0]).toContain('Major Pentatonic')
    expect(names[1]).toContain('Minor Pentatonic')
    expect(names.at(-1)).toContain('Chromatic')
  })

  it('shows the degrees of each scale', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Scales')

    const major = screen
      .getAllByRole('checkbox')
      .find(
        (row) =>
          row.textContent?.startsWith('Major') &&
          !row.textContent.includes('Pentatonic'),
      )
    expect(major?.textContent).toContain('1 2 3 4 5 6 7')
  })

  it('takes more than one at a time', async () => {
    // Practising major against natural minor is a different and harder
    // exercise than practising either alone.
    const { user } = openMenu()
    await openScreen(user, 'Scales')
    await user.click(
      screen.getByRole('checkbox', { name: /^Major1 2 3 4 5 6 7$/ }),
    )

    await waitFor(() =>
      expect(melodySettingsStore.read().scaleIds).toEqual([
        'major-pentatonic',
        'major',
      ]),
    )
  })

  it('keeps them in ladder order however they were picked', async () => {
    melodySettingsStore.write(settingsWith({ scaleIds: ['chromatic'] }))
    const { user } = openMenu()
    await openScreen(user, 'Scales')
    await user.click(screen.getByRole('checkbox', { name: /Major Pentatonic/ }))

    await waitFor(() =>
      expect(melodySettingsStore.read().scaleIds).toEqual([
        'major-pentatonic',
        'chromatic',
      ]),
    )
  })

  it('lets one be taken away again', async () => {
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['major-pentatonic', 'blues'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Scales')
    await user.click(screen.getByRole('checkbox', { name: /Blues/ }))

    await waitFor(() =>
      expect(melodySettingsStore.read().scaleIds).toEqual(['major-pentatonic']),
    )
  })

  it('will not let the last one go', async () => {
    // Nothing selected can generate nothing; stopping it here means the
    // exercise never has to explain it.
    const { user } = openMenu()
    await openScreen(user, 'Scales')

    expect(
      screen.getByRole('checkbox', { name: /Major Pentatonic/ }),
    ).toBeDisabled()
  })

  it('summarises a single scale by name and several by count', async () => {
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['major', 'blues', 'dorian'] }),
    )
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.getByText('3 selected')).toBeVisible()
  })
})

describe('featured degrees', () => {
  it('offers only the degrees the chosen scale has', async () => {
    // Major pentatonic has no 4 and no 7, so they cannot be featured at all —
    // an illegal combination is unreachable rather than merely warned about.
    const { user } = openMenu()
    await openScreen(user, 'Featured Degrees')

    const labels = screen
      .getAllByRole('checkbox')
      .map((row) => row.textContent?.trim())
    expect(labels).toEqual(['1', '2', '3', '5', '6'])
  })

  it('follows the scale when it changes', async () => {
    melodySettingsStore.write(settingsWith({ scaleIds: ['major'] }))
    const { user } = openMenu()
    await openScreen(user, 'Featured Degrees')

    const labels = screen
      .getAllByRole('checkbox')
      .map((row) => row.textContent?.trim())
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('offers only what every selected scale agrees on', async () => {
    // Major and blues share 1, 4 and 5 and nothing else. A degree only one of
    // them has could not be guaranteed to appear.
    melodySettingsStore.write(settingsWith({ scaleIds: ['major', 'blues'] }))
    const { user } = openMenu()
    await openScreen(user, 'Featured Degrees')

    const labels = screen
      .getAllByRole('checkbox')
      .map((row) => row.textContent?.trim())
    expect(labels).toEqual(['1', '4', '5'])
  })

  it('records what was featured', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Featured Degrees')
    await user.click(screen.getByRole('checkbox', { name: '6' }))

    await waitFor(() =>
      expect(melodySettingsStore.read().featured).toEqual([9]),
    )
  })

  it('warns when more degrees are featured than the melody has notes', async () => {
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['major'], featured: [0, 2, 4, 5], length: 3 }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Featured Degrees')

    expect(screen.getByText(/cannot all appear/i)).toBeVisible()
  })
})

describe('reconciling a scale change', () => {
  it('drops a featured degree the new selection cannot promise', async () => {
    // b7 is in Mixolydian and not in Major. Once both are selected a question
    // could pick the one without it, so it stops being guaranteed.
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['mixolydian'], featured: [10] }),
    )

    const { user } = openMenu()
    await openScreen(user, 'Scales')
    await user.click(
      screen.getByRole('checkbox', { name: /^Major1 2 3 4 5 6 7$/ }),
    )

    await waitFor(() => {
      const settings = melodySettingsStore.read()
      expect(settings.scaleIds).toEqual(['major', 'mixolydian'])
      expect(settings.featured).toEqual([])
    })
  })

  it('keeps a featured degree both scales still have', async () => {
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['mixolydian'], featured: [5, 10] }),
    )

    const { user } = openMenu()
    await openScreen(user, 'Scales')
    await user.click(
      screen.getByRole('checkbox', { name: /^Major1 2 3 4 5 6 7$/ }),
    )

    // The 4 is in both; only the b7 goes.
    await waitFor(() =>
      expect(melodySettingsStore.read().featured).toEqual([5]),
    )
  })

  it('keeps everything when the selection only narrows to a superset', async () => {
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['major', 'mixolydian'], featured: [5] }),
    )

    const { user } = openMenu()
    await openScreen(user, 'Scales')
    await user.click(
      screen.getByRole('checkbox', { name: /^Mixolydian1 2 3 4 5 6 b7$/ }),
    )

    await waitFor(() => {
      const settings = melodySettingsStore.read()
      expect(settings.scaleIds).toEqual(['major'])
      expect(settings.featured).toEqual([5])
    })
  })
})

describe('length', () => {
  it('offers three notes through eight', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Length')

    const labels = screen
      .getAllByRole('radio')
      .map((row) => row.textContent?.trim())
    expect(labels).toEqual([
      '3 notes',
      '4 notes',
      '5 notes',
      '6 notes',
      '7 notes',
      '8 notes',
    ])
  })

  it('persists the choice', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Length')
    await user.click(screen.getByRole('radio', { name: '8 notes' }))

    await waitFor(() => expect(melodySettingsStore.read().length).toBe(8))
  })
})

describe('backing', () => {
  it('can be turned down to a drone or off entirely', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Backing')

    await user.click(screen.getByRole('radio', { name: /Tonic drone/ }))
    await waitFor(() =>
      expect(melodySettingsStore.read().backing).toBe('drone'),
    )

    await user.click(screen.getByRole('radio', { name: /^None/ }))
    await waitFor(() => expect(melodySettingsStore.read().backing).toBe('none'))
  })

  it('says what each one costs the listener', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Backing')

    expect(
      screen.getByText(/has to be remembered rather than heard/i),
    ).toBeVisible()
  })
})

describe('warnings', () => {
  it('flags an impossible range in the modal, not only on the exercise', async () => {
    melodySettingsStore.write(settingsWith({ range: { low: 60, high: 64 } }))
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.getByText(/A melody spans an octave/i)).toBeVisible()
  })

  it('flags too many featured degrees in the modal', async () => {
    melodySettingsStore.write(
      settingsWith({ scaleIds: ['major'], featured: [0, 2, 4, 5], length: 3 }),
    )
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.getByText(/cannot all appear/i)).toBeVisible()
  })

  it('says nothing when the settings are fine', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.queryByText(/cannot all appear/i)).toBeNull()
    expect(screen.queryByText(/A melody spans an octave/i)).toBeNull()
  })
})
