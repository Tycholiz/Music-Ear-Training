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
  progressionStatsStore,
} from '../settings'
import * as exercises from '../exercises'
import { keyChord } from '../exercises'
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
  progressionStatsStore.reset()
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

  it('plays the progression as a sequence of chords, over an established key', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.playSchedule).toHaveBeenCalledOnce())
    const scheduled = vi.mocked(piano.playSchedule).mock.calls[0][0]

    // The key chord, then four chords struck at four different times, three
    // notes each.
    const onsets = [...new Set(scheduled.map((n) => n.startMs))]
    expect(onsets).toHaveLength(5)
    expect(scheduled).toHaveLength(15)
  })

  it('establishes the key before the progression, and only once', async () => {
    // Without a tonic the answer is not well defined: I V I V and IV I IV I
    // are the same four sounds and differ only in where home is. A user who
    // heard the second reading was not wrong, and was charged for it anyway.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.playSchedule).toHaveBeenCalledOnce())
    const scheduled = vi.mocked(piano.playSchedule).mock.calls[0][0]
    const onsets = [...new Set(scheduled.map((n) => n.startMs))].sort(
      (a, b) => a - b,
    )

    // The same tonic chord the Key button plays. One sound means home.
    const anchor = scheduled.filter((n) => n.startMs === onsets[0])
    expect(anchor.map((n) => n.midi)).toEqual(
      keyChord(PROGRESSION, DEFAULT_PROGRESSION_SETTINGS),
    )

    // It stops, with real silence, before the progression starts — the gap is
    // what keeps it from being heard as chord one.
    const anchorEnds = onsets[0] + anchor[0].durationMs
    expect(onsets[1]).toBeGreaterThan(anchorEnds)
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

  it('counts the slots off this question, not off the length setting', async () => {
    // What makes "up to" work at all. The setting is a ceiling, so the row has
    // to follow the progression that was actually generated — a row sized from
    // settings.length would hand the count back the moment it varied.
    progressionSettingsStore.write({
      ...DEFAULT_PROGRESSION_SETTINGS,
      length: 8,
      upTo: true,
    })
    vi.mocked(exercises.generateProgressionQuestion).mockReturnValue({
      numerals: ['I', 'V', 'I'],
      tonic: 60,
      cadence: 'authentic',
    })

    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(
      within(screen.getByLabelText('Your answer')).getAllByText('·'),
    ).toHaveLength(3)
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

describe('hearing one chord at a time', () => {
  /**
   * A descending progression, chosen so the test can actually fail.
   *
   * Two properties the default `I IV V I` does not have, and without which
   * this whole block would guard nothing:
   *
   * 1. **All five voicings are different.** `I IV V I` voices its first and
   *    last chord identically, so a slot playing the wrong one of the two
   *    would pass.
   * 2. **Three of them differ from the same chord voiced standalone.** In
   *    `I IV V I` the voice leading happens to land on the centre-placed
   *    voicing every time, so `voiceChordAlone` and `voiceProgression` are
   *    indistinguishable and the register claim below is untestable.
   */
  const DESCENDING: ProgressionQuestion = {
    numerals: ['I', 'bVII', 'bVI', 'V', 'I'],
    tonic: 57,
    cadence: 'authentic',
  }

  function withDescendingChords() {
    const settings = {
      ...DEFAULT_PROGRESSION_SETTINGS,
      numerals: ['I', 'V', 'bVI', 'bVII'],
    }
    progressionSettingsStore.write(settings)
    vi.mocked(exercises.generateProgressionQuestion).mockReturnValue(DESCENDING)
    return exercises.voiceProgression(DESCENDING, settings)
  }

  /** The nth slot of the answer row. */
  function slot(position: number) {
    return screen.getByRole('button', { name: `Play chord ${position}` })
  }

  it('plays the chord at the slot that was tapped, and only that one', async () => {
    const voiced = withDescendingChords()
    // All five differ, so a slot playing its neighbour would fail.
    expect(new Set(voiced.map((notes) => notes.join(','))).size).toBe(5)

    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const position of [1, 2, 3, 4, 5]) {
      vi.mocked(piano.play).mockClear()
      await user.click(slot(position))
      expect(piano.play, `chord ${position}`).toHaveBeenCalledExactlyOnceWith([
        voiced[position - 1],
      ])
    }
  })

  it('voices the chord as the progression voiced it, not standalone', async () => {
    // The mistake logged three times in the README under "Sound feedback
    // follows the position, not the note": a chord placed centre-range is a
    // different arrangement of the same harmony, and a user comparing it
    // against what they remember could reasonably conclude they had the wrong
    // chord.
    const voiced = withDescendingChords()
    const settings = progressionSettingsStore.read()
    const standalone = DESCENDING.numerals.map((id) =>
      exercises.voiceChordAlone(id, DESCENDING.tonic, settings),
    )

    // Positions 3, 4 and 5 have been pushed down the keyboard by the voice
    // leading. Without them the two functions agree and this proves nothing.
    const moved = [2, 3, 4].filter(
      (i) => voiced[i].join() !== standalone[i].join(),
    )
    expect(moved).toEqual([2, 3, 4])

    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const i of moved) {
      vi.mocked(piano.play).mockClear()
      await user.click(slot(i + 1))
      expect(piano.play, `chord ${i + 1}`).toHaveBeenCalledWith([voiced[i]])
      expect(piano.play, `chord ${i + 1}`).not.toHaveBeenCalledWith([
        standalone[i],
      ])
    }
  })

  it('plays a position that has not been answered yet', async () => {
    // The entire point — a scaffold for working up to hearing the whole
    // progression, so it cannot wait until the user has got there.
    const voiced = withDescendingChords()
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(answer()).toBe('·····')
    vi.mocked(piano.play).mockClear()
    await user.click(slot(5))

    expect(piano.play).toHaveBeenCalledExactlyOnceWith([voiced[4]])
  })

  it('never scores, never advances, and never counts as a guess', async () => {
    withDescendingChords()
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const position of [1, 2, 3, 4, 5]) {
      await user.click(slot(position))
    }

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
    expect(answer()).toBe('·····')
    // Still the first question, and still waiting on the pad.
    expect(padButton('I')).toBeEnabled()
  })

  it('still plays once the progression has been revealed', async () => {
    const voiced = withDescendingChords()
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    // The slots hold the answer now; hearing it named and played together is
    // the lesson the reveal exists for.
    expect(answer()).toBe('I♭VII♭VIVI')
    vi.mocked(piano.play).mockClear()
    await user.click(slot(3))

    expect(piano.play).toHaveBeenCalledExactlyOnceWith([voiced[2]])
  })

  it('labels each slot by what it does, since a dot is not a name', async () => {
    withDescendingChords()
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    for (const position of [1, 2, 3, 4, 5]) {
      expect(slot(position)).toBeEnabled()
    }
    expect(screen.queryByRole('button', { name: 'Play chord 6' })).toBeNull()
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

  it('re-establishes the key, rather than replaying the progression bare', async () => {
    // Replay is exactly when a user who has lost the tonic asks to hear the
    // question again, so taking it away here would drop it when it is needed
    // most — and would make the replayed question a different question from
    // the one first asked.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await waitFor(() => expect(piano.playSchedule).toHaveBeenCalledOnce())
    const first = vi.mocked(piano.playSchedule).mock.calls[0][0]
    vi.mocked(piano.playSchedule).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(vi.mocked(piano.playSchedule).mock.calls[0][0]).toEqual(first)
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

describe('what goes into the statistics', () => {
  it('records the first chord as an opening, and not as a numeral', async () => {
    // The progression is I IV V I, so the opening chord has nothing before it.
    //
    // The two used to be recorded together — `numeral:I` *and* `opening:I` —
    // which made the bucketed section a blend of two skills. Hearing a chord
    // against the key alone and hearing it against the chord before it are
    // different tasks, so the opening is now the only record position zero
    // writes, and the screen's buckets can honestly say "after the first".
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I')

    const stats = progressionStatsStore.read()
    expect(stats['opening:I'].correct).toBe(1)
    expect(stats['numeral:I']).toBeUndefined()
    // No movement record for the first chord — there is nothing before it.
    expect(Object.keys(stats).some((key) => key.startsWith('movement:'))).toBe(
      false,
    )
    // Which inversion is the voicing's business — it picks for smoothness —
    // so this only asserts the dimension is being recorded at all.
    expect(Object.keys(stats).some((key) => key.startsWith('inversion:'))).toBe(
      true,
    )
  })

  it('records every chord after the first as a numeral', async () => {
    // The other half of the split: position one onwards is what the buckets
    // are about, and the opening must not turn up among them.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V')

    const stats = progressionStatsStore.read()
    expect(stats['numeral:IV'].correct).toBe(1)
    expect(stats['numeral:V'].correct).toBe(1)
    expect(stats['numeral:I']).toBeUndefined()
    expect(stats['opening:IV']).toBeUndefined()
  })

  it('records the cadence only on the chords the cadence is made of', async () => {
    // An authentic cadence is V then I, so in I IV V I the first two presses
    // are the run-up. Averaging them in made this a figure about the run-up:
    // nail four chords, miss the ending, and it still read 75%.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I')
    expect(progressionStatsStore.read()['cadence:authentic']).toBeUndefined()

    await tap(user, 'IV')
    expect(progressionStatsStore.read()['cadence:authentic']).toBeUndefined()

    await tap(user, 'V')
    expect(progressionStatsStore.read()['cadence:authentic'].attempts).toBe(1)
  })

  it('classifies root movement by how far the root travels', async () => {
    // I to IV is a fourth; IV to V is a step.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I', 'IV', 'V')

    const stats = progressionStatsStore.read()
    // I to IV is up a fourth; IV to V is up a whole step.
    expect(stats['root-movement:up-fourth'].correct).toBe(1)
    expect(stats['root-movement:up-whole-step'].correct).toBe(1)
  })

  it('records bass movement under its own namespace, not beside the root', async () => {
    // They are separate sections on the statistics screen because they are
    // separate skills — and they disagree exactly when an inversion has put
    // something other than the root underneath. One namespace with a prefix
    // in the value made that a list the reader had to sort by hand.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I', 'IV', 'V')

    const namespaces = Object.keys(progressionStatsStore.read()).map(
      (key) => key.split(':')[0],
    )
    expect(namespaces).toContain('root-movement')
    expect(namespaces).toContain('bass-movement')
    expect(namespaces).not.toContain('movement')
  })

  it('does not call a quality mistake a bass mistake', async () => {
    // IV and iv share a root. In root position the bass *is* that root, so
    // without a guard "answered a numeral rooted on the bass" fires for a
    // mistake that is about the chord's quality and nothing to do with the
    // bass at all.
    progressionSettingsStore.write({
      ...DEFAULT_PROGRESSION_SETTINGS,
      numerals: ['I', 'IV', 'V', 'iv'],
      inversions: [0],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'I', 'iv')

    expect(progressionStatsStore.read()['numeral:IV'].recent[0].answered).toBe(
      'iv',
    )
  })

  it('names a plain function confusion by the chord that was pressed', async () => {
    // Root position only, so the bass *is* the root and pressing V for I can
    // only mean the function was misjudged.
    progressionSettingsStore.write({
      ...DEFAULT_PROGRESSION_SETTINGS,
      inversions: [0],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')

    // On the opening chord, so the record is the opening's — which carries
    // confusions for exactly this reason: "you hear the opening I as V" is the
    // most useful thing the progression statistics can say.
    expect(progressionStatsStore.read()['opening:I']).toMatchObject({
      attempts: 1,
      correct: 0,
      recent: [{ correct: false, answered: 'V' }],
    })
  })

  /**
   * The other failure, which wears the same name and wants different practice.
   *
   * With inversions allowed the opening I is voiced in second inversion, so G
   * is in the bass — and V is rooted on G. Pressing V there is not a misjudged
   * function, it is hearing the bass and taking it for the root. Recording it
   * as "mistaken for V" would be true and would say nothing about which of the
   * two mistakes was made.
   */
  it('names hearing the bass as the root as its own kind of mistake', async () => {
    progressionSettingsStore.write({
      ...DEFAULT_PROGRESSION_SETTINGS,
      inversions: [0, 1, 2],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')

    const answered =
      progressionStatsStore.read()['opening:I'].recent[0].answered
    expect(answered).toBe('bass-as-root')
  })

  it('measures each position once, the first time it is reached', async () => {
    // A retry re-covering ground already measured adds nothing: the user has
    // been told those chords.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await tap(user, 'V')
    await untilRetryable()
    await tap(user, 'I', 'IV', 'V', 'I')

    // `movement:opening` can only come from position zero, so it is the clean
    // witness — `numeral:I` would be two records, since this progression uses
    // I at both ends.
    const opening = progressionStatsStore.read()['opening:I']
    expect(opening.attempts).toBe(1)
    expect(opening.correct).toBe(0)
  })

  it('still measures the chords past where the first attempt broke down', async () => {
    // The bias this replaces. Recording only the first run left the cadence
    // chords — always last — measured almost solely on progressions that had
    // already gone right, so `I`, `vi` and `V` read as mastery when they were
    // mostly selection.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    // Fail immediately, then get the whole thing on the retry.
    await tap(user, 'V')
    await untilRetryable()
    await tap(user, 'I', 'IV', 'V', 'I')

    const stats = progressionStatsStore.read()
    // The closing I is position 3, never reached on the first attempt.
    expect(stats['cadence:authentic']).toBeDefined()
    expect(stats['cadence:authentic'].attempts).toBeGreaterThan(0)
  })

  it('keeps counting across questions rather than starting over', async () => {
    // Really across questions, now that the opening is the only thing position
    // zero writes. This used to reach two inside a single progression, because
    // I IV V I has `I` at both ends and both wrote `numeral:I` — which proved
    // the store accumulates within a question and said nothing about the next
    // one starting from the last one's total.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await tap(user, 'I', 'IV', 'V', 'I')

    expect(progressionStatsStore.read()['opening:I'].attempts).toBe(1)

    // The completed progression auto-advances; the answer row emptying is the
    // new question being ready for a press.
    await waitFor(() => expect(answer()).toBe('····'), { timeout: 3000 })
    await tap(user, 'I')

    expect(progressionStatsStore.read()['opening:I'].attempts).toBe(2)
  })
})
