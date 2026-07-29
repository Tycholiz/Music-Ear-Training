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
import Melody from './Melody'
import { piano } from '../audio'
import {
  DEFAULT_MELODY_SETTINGS,
  melodyScoreStore,
  melodySettingsStore,
} from '../settings'
import * as exercises from '../exercises'
import type { MelodyQuestion } from '../exercises'

/**
 * C major pentatonic: 1 5 6 5, ending at rest. The 5 appears twice, which is
 * what makes it worth using — a degree can be entered more than once.
 */
const MELODY: MelodyQuestion = {
  degrees: [0, 7, 9, 7],
  notes: [60, 67, 69, 67],
  backing: [48, 52, 55],
  tonic: 60,
  scaleId: 'major-pentatonic',
}

function renderExercise() {
  return render(
    <MemoryRouter>
      <Melody />
    </MemoryRouter>,
  )
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start' }))
}

/** Tap degrees on the pad, by label. */
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

beforeEach(() => {
  localStorage.clear()
  melodySettingsStore.reset()
  melodyScoreStore.reset()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'playSchedule').mockResolvedValue(undefined)
  vi.spyOn(piano, 'strike').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  vi.spyOn(exercises, 'generateMelodyQuestion').mockReturnValue(MELODY)
})

afterEach(() => {
  // Unmount before the mocks go, not after. A pending advance timer that fires
  // once the real piano is back tries to fetch samples jsdom has not got, and
  // the rejection surfaces as an unhandled error in whichever test happens to
  // be running by then. Unmounting first clears the timers that would do it.
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

  it('plays the melody over its backing', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.playSchedule).toHaveBeenCalledOnce())
    const scheduled = vi.mocked(piano.playSchedule).mock.calls[0][0]
    expect(scheduled.some((n) => n.midi === 60 && n.gain === undefined)).toBe(
      true,
    )
    // The backing is in there too, quieter than the melody.
    expect(scheduled.some((n) => n.midi === 48 && n.gain !== undefined)).toBe(
      true,
    )
  })

  it('explains itself when nothing can be generated', () => {
    melodySettingsStore.write({
      ...DEFAULT_MELODY_SETTINGS,
      range: { low: 60, high: 64 },
    })
    renderExercise()

    expect(screen.getByText(/No melody can be played/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })
})

describe('the degree pad', () => {
  it('offers the degrees of the chosen scale', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const label of ['1', '2', '3', '5', '6']) {
      expect(screen.getByRole('button', { name: label })).toBeVisible()
    }
  })

  it('leaves out degrees the scale does not have', async () => {
    // Major pentatonic has no 4 and no 7, so there is nothing to press.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const label of ['b2', 'b3', '4', 'b5', 'b6', 'b7', '7']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })
})

describe('entering a melody', () => {
  it('shows a slot per note before anything is entered', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    // Four notes to find, so four slots — the user should not have to count
    // them off the playback while also identifying it.
    expect(
      within(screen.getByLabelText('Your answer')).getAllByText('·'),
    ).toHaveLength(4)
  })

  it('fills the slots in order as degrees are pressed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '1')
    expect(answer()).toBe('1···')

    await tap(user, '5')
    expect(answer()).toBe('15··')
  })

  it('keeps both notes when two degrees are tapped in the same tick', async () => {
    // A fast player taps inside one React batch. Appending to the `entered`
    // captured by the current render loses the first press — notes went
    // missing under exactly the input this exercise invites, and `user.click`
    // never caught it because it waits for a render between presses.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1' }))
      fireEvent.click(screen.getByRole('button', { name: '5' }))
    })

    expect(answer()).toBe('15··')
  })

  it('takes the same degree more than once', async () => {
    // The melody is 1 5 6 5, so the 5 has to be enterable twice.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '1', '5', '6', '5')
    expect(answer()).toBe('1565')
  })

  it('removes only the last degree on Undo', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '1', '5', '6')
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(answer()).toBe('15··')
  })

  it('has nothing to undo before anything is entered', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})

describe('immediate feedback', () => {
  it('marks a correct note green as soon as it is entered', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '1')
    const slots = within(screen.getByLabelText('Your answer')).getAllByText('1')
    expect(slots[0].className).toContain('bg-correct')
  })

  it('marks a wrong note red without waiting for the rest of the melody', async () => {
    // Hearing that the first note was wrong only after committing to three
    // more teaches nothing about the first — by then the ear has moved on.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '5')
    const slot = within(screen.getByLabelText('Your answer')).getByText('5')
    expect(slot.className).toContain('bg-incorrect')
  })

  it('keeps the notes before the mistake green', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    // 1 and 5 are right; 1 in third place is not.
    await tap(user, '1', '5', '1')
    const answered = screen.getByLabelText('Your answer')
    const [first, second, third] = within(answered).getAllByText(/^[0-9b]+$/)

    expect(first.className).toContain('bg-correct')
    expect(second.className).toContain('bg-correct')
    expect(third.className).toContain('bg-incorrect')
  })

  it('says so in words as well as in colour', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '5')
    expect(screen.getByText(/Not that one/i)).toBeVisible()
  })

  it('locks the pad while the mistake is being shown', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '5')

    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
  })
})

