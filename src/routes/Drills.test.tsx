import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import Chords from './Chords'
import { piano } from '../audio'
import {
  chordDrillStatsStore,
  chordScoreStore,
  chordSettingsStore,
  chordStatsStore,
} from '../settings'
import * as exercises from '../exercises'
import { DRILLS, DRILL_LENGTH, drillById, drillChords } from '../exercises'

const DRILL = drillById('major-minor')!

function renderDrill(id = DRILL.id) {
  return render(
    <MemoryRouter initialEntries={[`/chords/drill/${id}`]}>
      <Routes>
        <Route path="/chords" element={<Chords />} />
        <Route path="/chords/drill/:drillId" element={<Chords />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start' }))
}

/** Press the chord the mocked question always asks for. */
async function answerCorrectly(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Major Triad' }))
}

beforeEach(() => {
  localStorage.clear()
  chordSettingsStore.reset()
  chordScoreStore.reset()
  chordStatsStore.reset()
  chordDrillStatsStore.reset()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  // A fixed question, so a test knows which button is the right one. Every
  // drill question is root position and block, which is what a drill pins.
  vi.spyOn(exercises, 'generateChordQuestion').mockReturnValue({
    notes: [60, 64, 67],
    chordId: 'major',
    inversion: 0,
    playMode: 'block',
    root: 60,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the pairs themselves', () => {
  it('names two chords that exist, and only two', () => {
    for (const drill of DRILLS) {
      expect(drill.chords, drill.id).toHaveLength(2)
      expect(() => drillChords(drill), drill.id).not.toThrow()
    }
  })

  it('never pairs a chord with itself', () => {
    for (const drill of DRILLS) {
      expect(drill.chords[0], drill.id).not.toBe(drill.chords[1])
    }
  })

  it('has a stable unique id for each', () => {
    const ids = DRILLS.map((drill) => drill.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('opens with major against minor, the one everything else builds on', () => {
    expect([...DRILLS].sort((a, b) => a.rank - b.rank)[0].id).toBe(
      'major-minor',
    )
  })
})

describe('running a drill', () => {
  it('shows a question rather than clearing it every render', async () => {
    // The settings a drill runs under are derived, so an unmemoised object was
    // a new object every render — and the effect that clears the round when
    // settings change fired every render with it. The screen sat on Start.
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    const [first] = drillChords(DRILL)
    expect(
      await screen.findByRole('button', { name: first.name }),
    ).toBeVisible()
  })

  it('offers only the two chords of the pair', async () => {
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    const [first, second] = drillChords(DRILL)
    expect(screen.getByRole('button', { name: first.name })).toBeVisible()
    expect(screen.getByRole('button', { name: second.name })).toBeVisible()
    // A chord that is enabled in the ordinary exercise but not in this pair.
    expect(
      screen.queryByRole('button', { name: 'Diminished Triad' }),
    ).toBeNull()
  })

  it('splits the grid between the two chords, wherever they sit in the table', async () => {
    // Major against Minor filled the screen only because those two happen to
    // share a row of the chord table. Add9 and Major 9th are five rows apart,
    // and honouring the table gave them opposite corners of a four-cell grid
    // with two holes in it — two small buttons for a screen showing two
    // answers.
    const user = userEvent.setup()
    renderDrill('add9-major-9th')
    await start(user)

    const grid = screen.getByRole('button', { name: 'Add9' }).parentElement
    expect(grid).not.toBeNull()

    // Two children, both of them buttons: one row, no placeholders.
    expect(grid!.children).toHaveLength(2)
    expect([...grid!.children].every((cell) => cell.tagName === 'BUTTON')).toBe(
      true,
    )
  })

  it('moves on from a wrong press instead of waiting for the right one', async () => {
    // The ordinary exercise leaves a missed question open, because working out
    // what it was is the exercise. A drill has two buttons, so pressing one
    // has already said which the other was — and pressing it to be allowed to
    // continue is a keystroke that teaches nothing and cannot change the score.
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    const playsBefore = vi.mocked(piano.play).mock.calls.length
    // The mocked question is always a Major Triad, so this is the wrong one.
    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))

    await waitFor(
      () => {
        const record = chordDrillStatsStore.read()[`drill:${DRILL.id}`]
        expect(record?.attempts).toBe(1)
        expect(record?.correct).toBe(0)
      },
      { timeout: 15_000 },
    )

    // The next question arrives on its own — the next chord sounding is what
    // says so, and nothing was pressed in between.
    await waitFor(
      () =>
        expect(vi.mocked(piano.play).mock.calls.length).toBeGreaterThan(
          playsBefore + 1,
        ),
      { timeout: 15_000 },
    )
  })

  it('does not let the other button be pressed after a miss', async () => {
    // The question is over, so the second press can only replay a sound. Left
    // scoreable it would be a free retry: press one, and if it goes red press
    // the other for a point.
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))
    await waitFor(
      () =>
        expect(
          chordDrillStatsStore.read()[`drill:${DRILL.id}`]?.attempts ?? 0,
        ).toBe(1),
      { timeout: 15_000 },
    )
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))

    const record = chordDrillStatsStore.read()[`drill:${DRILL.id}`]
    expect(record?.attempts).toBe(1)
    expect(record?.correct).toBe(0)
  })

  it('offers no Reveal, because two buttons already answer the question', async () => {
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    expect(screen.queryByRole('button', { name: 'Reveal' })).toBeNull()
  })

  it('records to the drill store and leaves the chord record alone', async () => {
    // Ten forced repetitions of two chords are not a sample of how the user
    // hears chords in general.
    const user = userEvent.setup()
    renderDrill()
    await start(user)
    await answerCorrectly(user)

    await waitFor(() =>
      expect(Object.keys(chordDrillStatsStore.read())).toContain(
        `drill:${DRILL.id}`,
      ),
    )
    expect(chordStatsStore.read()).toEqual({})
  })
})

/**
 * A drill keeps its own score, and the exercise's is left where it was.
 *
 * Ten forced repetitions of one pair are not a sample of how someone is doing
 * at chords — the same argument that keeps the statistics apart, applied to
 * the number the user is actually watching while they work.
 */
describe('the score at the top', () => {
  it('counts the drill, not the exercise total behind it', async () => {
    chordScoreStore.write({ correct: 40, total: 50 })
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    // Nothing answered yet, so the drill has nothing to show.
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')

    await user.click(screen.getByRole('button', { name: 'Major Triad' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Score')).toHaveTextContent('1/1'),
    )
  })

  it('leaves the exercise score exactly where it was', async () => {
    // The complaint that led here in its purest form: a chord total in the
    // hundreds does not visibly move over ten questions, so the drill read as
    // though it were not being scored at all — while still quietly moving it.
    chordScoreStore.write({ correct: 40, total: 50 })
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))
    await waitFor(() =>
      expect(
        chordDrillStatsStore.read()[`drill:${DRILL.id}`]?.attempts ?? 0,
      ).toBe(1),
    )

    expect(chordScoreStore.read()).toEqual({ correct: 40, total: 50 })
  })

  it('shows no percentage for a run of ten', async () => {
    // Over ten questions the score is already the summary a percentage would
    // be, and one question in it is either 0% or 100%.
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    expect(screen.queryByLabelText('Accuracy')).toBeNull()
  })

  it('still shows the percentage in the ordinary exercise', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/chords']}>
        <Routes>
          <Route path="/chords" element={<Chords />} />
        </Routes>
      </MemoryRouter>,
    )
    await start(user)

    expect(screen.getByLabelText('Accuracy')).toBeVisible()
  })
})

