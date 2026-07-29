import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
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
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  vi.spyOn(exercises, 'generateMelodyQuestion').mockReturnValue(MELODY)
})

afterEach(() => {
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
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '5', '5')
    expect(answer()).toBe('55··')
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

describe('grading', () => {
  it('grades as soon as the answer is as long as the melody', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, '1', '5', '6')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')

    await tap(user, '5')
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('scores a melody once, not once per note', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('counts a wrong melody against the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '6')

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('0%')
  })

  it('says which position was missed, not just that it was wrong', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '6', '6', '5')

    // Only the second note was wrong; the rest should not be marked.
    const slots = within(screen.getByLabelText('Your answer')).getAllByText(
      /^(1|2|3|5|6)$/,
    )
    expect(slots[0].className).toContain('bg-correct')
    expect(slots[1].className).toContain('bg-incorrect')
    expect(slots[2].className).toContain('bg-correct')
    expect(slots[3].className).toContain('bg-correct')
  })

  it('shows what the melody actually was when it is missed', async () => {
    // Marking the wrong position without saying what belonged there tells the
    // user they failed and nothing they can use.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '6', '6', '5')

    expect(screen.getByLabelText('The melody')).toHaveTextContent(
      '1 · 5 · 6 · 5',
    )
  })

  it('keeps the answer out of sight until it has been answered', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.queryByLabelText('The melody')).toBeNull()
    await tap(user, '1', '5', '6')
    expect(screen.queryByLabelText('The melody')).toBeNull()
  })

  it('ignores further presses once graded', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '6')

    // The pad is replaced by the correction, so there is nothing to press —
    // and the score must not move again either way.
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })
})

describe('advancing', () => {
  it('moves on by itself when the melody was right', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '5', '6', '5')

    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
  })

  it('waits to be asked when the melody was missed', async () => {
    // The correction is the lesson, and it takes as long as it takes to read.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, '1', '6', '6', '5')

    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(screen.getByLabelText('The melody')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(answer()).toBe('····')
  })
})

describe('the tonic reference', () => {
  it('can be re-heard at any point in the question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play the tonic' }))
    expect(piano.play).toHaveBeenCalledWith([[60]])

    // Still there part-way through an answer.
    await tap(user, '1', '5')
    await user.click(screen.getByRole('button', { name: 'Play the tonic' }))
    expect(piano.play).toHaveBeenCalledTimes(2)
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

describe('the score', () => {
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
