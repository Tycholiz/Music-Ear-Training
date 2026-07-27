import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import Intervals from './Intervals'
import { buildCells } from '../exercises'
import { piano } from '../audio'
import {
  intervalScoreStore,
  intervalSettingsStore,
  DEFAULT_INTERVAL_SETTINGS,
} from '../settings'
import * as exercises from '../exercises'
import type { IntervalQuestion } from '../exercises'

/** A fixed ascending Perfect 5th, so the right answer is always "Perfect 5th". */
const P5: IntervalQuestion = {
  notes: [60, 67],
  playMode: 'ascending',
  answer: 7,
}

function renderExercise() {
  return render(
    <MemoryRouter>
      <Intervals />
    </MemoryRouter>,
  )
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start' }))
}

beforeEach(() => {
  localStorage.clear()
  intervalSettingsStore.reset()
  intervalScoreStore.reset()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  vi.spyOn(exercises, 'generateIntervalQuestion').mockReturnValue(P5)
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

  it('plays the first question as soon as it starts', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.play).toHaveBeenCalledOnce())
    expect(piano.play).toHaveBeenCalledWith([[60], [67]])
  })

  it('explains itself instead of starting when nothing can be generated', () => {
    intervalSettingsStore.write({
      ...DEFAULT_INTERVAL_SETTINGS,
      intervals: [13],
      playModes: ['descending'],
    })
    renderExercise()

    expect(screen.getByText(/No interval can be played/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })
})

describe('answering', () => {
  it('turns a wrong answer red but keeps it pressable for replay', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const wrong = screen.getByRole('button', { name: 'Perfect 4th' })
    await user.click(wrong)

    expect(wrong).toHaveClass('bg-incorrect')
    expect(wrong).toBeEnabled()
  })

  it('replays a wrong guess without scoring it twice', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const wrong = screen.getByRole('button', { name: 'Perfect 4th' })
    await user.click(wrong)
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    vi.mocked(piano.play).mockClear()
    await user.click(wrong)

    // Sounded again, but the score is untouched.
    expect(piano.play).toHaveBeenCalledWith([[60], [65]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('lets the user keep guessing after a miss', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Perfect 4th' }))
    await user.click(screen.getByRole('button', { name: 'Tritone' }))

    expect(screen.getByRole('button', { name: 'Tritone' })).toHaveClass(
      'bg-incorrect',
    )
    expect(screen.getByRole('button', { name: 'Perfect 5th' })).toBeEnabled()
  })

  it('turns the right answer green', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))
    expect(screen.getByRole('button', { name: 'Perfect 5th' })).toHaveClass(
      'bg-correct',
    )
  })

  it('replays the same question without changing the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(piano.play).toHaveBeenCalledWith([[60], [67]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })
})

describe('scoring', () => {
  it('starts at 0/0 with no accuracy yet', () => {
    renderExercise()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('—')
  })

  it('scores a first-time correct answer as 1/1', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('100%')
  })

  it('counts every guess: three misses then a hit is 1/4', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor 2nd' }))
    await user.click(screen.getByRole('button', { name: 'Major 2nd' }))
    await user.click(screen.getByRole('button', { name: 'Minor 3rd' }))
    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/4')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('25%')
  })

  it('does not double count a locked button', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const wrong = screen.getByRole('button', { name: 'Perfect 4th' })
    await user.click(wrong)
    await user.click(wrong)

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('persists the score across a remount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))
    unmount()

    renderExercise()
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })
})

describe('advancing', () => {
  it('plays a new question after a pause, with the buttons reset', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Perfect 4th' }))
    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))
    expect(screen.getByRole('button', { name: 'Perfect 4th' })).toHaveClass(
      'bg-incorrect',
    )
    vi.mocked(piano.play).mockClear()

    // Both buttons return to idle and the next question plays once the
    // confirming interval has finished sounding.
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Perfect 4th' })).toHaveClass(
          'bg-surface',
        ),
      { timeout: 4000 },
    )
    expect(screen.getByRole('button', { name: 'Perfect 5th' })).toHaveClass(
      'bg-surface',
    )
    expect(piano.play).toHaveBeenCalledOnce()
  })

  it('waits for the confirming interval to finish before advancing', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))

    // The correct answer sounds immediately; the next question must not
    // interrupt it, so it is still the only thing played shortly afterwards.
    expect(piano.play).toHaveBeenLastCalledWith([[60], [67]])
    await new Promise((resolve) => setTimeout(resolve, 850))
    expect(piano.play).toHaveBeenLastCalledWith([[60], [67]])
  })
})

describe('menu', () => {
  it('resets the score back to 0/0', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Perfect 5th' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Score')).toHaveTextContent('0/0'),
    )
  })
})

describe('buildCells', () => {
  it('renders a blank cell for every disabled interval, holding position', () => {
    const cells = buildCells([1, 3], [], false, null)
    expect(cells[0]).toBeNull() // Unison
    expect(cells[1]).toMatchObject({ label: 'Minor 2nd' })
    expect(cells[2]).toBeNull() // Major 2nd, switched off
    expect(cells[3]).toMatchObject({ label: 'Minor 3rd' })
  })

  it('trims trailing blank rows rather than leaving dead space', () => {
    // Nothing above Minor 3rd is enabled, so the grid stops there.
    expect(buildCells([1, 3], [], false, null)).toHaveLength(4)
  })

  it('keeps the two-column grid rectangular', () => {
    for (const enabled of [[1], [1, 2], [1, 2, 3], [0, 24]]) {
      expect(
        buildCells(enabled, [], false, null).length % 2,
        `${enabled}`,
      ).toBe(0)
    }
  })

  it('marks guessed intervals wrong and the solved answer correct', () => {
    const cells = buildCells([5, 6, 7], [5], true, P5)
    const byLabel = new Map(
      cells.filter((c) => c !== null).map((c) => [c.label, c.state]),
    )
    expect(byLabel.get('Perfect 4th')).toBe('wrong')
    expect(byLabel.get('Tritone')).toBe('idle')
    expect(byLabel.get('Perfect 5th')).toBe('correct')
  })

  it('leaves the answer idle until the question is solved', () => {
    const cells = buildCells([7], [], false, P5)
    expect(cells[7]).toMatchObject({ label: 'Perfect 5th', state: 'idle' })
  })
})

describe('keyboard focus', () => {
  it('focuses Play again when a question starts, so space replays it', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
  })

  it('returns focus to Play again after advancing, not to an answer', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const correct = screen.getByRole('button', { name: 'Perfect 5th' })
    await user.click(correct)
    expect(correct).toHaveFocus()

    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: 'Play again' }),
        ).toHaveFocus(),
      { timeout: 4000 },
    )
  })

  it('replays the question rather than an answer when space is pressed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.keyboard(' ')

    expect(piano.play).toHaveBeenCalledExactlyOnceWith([[60], [67]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })
})
