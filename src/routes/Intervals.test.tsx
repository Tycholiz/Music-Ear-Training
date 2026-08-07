import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import Intervals from './Intervals'
import { buildCells } from '../exercises'
import { piano } from '../audio'
import {
  intervalScoreStore,
  intervalStatsStore,
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
  intervalStatsStore.reset()
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
    // The grid follows the table, which now starts at the Minor 2nd — so
    // position zero is that rather than the Unison.
    const cells = buildCells([1, 3], [], false, null)
    expect(cells[0]).toMatchObject({ label: 'Minor 2nd' })
    expect(cells[1]).toBeNull() // Major 2nd, switched off
    expect(cells[2]).toMatchObject({ label: 'Minor 3rd' })
  })

  it('trims trailing blank rows rather than leaving dead space', () => {
    // Nothing above Minor 3rd is enabled, so the grid stops there — padded to
    // four to keep the two-column grid rectangular.
    expect(buildCells([1, 3], [], false, null)).toHaveLength(4)
  })

  it('drops blank rows in the middle too, not only the trailing ones', () => {
    // A Minor 2nd and an Octave used to be two buttons at opposite ends of a
    // twelve-row grid, with ten empty rows of nothing between them and both
    // buttons too small to hit.
    const cells = buildCells([1, 12], [], false, null)

    expect(cells).toHaveLength(4)
    expect(cells[0]).toMatchObject({ label: 'Minor 2nd' })
    expect(cells[3]).toMatchObject({ label: 'Octave' })
  })

  it('keeps every button in the column it was in', () => {
    // The muscle memory this grid protects is left versus right: someone who
    // knows the Major 2nd is on the right should never find it on the left.
    // Rows are dropped whole, so nothing can slide sideways.
    const cells = buildCells([2, 3], [], false, null)

    // Major 2nd is the second entry in the table, so it is a right-hand
    // button; the Minor 3rd below it is a left-hand one. Both stay put while
    // the row above them goes.
    expect(cells[0]).toBeNull()
    expect(cells[1]).toMatchObject({ label: 'Major 2nd' })
    expect(cells[2]).toMatchObject({ label: 'Minor 3rd' })
    expect(cells[3]).toBeNull()
  })

  it('keeps the two-column grid rectangular', () => {
    for (const enabled of [[1], [1, 2], [1, 2, 3], [1, 24]]) {
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
    // The only enabled interval, so its three empty rows above go and it comes
    // out first — still in its own column, which for the Perfect 5th is the
    // left one.
    const cells = buildCells([7], [], false, P5)
    expect(cells).toEqual([
      { id: '7', label: 'Perfect 5th', state: 'idle' },
      null,
    ])
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

describe('what goes into the statistics', () => {
  const press = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) => user.click(screen.getByRole('button', { name }))

  it('records the interval and the play mode of a correct first press', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Perfect 5th')

    const stats = intervalStatsStore.read()
    // Direction is part of what is being named: a descending perfect 5th is a
    // different skill, and pooled the figure described neither.
    expect(stats['interval:7-asc']).toMatchObject({ attempts: 1, correct: 1 })
    expect(stats['interval:7']).toBeUndefined()
    expect(stats['mode:ascending']).toMatchObject({ attempts: 1, correct: 1 })
  })

  it('records what was pressed instead, so a confusion can be named', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Perfect 4th')

    // The confusion carries no direction of its own. It is shown beneath a row
    // that has already said which direction it is.
    expect(intervalStatsStore.read()['interval:7-asc']).toMatchObject({
      attempts: 1,
      correct: 0,
      recent: [{ correct: false, answered: '5' }],
    })
  })

  /**
   * The score counts every press — three misses then a hit is 1/4, which is
   * right for a scoreboard. Statistics want a different fact: whether the user
   * knew it, which only the first press can answer. Counting the later ones
   * would make every interval look easier the longer someone struggled.
   */
  it('takes the first press only, unlike the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Perfect 4th')
    await press(user, 'Major 3rd')
    await press(user, 'Perfect 5th')

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/3')
    expect(intervalStatsStore.read()['interval:7-asc']).toMatchObject({
      attempts: 1,
      correct: 0,
    })
  })

  it('keeps the same interval apart by the direction it was heard in', async () => {
    // The whole point: someone can name a descending perfect 5th every time
    // and lose the ascending one, so the two cannot share a record.
    vi.mocked(exercises.generateIntervalQuestion).mockReturnValue({
      notes: [67, 60],
      playMode: 'descending',
      answer: 7,
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Perfect 5th')

    const stats = intervalStatsStore.read()
    expect(stats['interval:7-desc']).toMatchObject({ attempts: 1, correct: 1 })
    expect(stats['interval:7-asc']).toBeUndefined()
  })

  it('files a harmonic interval under neither direction', async () => {
    // Both notes arrive at once, so there is no motion to follow — it is heard
    // as a sonority, which is its own skill rather than a third direction.
    vi.mocked(exercises.generateIntervalQuestion).mockReturnValue({
      notes: [60, 67],
      playMode: 'harmonic',
      answer: 7,
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Perfect 5th')

    const stats = intervalStatsStore.read()
    expect(stats['interval:7-harmonic']).toMatchObject({ attempts: 1 })
    expect(stats['interval:7-asc']).toBeUndefined()
  })

  it('groups the harmonic-confirmation modes with their melodic direction', async () => {
    // `ascending-harmonic` plays the notes up and then together. The melodic
    // work is the same as plain ascending, with the chord as confirmation —
    // so the direction is shared, and the play mode is what says whether that
    // confirmation is doing any work.
    vi.mocked(exercises.generateIntervalQuestion).mockReturnValue({
      notes: [60, 67],
      playMode: 'ascending-harmonic',
      answer: 7,
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Perfect 5th')

    const stats = intervalStatsStore.read()
    expect(stats['interval:7-asc']).toMatchObject({ attempts: 1 })
    expect(stats['mode:ascending-harmonic']).toMatchObject({ attempts: 1 })
  })
})
