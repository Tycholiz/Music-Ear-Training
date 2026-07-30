import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import Progressions from './Progressions'
import { piano } from '../audio'
import {
  DEFAULT_PROGRESSION_SETTINGS,
  progressionScoreStore,
  progressionSettingsStore,
} from '../settings'
import * as exercises from '../exercises'
import type { ProgressionQuestion } from '../exercises'

/** I IV V I in C: an authentic cadence with a run-up, and I appearing twice. */
const PROGRESSION: ProgressionQuestion = {
  numerals: ['I', 'IV', 'V', 'I'],
  tonic: 60,
  cadence: 'authentic',
}

function renderExercise() {
  return render(
    <MemoryRouter>
      <Progressions />
    </MemoryRouter>,
  )
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start' }))
}

/** Press numerals on the pad, by label. */
async function tap(
  user: ReturnType<typeof userEvent.setup>,
  ...labels: string[]
) {
  for (const label of labels) {
    await user.click(screen.getByRole('button', { name: label }))
  }
}

/** What the answer row currently reads. */
function answer() {
  return screen.getByLabelText('Your answer').textContent
}

function padButton(label: string) {
  return screen.getByRole('button', { name: label })
}

/**
 * Wait until a wrong press has been shown and the pad is live again.
 *
 * Not `answer() === '····'`: a wrong press never appends, so after a mistake on
 * the *first* chord the row is already empty and that condition is true before
 * the pad has reopened. Waiting on it let presses land while the pad was still
 * locked, and several tests passed on entering nothing at all.
 */
async function untilRetryable() {
  await waitFor(() => expect(padButton('I')).toBeEnabled(), { timeout: 3000 })
}

beforeEach(() => {
  localStorage.clear()
  progressionSettingsStore.reset()
  progressionScoreStore.reset()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'playSchedule').mockResolvedValue(undefined)
  vi.spyOn(piano, 'strike').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  vi.spyOn(exercises, 'generateProgressionQuestion').mockReturnValue(
    PROGRESSION,
  )
})

afterEach(() => {
  // Unmount before the mocks go: a pending advance timer that fires once the
  // real piano is back would try to fetch samples jsdom has not got.
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('starting', () => {
  it('waits for a tap before playing, so iOS can unlock audio', () => {
    renderExercise()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
    expect(piano.playSchedule).not.toHaveBeenCalled()
  })

  it('plays the progression as a sequence of chords', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.playSchedule).toHaveBeenCalledOnce())
    const scheduled = vi.mocked(piano.playSchedule).mock.calls[0][0]

    // Four chords, struck at four different times, three notes each.
    const onsets = [...new Set(scheduled.map((n) => n.startMs))]
    expect(onsets).toHaveLength(4)
    expect(scheduled).toHaveLength(12)
  })

  it('explains itself when nothing can be generated', () => {
    // A narrow range, since the store repairs an empty cadence list back to
    // the defaults and so cannot be used to make this state.
    progressionSettingsStore.write({
      ...DEFAULT_PROGRESSION_SETTINGS,
      range: { low: 60, high: 67 },
    })
    renderExercise()

    expect(screen.getByText(/No progression can be played/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })
})

describe('the numeral pad', () => {
  it('offers the chords that are enabled', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const label of ['I', 'IV', 'V']) {
      expect(padButton(label)).toBeVisible()
    }
  })

  it('leaves out chords that are switched off', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const label of ['ii', 'iii', 'vi', 'vii°', '♭III']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  it('lists them in ladder order', async () => {
    progressionSettingsStore.write({
      ...DEFAULT_PROGRESSION_SETTINGS,
      numerals: ['vi', 'I', '♭III', 'V', 'IV'].map((l) =>
        l === '♭III' ? 'bIII' : l,
      ),
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter((l) => ['I', 'IV', 'V', 'vi', '♭III'].includes(l ?? ''))

    expect(labels).toEqual(['I', 'IV', 'V', 'vi', '♭III'])
  })
})

describe('naming the chords', () => {
  it('shows a slot per chord before anything is entered', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    // Four chords to find, so four slots — the user should not have to count
    // them off the playback while also identifying it.
    expect(
      within(screen.getByLabelText('Your answer')).getAllByText('·'),
    ).toHaveLength(4)
  })

  it('appends each correct chord to the answer', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I')
    expect(answer()).toBe('I···')

    await tap(user, 'IV')
    expect(answer()).toBe('IIV··')
  })

  it('flashes the button green on a correct press', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I')
    expect(padButton('I').className).toContain('bg-correct')
  })

  it('flashes the button red on a wrong press', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    expect(padButton('V').className).toContain('bg-incorrect')
  })

  it('takes the same chord twice when the progression uses it twice', async () => {
    // I opens and closes this progression.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I', 'IV', 'V', 'I')
    expect(answer()).toBe('IIVVI')
  })

  it('sounds the chord that was pressed', async () => {
    // Naming a chord and never hearing it makes this a guessing game with a
    // keypad; hearing it turns a wrong answer into information.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await tap(user, 'IV')
    expect(piano.play).toHaveBeenCalledOnce()
    const [groups] = vi.mocked(piano.play).mock.calls[0]
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(3)
  })

  it('sounds a wrong chord too, which is the point', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await tap(user, 'V')
    expect(piano.play).toHaveBeenCalledOnce()
  })

  it('keeps both presses when two land in the same tick', async () => {
    // A fast player presses inside one React batch, and both would be graded
    // against the position this render was built with.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await act(async () => {
      fireEvent.click(padButton('I'))
      fireEvent.click(padButton('IV'))
    })

    expect(answer()).toBe('IIV··')
  })
})

