import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import {
  DEFAULT_PROGRESSION_SETTINGS,
  progressionSettingsStore,
  type ProgressionSettings,
} from '../settings'
import { ProgressionSettingsMenu } from './ProgressionSettingsMenu'

function openMenu(onResetScore = vi.fn()) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={vi.fn()} title="Menu">
      <ProgressionSettingsMenu onResetScore={onResetScore} />
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

function settingsWith(
  overrides: Partial<ProgressionSettings> = {},
): ProgressionSettings {
  return { ...DEFAULT_PROGRESSION_SETTINGS, ...overrides }
}

/** The checkbox row whose label starts with this text. */
function row(text: string) {
  const found = screen
    .getAllByRole('checkbox')
    .find((element) => element.textContent?.startsWith(text))
  if (!found) throw new Error(`no row starting with ${text}`)
  return found
}

beforeEach(() => {
  localStorage.clear()
  progressionSettingsStore.reset()
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

    // Read off each row rather than by value: Chords and Inversions both
    // happen to say "3 selected" by default, and a bare text query cannot
    // tell which of them it found.
    const summary = (label: string) =>
      screen.getByRole('button', { name: new RegExp(`^${label}`) }).textContent

    expect(summary('Chords')).toContain('3 selected')
    expect(summary('Cadences')).toContain('Authentic')
    expect(summary('Length')).toContain('3 chords')
    expect(summary('Inversions')).toContain('3 selected')
    expect(summary('Range')).toContain('C3–C5')
  })
})