describe('the ordinary exercise is untouched', () => {
  it('still records to the chord store when no drill is running', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/chords']}>
        <Routes>
          <Route path="/chords" element={<Chords />} />
        </Routes>
      </MemoryRouter>,
    )
    await start(user)

    const grid = await screen.findAllByRole('button')
    const answerButton = grid.find((button) =>
      /Triad|7th|9th/.test(button.textContent ?? ''),
    )
    await user.click(answerButton!)

    await waitFor(() =>
      expect(Object.keys(chordStatsStore.read()).length).toBeGreaterThan(0),
    )
    expect(chordDrillStatsStore.read()).toEqual({})
  })
})

describe('finishing', () => {
  /**
   * Answer every question of a drill correctly, waiting for each to arrive.
   *
   * The next question arriving is the next chord being played — a solved
   * question ignores further presses until then, so pressing on a timer rather
   * than on that signal stalls the run at one answer.
   */
  async function playThrough(user: ReturnType<typeof userEvent.setup>) {
    for (let i = 0; i < DRILL_LENGTH; i++) {
      const playsBefore = vi.mocked(piano.play).mock.calls.length
      await user.click(screen.getByRole('button', { name: 'Major Triad' }))

      await waitFor(
        () =>
          expect(
            chordDrillStatsStore.read()[`drill:${DRILL.id}`]?.attempts ?? 0,
          ).toBe(i + 1),
        { timeout: 15_000 },
      )

      if (i < DRILL_LENGTH - 1) {
        await waitFor(
          () =>
            expect(vi.mocked(piano.play).mock.calls.length).toBeGreaterThan(
              playsBefore + 1,
            ),
          { timeout: 15_000 },
        )
      }
    }
  }

  /**
   * Done goes back to the list the drill was chosen from.
   *
   * Both halves in one test so the ten rounds are paid for once, the same
   * bargain the run below makes.
   */
  it('sends Done back to the Drills list, and only that once', async () => {
    const user = userEvent.setup()
    renderDrill()
    await start(user)
    await playThrough(user)

    await user.click(await screen.findByRole('button', { name: 'Done' }))

    // The Drills list itself, not the root menu it is nested under.
    expect(
      await screen.findByRole('dialog', { name: 'Drills' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Major Triad vs Minor Triad/ }),
    ).toBeVisible()
    // The drill is over rather than merely covered: closing this sheet lands
    // on the ordinary exercise.
    expect(screen.queryByRole('button', { name: 'Again' })).toBeNull()

    // Pushed onto the stack rather than swapped in for the root, so the sheet
    // offers Back where a root screen would offer Close — and Back goes up to
    // the menu, exactly as it does when the list is reached by tapping.
    //
    // The sheet renders the pushed screen *instead of* its children, so the
    // menu unmounts while the list is up and mounts again when Back pops it.
    // Anything that decides to open the list on mount therefore gets a second
    // go at it on the way back, and the list re-opened itself over the menu
    // for as long as the flag stayed set.
    const sheet = screen.getByRole('dialog', { name: 'Drills' })
    await user.click(within(sheet).getByRole('button', { name: 'Back' }))
    expect(
      await screen.findByRole('dialog', { name: 'Menu' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Drills' })).toBeNull()

    // And the shortcut is spent. The sheet drops its stack when it closes and
    // the flag has to go with it, or every later tap on the menu button would
    // jump into Drills for the rest of the session.
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // The sheet drops its stack a beat after it has finished closing, so a
    // reopen inside that beat would find the old one still there. That is the
    // sheet's own behaviour and not what this test is about.
    await new Promise((resolve) => setTimeout(resolve, 500))

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(
      await screen.findByRole('dialog', { name: 'Menu' }),
    ).toBeInTheDocument()
  }, 90_000)

  it('stops after the drill length, and starts over on Again', async () => {
    // The one slow test here, and deliberately real-time. A solved question
    // advances on a timer, so ten questions is ten timers — and fake timers
    // deadlock against `userEvent` on this screen, which is a worse thing to
    // work around than a few seconds.
    //
    // Both halves in one test so the ten rounds are paid for once.
    const user = userEvent.setup()
    renderDrill()
    await start(user)

    // Half right, so the score on the summary is a number that could be wrong
    // in either direction. Ten out of ten would pass just as well if the
    // screen were printing the question count twice.
    const rightOn = (i: number) => i % 2 === 1
    const expectedCorrect = Array.from(
      { length: DRILL_LENGTH },
      (_, i) => i,
    ).filter(rightOn).length

    for (let i = 0; i < DRILL_LENGTH; i++) {
      const playsBefore = vi.mocked(piano.play).mock.calls.length
      // The mocked question is always a Major Triad.
      await user.click(
        screen.getByRole('button', {
          name: rightOn(i) ? 'Major Triad' : 'Minor Triad',
        }),
      )

      // The advance timer clears a second per question, so the default
      // one-second wait is a coin flip.
      await waitFor(
        () =>
          expect(
            chordDrillStatsStore.read()[`drill:${DRILL.id}`]?.attempts ?? 0,
          ).toBe(i + 1),
        { timeout: 15_000 },
      )

      // An answered question ignores further presses until the next one
      // arrives, and the next one arriving is the next chord being played.
      // Pressing before that lands on a dead button and the loop stalls at one.
      if (i < DRILL_LENGTH - 1) {
        await waitFor(
          () =>
            expect(vi.mocked(piano.play).mock.calls.length).toBeGreaterThan(
              playsBefore + 1,
            ),
          { timeout: 15_000 },
        )
      }
    }

    expect(await screen.findByRole('button', { name: 'Again' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible()
    // Not an eleventh question after the tenth.
    expect(screen.queryByRole('button', { name: 'Minor Triad' })).toBeNull()

    // The result, stated rather than left to the header.
    expect(screen.getByLabelText('Drill score')).toHaveTextContent(
      `${expectedCorrect}/${DRILL_LENGTH}`,
    )
    // And no eleventh *chord* either. The advance timer from the last answer
    // used to fire regardless, building a question nobody would ever see and
    // sounding it over the summary — an unexplained chord at the end of every
    // drill.
    vi.mocked(piano.play).mockClear()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(piano.play).not.toHaveBeenCalled()

    vi.mocked(piano.play).mockClear()
    await user.click(screen.getByRole('button', { name: 'Again' }))
    expect(
      await screen.findByRole('button', { name: 'Minor Triad' }),
    ).toBeVisible()
    // A second run starts from nothing rather than carrying the first one's
    // score into it.
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')

    // Again starts the next run, so it sounds the first question — once.
    // Exactly once is the claim worth pinning: a cancelled advance that was
    // merely postponed rather than dropped would arrive here as a second
    // chord on top of it, which is what an extra chord on Again would mean.
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(piano.play).toHaveBeenCalledTimes(1)
  }, 90_000)
})
