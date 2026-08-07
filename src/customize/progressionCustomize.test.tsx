import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  await user.click(screen.getByRole('button', { name: /Customization/ }))
  await user.click(screen.getByRole('button', { name: new RegExp(name) }))
}

function settingsWith(
  overrides: Partial<ProgressionSettings> = {},
): ProgressionSettings {
  return { ...DEFAULT_PROGRESSION_SETTINGS, ...overrides }
}

/** The checkbox row whose label starts with this text. */
/** The `<section>` a ListCard renders, found by its title. */
function sectionOf(title: string) {
  const found = screen.getByText(title).closest('section')
  if (!found) throw new Error(`no section titled ${title}`)
  return found as HTMLElement
}

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

/**
 * The numeral rows, without the "All …" rows standing for whole groups.
 *
 * Those are checkboxes too, so counting every checkbox counts the groups as
 * chords.
 */
function numeralLabels(): string[] {
  return screen
    .getAllByRole('checkbox')
    .map((element) => element.textContent?.trim() ?? '')
    .filter((text) => !/^All /.test(text))
}

describe('the menu', () => {
  it('resets the score', async () => {
    const { user, onResetScore } = openMenu()
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))
    expect(onResetScore).toHaveBeenCalledOnce()
  })

  it('summarises each setting without opening it', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customization/ }))

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

    // A locked row's textContent carries its red explanation too (I and V
    // are locked by default), so this checks the leading label rather than
    // an exact match.
    const labels = numeralLabels()

    expect(labels.slice(0, 3).map((text) => text?.split('Locked:')[0])).toEqual(
      ['I', 'IV', 'V'],
    )
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

    const labels = numeralLabels()

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

  it('does nothing when a locked chord is pressed', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    await user.click(row('V'))
    expect(progressionSettingsStore.read().numerals).toContain('V')
  })

  it('shows the reason as red text on the locked row itself', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    // On the row, not off in a note elsewhere on the screen.
    expect(
      within(row('V')).getByText(
        /^Locked: V is the last chord holding the authentic/i,
      ),
    ).toHaveClass('text-incorrect')
  })

  it('gives each locked row its own explanation, not one shared line', async () => {
    // The rule is general rather than written per cadence, so a new cadence
    // has to pick it up without anything being taught about it, and each of
    // two simultaneously-locked chords gets its own line rather than the
    // screen showing whichever one happened to be checked first.
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

    expect(
      within(row('III')).getByText(
        /^Locked: III is the last chord holding the secondary/i,
      ),
    ).toBeVisible()
    expect(
      within(row('vi')).getByText(
        /^Locked: vi is the last chord holding the secondary/i,
      ),
    ).toBeVisible()
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
    expect(within(row('V')).queryByText(/^Locked:/)).toBeNull()
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

  it('says the chord is the only one left when nothing else is to blame', async () => {
    // Both cadences the chord could hold are already unusable for other
    // reasons, so `numeralLockWarning` cannot name one — the case that used
    // to fall through to no explanation at all.
    progressionSettingsStore.write(
      settingsWith({ numerals: ['I'], cadences: ['authentic'] }),
    )
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    expect(row('I')).toBeDisabled()
    expect(
      within(row('I')).getByText(/^Locked: I is the only chord left/),
    ).toBeVisible()
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

  it('names both chords the secondary cadence will switch on', async () => {
    // The only cadence needing two chords that are both off by default, and
    // so the only one whose note has to read as a list.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(
      within(row('Secondary')).getByText(
        /Choosing this will also switch on III and vi/,
      ),
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

  it('lets the last usable cadence go', async () => {
    // The exercise then says it cannot build a progression, which it already
    // says for a range too narrow to voice one in.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Authentic')).toBeEnabled()
  })

  it('offers a cadence whose chords are switched off, rather than refusing it', async () => {
    // Deceptive is V then vi, and vi is not enabled by default. It used to be
    // disabled, which left the user to work out which chords were missing and
    // go and switch them on themselves.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(row('Deceptive')).toBeEnabled()
    expect(row('Deceptive')).toHaveAttribute('aria-checked', 'false')
  })

  it('says on the row what choosing it will switch on', async () => {
    // The text was already on the screen before — as a paragraph under the
    // card — so asserting it exists somewhere passed either way. What was
    // wrong was where, and what it said: a refusal rather than a consequence.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    expect(
      within(row('Deceptive')).getByText(
        /Choosing this will also switch on vi/,
      ),
    ).toBeVisible()
  })

  it('switches those chords on when the cadence is chosen', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    await user.click(row('Deceptive'))

    await waitFor(() => {
      const settings = progressionSettingsStore.read()
      expect(settings.numerals).toContain('vi')
      expect(settings.cadences).toContain('deceptive')
    })
  })

  it('keeps the chords that were already on', async () => {
    // The cadence brings what it needs and takes nothing away.
    const { user } = openMenu()
    await openScreen(user, 'Cadences')
    const before = progressionSettingsStore.read().numerals

    await user.click(row('Secondary'))

    await waitFor(() => {
      const after = progressionSettingsStore.read().numerals
      for (const id of before) expect(after).toContain(id)
      expect(after).toContain('III')
      expect(after).toContain('vi')
    })
  })

  it('stops saying it once the chords are on', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Cadences')

    await user.click(row('Deceptive'))

    await waitFor(() =>
      expect(row('Deceptive')).toHaveAttribute('aria-checked', 'true'),
    )
    expect(
      within(row('Deceptive')).queryByText(/will also switch on/),
    ).toBeNull()
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

  it('starts as an exact count rather than a ceiling', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Length')

    expect(row('Up to')).toHaveAttribute('aria-checked', 'false')
  })

  it('turns the length into a ceiling', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Length')
    await user.click(row('Up to'))

    await waitFor(() => expect(progressionSettingsStore.read().upTo).toBe(true))
  })

  it('explains what the ceiling means, naming the length that is set', async () => {
    progressionSettingsStore.write(settingsWith({ length: 6 }))
    const { user } = openMenu()
    await openScreen(user, 'Length')

    expect(
      screen.getByText(/random length up to 6 chords, rather than always 6/),
    ).toBeVisible()
  })

  it('says on the summary row which of the two it is', async () => {
    // A user who set "up to 5" and read back "5 chords" would reasonably
    // conclude it had not taken.
    progressionSettingsStore.write(settingsWith({ length: 5, upTo: true }))
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customization/ }))

    expect(
      screen.getByRole('button', { name: /^Length/ }).textContent,
    ).toContain('Up to 5 chords')
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

  it('lets the last one go', async () => {
    progressionSettingsStore.write(settingsWith({ inversions: [0] }))
    const { user } = openMenu()
    await openScreen(user, 'Inversions')

    expect(row('Root position')).toBeEnabled()
  })
})