describe('getting one wrong', () => {
  it('clears the answer so the progression can be tried again', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I', 'V')
    expect(answer()).toBe('I···')

    await untilRetryable()
    expect(answer()).toBe('····')
  })

  it('keeps the same progression rather than moving on', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(exercises.generateProgressionQuestion).mockClear()

    await tap(user, 'V')
    await untilRetryable()

    expect(exercises.generateProgressionQuestion).not.toHaveBeenCalled()
  })

  it('locks the pad while the mistake is being shown', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    expect(padButton('I')).toBeDisabled()
  })

  it('accepts the progression on a later attempt', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    await untilRetryable()
    await tap(user, 'I', 'IV', 'V', 'I')

    expect(answer()).toBe('IIVVI')
  })
})

describe('scoring', () => {
  it('scores a clean run as correct', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('scores a progression once, not once per chord', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I', 'IV', 'V')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')

    await tap(user, 'I')
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('charges the first mistake immediately', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'V')

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('charges only the first attempt, however many it takes', async () => {
    // A user who knows the progression but mis-taps is not billed for the tap.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    await untilRetryable()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    // A second real mistake, entered on a live pad rather than a locked one.
    await tap(user, 'IV')
    expect(padButton('IV').className).toContain('bg-incorrect')
    await untilRetryable()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('does not credit a correct run that followed a miss', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    await untilRetryable()
    await tap(user, 'I', 'IV', 'V', 'I')

    expect(answer()).toBe('IIVVI')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })
})

describe('the key reference', () => {
  it('can be heard at any point in the question', async () => {
    // The exercise is about relationships, so being given the tonic costs it
    // nothing it was asking for.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play the key' }))
    expect(piano.strike).toHaveBeenCalledOnce()

    await tap(user, 'I')
    vi.mocked(piano.strike).mockClear()
    await user.click(screen.getByRole('button', { name: 'Play the key' }))
    expect(piano.strike).toHaveBeenCalledOnce()
  })

  it('plays the tonic chord of the key', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play the key' }))
    const [notes] = vi.mocked(piano.strike).mock.calls[0]
    expect(notes).toHaveLength(3)
    for (const note of notes) {
      expect([0, 4, 7]).toContain((((note - 60) % 12) + 12) % 12)
    }
  })

  it('leaves the score alone', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Play the key' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })
})

describe('revealing the answer', () => {
  it('is offered from the start, not only after a failed attempt', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeEnabled()
  })

  it('shows the progression in full and closes the pad', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(answer()).toBe('IIVVI')
    expect(screen.queryByRole('button', { name: 'I' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible()
  })

  it('counts as a miss when nothing else has charged the question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('does not charge twice when the question was already lost', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('cannot undo a progression already answered correctly', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })
})

describe('advancing', () => {
  it('moves on by itself once the progression is named', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')

    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
  })

  it('waits to be asked after a reveal', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(answer()).toBe('IIVVI')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(answer()).toBe('····')
  })
})

describe('replaying', () => {
  it('plays the progression again without touching the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.playSchedule).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(piano.playSchedule).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })

  it('does not clear what has been named so far', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV')

    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(answer()).toBe('IIVVI'.slice(0, 3) + '··')
  })
})

describe('the stored score', () => {
  it('persists across a remount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')
    unmount()

    renderExercise()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('stays separate from the other exercises', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')

    expect(progressionScoreStore.read()).toEqual({ correct: 1, total: 1 })
    expect(localStorage.getItem('met.score.melody')).toBeNull()
    expect(localStorage.getItem('met.score.chords')).toBeNull()
  })

  it('resets from the menu', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Score')).toHaveTextContent('0/0'),
    )
  })
})

describe('keyboard focus', () => {
  it('parks focus on Play again, so space replays the progression', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
  })
})