describe('choosing chords', () => {
  it('lists the ladder easiest first, not alphabetically', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    const labels = screen
      .getAllByRole('checkbox')
      .map((element) => element.textContent?.trim())

    expect(labels.slice(0, 3)).toEqual(['I', 'IV', 'V'])
    expect(labels.at(-1)).toBe('♭II')
  })

  it('groups the chords by where they come from', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    const headings = screen
      .getAllByRole('heading')
      .map((element) => element.textContent)

    // The modal's own title heads the list. Asserted rather than sliced past
    // silently, so a change to the modal chrome fails here instead of quietly
    // shifting which headings are being checked.
    expect(headings[0]).toBe('Chords')
    expect(headings.slice(1)).toEqual([
      'Diatonic',
      'Secondary dominants',
      'Borrowed from the parallel minor',
      'Chromatic',
    ])
  })

  it('offers III before any borrowed chord, though it is harder', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    // The reason the sections are not in ladder order. Read off the rendered
    // order rather than the table, since it is the screen that has to get
    // this right.
    const labels = screen
      .getAllByRole('checkbox')
      .map((element) => element.textContent?.trim())

    for (const borrowed of ['iv', '♭III', '♭VI', '♭VII']) {
      expect(labels.indexOf('III'), borrowed).toBeLessThan(
        labels.indexOf(borrowed),
      )
    }
    // And it leads its own section rather than trailing II.
    expect(labels.indexOf('III')).toBeLessThan(labels.indexOf('II'))
  })

  it('still shows every chord exactly once across the sections', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    const labels = screen
      .getAllByRole('checkbox')
      .map((element) => element.textContent?.trim())

    expect(labels).toHaveLength(15)
    expect(new Set(labels).size).toBe(15)
  })

  it('takes more chords', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')
    await user.click(row('vi'))

    await waitFor(() =>
      expect(progressionSettingsStore.read().numerals).toEqual([
        'I',
        'IV',
        'V',
        'vi',
      ]),
    )
  })

  it('keeps them in ladder order however they were picked', async () => {
    progressionSettingsStore.write(settingsWith({ numerals: ['V', 'I'] }))
    const { user } = openMenu()
    await openScreen(user, 'Chords')
    await user.click(row('IV'))

    await waitFor(() =>
      expect(progressionSettingsStore.read().numerals).toEqual([
        'I',
        'IV',
        'V',
      ]),
    )
  })

  it('lets a chord no cadence needs be switched off', async () => {
    progressionSettingsStore.write(
      settingsWith({ numerals: ['I', 'IV', 'V', 'vi'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    // Only the authentic cadence is on, so it needs V and I — vi is free.
    await user.click(row('vi'))
    await waitFor(() =>
      expect(progressionSettingsStore.read().numerals).not.toContain('vi'),
    )
  })
})

describe('chords a cadence depends on', () => {
  it('locks the chords the last remaining cadence needs', async () => {
    // An authentic cadence is V then I. Switching either off would leave a
    // progression with no way to end, so neither can go.
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    expect(row('V')).toBeDisabled()
    expect(row('I')).toBeDisabled()
  })

  it('says which chord is locked and why', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    expect(screen.getByText(/last chord holding the authentic/i)).toBeVisible()
  })

  it('locks III and vi when the secondary cadence is the only one left', async () => {
    // The rule is general rather than written per cadence, so a new cadence
    // has to pick it up without anything being taught about it.
    progressionSettingsStore.write(
      settingsWith({
        numerals: ['I', 'IV', 'V', 'vi', 'III'],
        cadences: ['secondary'],
      }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    expect(row('III')).toBeDisabled()
    expect(row('vi')).toBeDisabled()
    // Nothing else is holding it up, so the diatonic chords are free.
    expect(row('V')).toBeEnabled()
    expect(screen.getByText(/last chord holding the secondary/i)).toBeVisible()
  })

  it('frees a chord once another cadence can carry the progression', async () => {
    // With a plagal cadence available too, IV and I can end a progression, so
    // V stops being load-bearing.
    progressionSettingsStore.write(
      settingsWith({ cadences: ['authentic', 'plagal'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    expect(row('V')).toBeEnabled()
    // I is in both cadences, so it is still the last thing holding them up.
    expect(row('I')).toBeDisabled()
  })

  it('never lets the chords be emptied', async () => {
    progressionSettingsStore.write(
      settingsWith({ numerals: ['I', 'V'], cadences: ['authentic'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    for (const label of ['I', 'V']) {
      expect(row(label)).toBeDisabled()
    }
  })
})

describe('choosing cadences', () => {
  it('offers all five, described by what they sound like', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(screen.getByText(/The ordinary way home/)).toBeVisible()
    expect(screen.getByText(/amen/)).toBeVisible()
    expect(screen.getByText(/Asks a question/)).toBeVisible()
    expect(screen.getByText(/gives vi instead/)).toBeVisible()
    expect(screen.getByText(/relative minor/)).toBeVisible()
  })

  it('names both chords the secondary cadence needs', async () => {
    // The only cadence needing two chords that are both off by default, and
    // so the only one whose warning has to read as a list.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Secondary')).toBeDisabled()
    expect(
      screen.getByText(/Needs III and vi, which are switched off/),
    ).toBeVisible()
  })

  it('becomes available once III and vi are enabled', async () => {
    progressionSettingsStore.write(
      settingsWith({ numerals: ['I', 'IV', 'V', 'vi', 'III'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Secondary')).toBeEnabled()
    await user.click(row('Secondary'))

    await waitFor(() =>
      expect(progressionSettingsStore.read().cadences).toContain('secondary'),
    )
  })

  it('takes more than one, so the ending stays unpredictable', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Cadences')
    await user.click(row('Plagal'))

    await waitFor(() =>
      expect(progressionSettingsStore.read().cadences).toEqual([
        'authentic',
        'plagal',
      ]),
    )
  })

  it('will not let the last usable one go', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Authentic')).toBeDisabled()
  })

  it('disables a cadence whose chords are switched off', async () => {
    // Deceptive is V then vi, and vi is not enabled by default.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Deceptive')).toBeDisabled()
  })

  it('names the chords an unavailable cadence needs', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(screen.getByText(/Needs vi, which is switched off/)).toBeVisible()
  })

  it('becomes available once its chords are enabled', async () => {
    progressionSettingsStore.write(
      settingsWith({ numerals: ['I', 'IV', 'V', 'vi'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Deceptive')).toBeEnabled()
    await user.click(row('Deceptive'))

    await waitFor(() =>
      expect(progressionSettingsStore.read().cadences).toContain('deceptive'),
    )
  })

  it('shows a cadence as off while its chords are missing', async () => {
    // Selected but unreachable is not the same as selected, and showing it
    // ticked would claim progressions can end that way when they cannot.
    progressionSettingsStore.write(
      settingsWith({ numerals: ['I', 'IV', 'V'], cadences: ['authentic'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Deceptive')).toHaveAttribute('aria-checked', 'false')
  })
})

describe('length', () => {
  it('offers two chords through eight', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Length')

    const labels = screen
      .getAllByRole('radio')
      .map((element) => element.textContent?.trim())
    expect(labels).toEqual([
      '2 chords',
      '3 chords',
      '4 chords',
      '5 chords',
      '6 chords',
      '7 chords',
      '8 chords',
    ])
  })

  it('persists the choice', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Length')
    await user.click(screen.getByRole('radio', { name: '6 chords' }))

    await waitFor(() => expect(progressionSettingsStore.read().length).toBe(6))
  })
})

describe('inversions', () => {
  it('starts with all three, since they cost no difficulty', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Inversions')

    for (const element of screen.getAllByRole('checkbox')) {
      expect(element).toHaveAttribute('aria-checked', 'true')
    }
  })

  it('can be narrowed to root position', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Inversions')

    await user.click(row('1st inversion'))
    await user.click(row('2nd inversion'))

    await waitFor(() =>
      expect(progressionSettingsStore.read().inversions).toEqual([0]),
    )
  })

  it('will not let the last one go', async () => {
    progressionSettingsStore.write(settingsWith({ inversions: [0] }))
    const { user } = openMenu()
    await openScreen(user, 'Inversions')

    expect(row('Root position')).toBeDisabled()
  })
})

describe('warnings', () => {
  it('flags an impossible range in the modal, naming the shortfall', async () => {
    progressionSettingsStore.write(
      settingsWith({ range: { low: 60, high: 67 } }),
    )
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.getByText(/only 7 semitones wide/)).toBeVisible()
    expect(screen.getByText(/Widen it by 5 more/)).toBeVisible()
  })

  it('says nothing when the settings are fine', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customize Exercise/ }))

    expect(screen.queryByText(/semitones wide/)).toBeNull()
    expect(screen.queryByText(/No cadence/)).toBeNull()
  })
})