describe('retrying', () => {
  it('clears the answer so the melody can be tried again', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '1')

    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
    expect(screen.getByRole('button', { name: '1' })).toBeEnabled()
  })

  it('keeps the same melody rather than moving on', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(exercises.generateMelodyQuestion).mockClear()

    await tap(user, '5')
    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })

    expect(exercises.generateMelodyQuestion).not.toHaveBeenCalled()
  })

  it('accepts the melody on a later attempt', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '5')
    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
    await tap(user, '1', '5', '6', '5')

    expect(answer()).toBe('1565')
  })
})

describe('scoring', () => {
  it('scores a clean run as correct', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('scores a melody once, not once per note', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '1', '5', '6')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')

    await tap(user, '5')
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('charges the first mistake immediately', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '5')

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('0%')
  })

  it('charges only the first attempt, however many it takes', async () => {
    // A user who knows the melody but fumbles a button should not be charged
    // for the button — the same rule the chord root exercise follows.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '5')
    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    await tap(user, '6')
    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('does not credit a correct run that followed a miss', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '5')
    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
    await tap(user, '1', '5', '6', '5')

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })
})

describe('advancing', () => {
  it('moves on by itself once the melody is entered correctly', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
  })

  it('ignores further presses once the melody is complete', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })
})

describe('hearing what was pressed', () => {
  it('sounds the degree that was entered', async () => {
    // Choosing a degree by name and never hearing it makes this a guessing
    // game with a keypad. Hearing it turns a wrong answer into information.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await tap(user, '1')
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([60])
  })

  it('sounds it at the pitch it has against this melody\u2019s tonic', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    // The 5 above a tonic of C4 is G4.
    await tap(user, '5')
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([67])
  })

  it('sounds a wrong degree too, which is the point', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    // 6 is wrong in first place, and the user should still hear what they
    // picked so they can tell it against what they remember.
    await tap(user, '6')
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([69])
  })

  it('sounds the tonic where this melody sang it, not an octave down', async () => {
    // The melody is 6 1 6 1 5 with both 1s up at the octave. Answering a
    // pressed 1 with the low C would tell the user they had misheard when
    // they had in fact pressed the right button.
    vi.mocked(exercises.generateMelodyQuestion).mockReturnValue({
      degrees: [9, 0, 9, 0, 7],
      notes: [69, 72, 69, 72, 67],
      backing: [48, 52, 55],
      tonic: 60,
      scaleId: 'major-pentatonic',
    })

    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await tap(user, '6')
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([69])

    vi.mocked(piano.strike).mockClear()
    await tap(user, '1')
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([72])
  })

  it('follows the octave from note to note within one melody', async () => {
    // 8 1 2 1 1 as a player would say it — the same degree at two octaves,
    // both reading as "1" on the pad. One pitch per degree cannot serve this.
    vi.mocked(exercises.generateMelodyQuestion).mockReturnValue({
      degrees: [0, 0, 2, 0, 0],
      notes: [72, 60, 62, 60, 60],
      backing: [48, 52, 55],
      tonic: 60,
      scaleId: 'major-pentatonic',
    })

    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const sounded: number[] = []
    for (const label of ['1', '1', '2', '1', '1']) {
      vi.mocked(piano.strike).mockClear()
      await tap(user, label)
      sounded.push(vi.mocked(piano.strike).mock.calls[0][0][0])
    }

    expect(sounded).toEqual([72, 60, 62, 60, 60])
  })

  it('keeps the octaves straight when two are pressed in the same tick', async () => {
    // The batching trap again: both presses would read the position this
    // render was built with, and the second 1 would sound the first one's
    // octave.
    vi.mocked(exercises.generateMelodyQuestion).mockReturnValue({
      degrees: [0, 0, 2, 0, 0],
      notes: [72, 60, 62, 60, 60],
      backing: [48, 52, 55],
      tonic: 60,
      scaleId: 'major-pentatonic',
    })

    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1' }))
      fireEvent.click(screen.getByRole('button', { name: '1' }))
    })

    const sounded = vi.mocked(piano.strike).mock.calls.map((call) => call[0][0])
    expect(sounded).toEqual([72, 60])
  })

  it('says nothing once the pad is closed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')
    vi.mocked(piano.strike).mockClear()

    // Every degree button is disabled at this point; nothing can sound.
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
    expect(piano.strike).not.toHaveBeenCalled()
  })
})

