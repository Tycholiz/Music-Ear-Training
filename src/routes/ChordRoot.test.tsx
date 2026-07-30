import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import ChordRoot from './ChordRoot'
import { piano } from '../audio'
import {
  DEFAULT_CHORD_SETTINGS,
  chordScoreStore,
  rootScoreStore,
  rootSettingsStore,
} from '../settings'
import * as exercises from '../exercises'
import type { RootQuestion } from '../exercises'

/** C major, first inversion: E G C. The root is the top note, not the bass. */
const INVERTED: RootQuestion = {
  notes: [64, 67, 72],
  chordId: 'major',
  inversion: 1,
  playMode: 'block',
  root: 60,
}

function renderExercise() {
  return render(
    <MemoryRouter>
      <ChordRoot />
    </MemoryRouter>,
  )
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start' }))
}

async function startAndReveal(user: ReturnType<typeof userEvent.setup>) {
  await start(user)
  await user.click(screen.getByRole('button', { name: 'Reveal' }))
}

beforeEach(() => {
  localStorage.clear()
  rootSettingsStore.reset()
  rootScoreStore.reset()
  chordScoreStore.reset()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  vi.spyOn(exercises, 'generateRootQuestion').mockReturnValue(INVERTED)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('starting', () => {
  it('waits for a tap before playing, so iOS can unlock audio', () => {
    renderExercise()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
    expect(piano.play).not.toHaveBeenCalled()
  })

  it('plays the whole chord on each new question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.play).toHaveBeenCalledOnce())
    expect(piano.play).toHaveBeenCalledWith([[64, 67, 72]])
  })

  it('explains itself when nothing can be generated', () => {
    rootSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major'],
      inversions: [3],
    })
    renderExercise()

    expect(screen.getByText(/No chord can be played/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('names the kind of chord being played, since the root is the question', async () => {
    const user = userEvent.setup()
    renderExercise()
    expect(screen.queryByText('Major Triad')).toBeNull()

    await start(user)
    expect(screen.getByText('Major Triad')).toBeVisible()
  })
})

describe('revealing', () => {
  it('hides the grading buttons until the root has been revealed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Wrong' })).toBeNull()
  })

  it('plays the root alone, not the chord', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(piano.play).toHaveBeenCalledWith([[72]])
  })

  it('reveals the root, not the bass note, of an inverted chord', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    // E G C: the lowest note is E (64), but the root is C (72).
    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(piano.play).toHaveBeenCalledWith([[72]])
    expect(piano.play).not.toHaveBeenCalledWith([[64]])
  })

  it('can be pressed repeatedly', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(piano.play).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })

  it('shows the grading buttons once revealed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)

    expect(screen.getByRole('button', { name: 'Correct' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Wrong' })).toBeVisible()
  })
})

describe('scoring', () => {
  it('starts at 0/0 with no accuracy yet', () => {
    renderExercise()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('—')
  })

  it('takes the user at their word when they got it', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)

    await user.click(screen.getByRole('button', { name: 'Correct' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('100%')
  })

  it('takes the user at their word when they did not', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)

    await user.click(screen.getByRole('button', { name: 'Wrong' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('0%')
  })

  it('replays the chord without touching the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(piano.play).toHaveBeenCalledWith([[64, 67, 72]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })

  it('persists across a remount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderExercise()
    await startAndReveal(user)
    await user.click(screen.getByRole('button', { name: 'Correct' }))
    unmount()

    renderExercise()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('keeps its score separate from the chord exercise', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)
    await user.click(screen.getByRole('button', { name: 'Correct' }))

    expect(rootScoreStore.read()).toEqual({ correct: 1, total: 1 })
    expect(localStorage.getItem('met.score.chords')).toBeNull()
  })
})

describe('advancing', () => {
  it('plays a new question and hides the grading buttons again', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)
    await user.click(screen.getByRole('button', { name: 'Correct' }))
    vi.mocked(piano.play).mockClear()

    await waitFor(
      () =>
        expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull(),
      { timeout: 3000 },
    )
    expect(piano.play).toHaveBeenCalledWith([[64, 67, 72]])
  })

  /**
   * Two taps on a grading button used to schedule two advances. They fire in
   * separate timer callbacks, so React commits each on its own, and the screen
   * generated two questions and played two chords a fraction of a second
   * apart — the second interrupting the first, with the quality label changing
   * under it.
   */
  it('advances once when a grading button is tapped twice', async () => {
    const user = userEvent.setup()
    // A second question that is a different chord, so a second advance would
    // be unmistakable in both the audio and the label.
    const SEVENTH: RootQuestion = {
      notes: [60, 64, 67, 70],
      chordId: 'dominant-7th',
      inversion: 0,
      playMode: 'block',
      root: 60,
    }
    let generated = 0
    vi.mocked(exercises.generateRootQuestion).mockImplementation(() =>
      generated++ === 0 ? INVERTED : SEVENTH,
    )

    renderExercise()
    await startAndReveal(user)
    const correct = screen.getByRole('button', { name: 'Correct' })
    await user.click(correct)
    await user.click(correct)
    vi.mocked(piano.play).mockClear()

    await waitFor(
      () => expect(screen.getByText('Dominant 7th')).toBeVisible(),
      { timeout: 3000 },
    )
    // Long enough for a second advance's timer to have fired.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    expect(piano.play).toHaveBeenCalledExactlyOnceWith([[60, 64, 67, 70]])
    expect(rootScoreStore.read()).toEqual({ correct: 1, total: 1 })
  })

  /** The same two presses, arriving inside one React batch. */
  it('advances once when both grading buttons are pressed in one batch', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
      fireEvent.click(screen.getByRole('button', { name: 'Wrong' }))
    })

    // The first press is the one that counts; the second is not a miss.
    expect(rootScoreStore.read()).toEqual({ correct: 1, total: 1 })
  })

  it('greys the grading buttons out once the grade has landed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)

    await user.click(screen.getByRole('button', { name: 'Correct' }))

    expect(screen.getByRole('button', { name: 'Correct' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Wrong' })).toBeDisabled()
  })
})

describe('menu', () => {
  it('resets the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await startAndReveal(user)
    await user.click(screen.getByRole('button', { name: 'Correct' }))

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Score')).toHaveTextContent('0/0'),
    )
  })
})

describe('keyboard focus', () => {
  it('parks focus on Play again, so space replays the chord', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
  })

  it('replays the chord rather than revealing when space is pressed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.keyboard(' ')

    expect(piano.play).toHaveBeenCalledExactlyOnceWith([[64, 67, 72]])
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull()
  })
})