describe('warnings', () => {
  it('flags an impossible range in the modal, naming the shortfall', async () => {
    progressionSettingsStore.write(
      settingsWith({ range: { low: 60, high: 67 } }),
    )
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customization/ }))

    expect(screen.getByText(/only 7 semitones wide/)).toBeVisible()
    expect(screen.getByText(/Widen it by 5 more/)).toBeVisible()
  })

  it('says nothing when the settings are fine', async () => {
    const { user } = openMenu()
    await user.click(screen.getByRole('button', { name: /Customization/ }))

    expect(screen.queryByText(/semitones wide/)).toBeNull()
    expect(screen.queryByText(/No cadence/)).toBeNull()
  })
})

describe('selecting a whole group of chords at once', () => {
  it('takes a section without disturbing the rest', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    await user.click(
      within(sectionOf('Secondary dominants')).getByRole('button', {
        name: 'Select all',
      }),
    )

    await waitFor(() => {
      const chosen = progressionSettingsStore.read().numerals
      for (const id of ['II', 'III', 'VI']) expect(chosen).toContain(id)
      // The defaults it started with are still there.
      for (const id of ['I', 'IV', 'V']) expect(chosen).toContain(id)
    })
  })

  it('gives a full section back on the second press', async () => {
    // The complaint about the first version: it filled and then would not
    // clear, and whether it cleared depended on what was on elsewhere.
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    const control = () =>
      within(sectionOf('Secondary dominants')).getByRole('button', {
        name: /select all/i,
      })

    await user.click(control())
    await waitFor(() => expect(control()).toHaveTextContent('Deselect all'))

    await user.click(control())
    await waitFor(() => {
      const chosen = progressionSettingsStore.read().numerals
      for (const id of ['II', 'III', 'VI']) expect(chosen).not.toContain(id)
    })
  })

  it('leaves a chord an enabled cadence depends on switched on', async () => {
    // The whole risk of a bulk clear. `I` and `V` are what an authentic
    // cadence is made of, and switching them off would break the setting the
    // lock exists to protect — so the group has to stop exactly where a single
    // tap on that row already stops.
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    const control = () =>
      within(sectionOf('Diatonic')).getByRole('button', {
        name: /select all/i,
      })

    await user.click(control())
    await waitFor(() => expect(control()).toHaveTextContent('Deselect all'))
    await user.click(control())

    await waitFor(() => {
      const chosen = progressionSettingsStore.read().numerals
      // The locked pair survived; the unlocked diatonic chords did not.
      expect(chosen).toContain('I')
      expect(chosen).toContain('V')
      expect(chosen).not.toContain('ii')
      expect(chosen).not.toContain('iii')
    })
  })

  it('keeps the locked rows locked afterwards', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    await user.click(screen.getByRole('button', { name: 'Select all chords' }))

    await waitFor(() => expect(row('I')).toBeDisabled())
    expect(row('V')).toBeDisabled()
  })

  it('offers to select rather than deselect while anything is off', async () => {
    const { user } = openMenu()
    await openScreen(user, 'Chords')

    expect(
      screen.getByRole('button', { name: 'Select all chords' }),
    ).toBeVisible()
  })
})