describe('revealing the answer', () => {
  it('is offered from the start, not only after a failed attempt', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeEnabled()
  })

  it('shows the melody in full', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(answer()).toBe('1565')
  })

  it('does not colour a handed answer as though it was found', async () => {
    // Green means the user got it. A note they were given has not been got,
    // and saying otherwise would flatter the row into meaninglessness.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    const slots = within(screen.getByLabelText('Your answer')).getAllByText(
      /^[0-9b]+$/,
    )
    for (const slot of slots) {
      expect(slot.className).not.toContain('bg-correct')
      expect(slot.className).not.toContain('bg-incorrect')
    }
  })

  it('keeps the degrees the user did get as theirs', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5')
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    const slots = within(screen.getByLabelText('Your answer')).getAllByText(
      /^[0-9b]+$/,
    )
    expect(slots[0].className).toContain('bg-correct')
    expect(slots[1].className).toContain('bg-correct')
    expect(slots[2].className).not.toContain('bg-correct')
    expect(slots[3].className).not.toContain('bg-correct')
  })

  it('does not hand a wrong note back as one of the answers', async () => {
    // Revealing mid-mistake catches the red note still on screen.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '1')
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(answer()).toBe('1565')
    const slots = within(screen.getByLabelText('Your answer')).getAllByText(
      /^[0-9b]+$/,
    )
    expect(slots[0].className).toContain('bg-correct')
    expect(slots[1].className).not.toContain('bg-correct')
    expect(slots[1].className).not.toContain('bg-incorrect')
  })

  it('closes the pad, since there is nothing left to answer', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(screen.queryByRole('button', { name: '1' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible()
  })

  it('waits to be asked before moving on', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(answer()).toBe('1565')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(answer()).toBe('····')
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

    await tap(user, '6')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('cannot be used to undo a melody already answered correctly', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })
})

describe('the chord reference', () => {
  it('plays the backing chord on its own', async () => {
    // It sounds once, under the opening note, and has decayed to almost
    // nothing by the fifth degree. Getting it back is the difference between
    // placing a degree against the harmony and against a memory of it.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await user.click(
      screen.getByRole('button', { name: 'Play the backing chord' }),
    )
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([48, 52, 55])
  })

  it('sounds every note of the chord together, not one at a time', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await user.click(
      screen.getByRole('button', { name: 'Play the backing chord' }),
    )
    const notes = vi.mocked(piano.strike).mock.calls[0][0]
    expect(notes).toEqual([48, 52, 55])
  })

  it('is there at any point in the question, like the tonic', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5')
    vi.mocked(piano.strike).mockClear()

    await user.click(
      screen.getByRole('button', { name: 'Play the backing chord' }),
    )
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([48, 52, 55])
  })

  it('does not offer a chord when the backing is switched off', async () => {
    // A control for a sound that does not exist is not a control, and the
    // user turned it off themselves.
    vi.mocked(exercises.generateMelodyQuestion).mockReturnValue({
      ...MELODY,
      backing: [],
    })

    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(
      screen.queryByRole('button', { name: 'Play the backing chord' }),
    ).toBeNull()
    // The tonic is still there; it does not depend on the backing.
    expect(screen.getByRole('button', { name: 'Play the tonic' })).toBeVisible()
  })

  it('leaves the score alone', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(
      screen.getByRole('button', { name: 'Play the backing chord' }),
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })
})

describe('the tonic reference', () => {
  it('can be re-heard at any point in the question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.strike).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play the tonic' }))
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([60])

    // Still there part-way through an answer.
    await tap(user, '1', '5')
    vi.mocked(piano.strike).mockClear()
    await user.click(screen.getByRole('button', { name: 'Play the tonic' }))
    expect(piano.strike).toHaveBeenCalledExactlyOnceWith([60])
  })
})

describe('replaying', () => {
  it('plays the melody again without touching the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.playSchedule).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(piano.playSchedule).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })

  it('does not clear what has been entered so far', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5')

    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(answer()).toBe('15··')
  })
})

describe('the stored score', () => {
  it('persists across a remount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')
    unmount()

    renderExercise()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('stays separate from the other exercises', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    expect(melodyScoreStore.read()).toEqual({ correct: 1, total: 1 })
    expect(localStorage.getItem('met.score.chords')).toBeNull()
    expect(localStorage.getItem('met.score.intervals')).toBeNull()
  })

  it('resets from the menu', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Score')).toHaveTextContent('0/0'),
    )
  })
})

describe('keyboard focus', () => {
  it('parks focus on Play again, so space replays the melody', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
  })

  it('replays rather than entering a degree when space is pressed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.playSchedule).mockClear()

    await user.keyboard(' ')

    expect(piano.playSchedule).toHaveBeenCalledOnce()
    expect(answer()).toBe('····')
  })
})
