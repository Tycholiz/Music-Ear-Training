import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

    for (let i = 0; i < DRILL_LENGTH; i++) {
      const playsBefore = vi.mocked(piano.play).mock.calls.length
      await user.click(screen.getByRole('button', { name: 'Major Triad' }))

      // The advance timer clears a second per question, so the default
      // one-second wait is a coin flip.
      await waitFor(
        () =>
          expect(
            chordDrillStatsStore.read()[`drill:${DRILL.id}`]?.attempts ?? 0,
          ).toBe(i + 1),
        { timeout: 15_000 },
      )

      // A solved question ignores further presses until the next one arrives,
      // and the next one arriving is the next chord being played. Pressing
      // before that lands on a dead button and the loop stalls at one.
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

    await user.click(screen.getByRole('button', { name: 'Again' }))
    expect(
      await screen.findByRole('button', { name: 'Minor Triad' }),
    ).toBeVisible()
  }, 90_000)
})
