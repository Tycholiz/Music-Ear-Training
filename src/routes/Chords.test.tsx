import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import Chords from './Chords'
import { DRILLS, buildChordCells, buildDrillCells } from '../exercises'
import { ANSWER_COLUMNS } from '../components'
import { piano } from '../audio'
import {
  DEFAULT_CHORD_SETTINGS,
  chordScoreStore,
  chordSettingsStore,
  chordStatsStore,
} from '../settings'
import * as exercises from '../exercises'
import type { ChordQuestion } from '../exercises'

/** C6 in root position: C E G A, which Am7 also matches. */
const C6: ChordQuestion = {
  notes: [60, 64, 67, 69],
  chordId: 'major-6th',
  inversion: 0,
  playMode: 'block',
  root: 60,
}

/** A plain C major triad, which nothing else in the table matches. */
const C_MAJOR: ChordQuestion = {
  notes: [60, 64, 67],
  chordId: 'major',
  inversion: 0,
  playMode: 'block',
  root: 60,
}

function renderExercise() {
  return render(
    <MemoryRouter>
      <Chords />
    </MemoryRouter>,
  )
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start' }))
}

beforeEach(() => {
  localStorage.clear()
  chordSettingsStore.reset()
  chordScoreStore.reset()
  chordStatsStore.reset()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  vi.spyOn(exercises, 'generateChordQuestion').mockReturnValue(C_MAJOR)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('starting', () => {
  it('waits for a tap before playing', () => {
    renderExercise()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
    expect(piano.play).not.toHaveBeenCalled()
  })

  it('sounds a block chord all at once', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.play).toHaveBeenCalledOnce())
    expect(piano.play).toHaveBeenCalledWith([[60, 64, 67]])
  })

  it('sounds an arpeggio one note at a time', async () => {
    vi.mocked(exercises.generateChordQuestion).mockReturnValue({
      ...C_MAJOR,
      playMode: 'arpeggiated',
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() =>
      expect(piano.play).toHaveBeenCalledWith([[60], [64], [67]]),
    )
  })

  it('explains itself when nothing can be generated', () => {
    chordSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major'],
      inversions: [3],
    })
    renderExercise()

    expect(screen.getByText(/No chord can be played/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })
})

/**
 * Nothing sounds while the user is somewhere else.
 *
 * An answered question schedules the next one on a timer, and a new question
 * plays itself. Those two together mean the exercise can sound a chord from
 * behind whatever the user has opened over it — which is what "a chord just
 * randomly played while I was in Customize" turned out to be.
 */
describe('the menu holds the exercise still', () => {
  const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Menu' }))

  it('does not play the next question behind an open menu', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    // Answer, then open the menu inside the window before the next question
    // is due. This is a narrow window — a second or so — which is why it read
    // as random rather than as something the user was doing.
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))
    await openMenu(user)
    vi.mocked(piano.play).mockClear()

    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(piano.play).not.toHaveBeenCalled()
  }, 20_000)

  it('carries on where it left off once the menu closes', async () => {
    // The question was answered and locked, so leaving it there would strand
    // the user on a grid that does nothing. Cancelling the advance means
    // taking it up again on the way out.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Major Triad' }))
    await openMenu(user)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(piano.play).toHaveBeenCalled())
    // A fresh question, not the answered one still sitting there.
    expect(screen.getByRole('button', { name: 'Major Triad' })).not.toHaveClass(
      'bg-correct',
    )
  }, 20_000)

  it('stops a chord that is still sounding when the menu opens', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await openMenu(user)

    expect(piano.stop).toHaveBeenCalled()
  })
})

describe('answering', () => {
  it('turns a wrong answer red but keeps it pressable for replay', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const wrong = screen.getByRole('button', { name: 'Minor Triad' })
    await user.click(wrong)

    expect(wrong).toHaveClass('bg-incorrect')
    expect(wrong).toBeEnabled()
  })

  it('sounds the guessed chord on the target root, so it can be compared', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))

    // C minor, not C major: same root, same register, only the quality
    // differs — which is the whole point of playing it back.
    expect(piano.play).toHaveBeenCalledWith([[60, 63, 67]])
  })

  it('replays a wrong guess without scoring it twice', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const wrong = screen.getByRole('button', { name: 'Minor Triad' })
    await user.click(wrong)
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    vi.mocked(piano.play).mockClear()
    await user.click(wrong)

    expect(piano.play).toHaveBeenCalledWith([[60, 63, 67]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('sounds the correct chord when the right answer is chosen', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Major Triad' }))
    expect(piano.play).toHaveBeenCalledWith([[60, 64, 67]])
  })

  it('sounds nothing on a guess when the question is arpeggiated', async () => {
    vi.mocked(exercises.generateChordQuestion).mockReturnValue({
      ...C_MAJOR,
      playMode: 'arpeggiated',
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))
    expect(piano.play).not.toHaveBeenCalled()

    // Still scored, still turns red — only the playback is suppressed.
    expect(screen.getByRole('button', { name: 'Minor Triad' })).toHaveClass(
      'bg-incorrect',
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('turns the right answer green', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Major Triad' }))
    expect(screen.getByRole('button', { name: 'Major Triad' })).toHaveClass(
      'bg-correct',
    )
  })

  it('rejects a chord that only collides by pitch with the one generated', async () => {
    // C6 and Am7 first inversion are the same four notes, but the root
    // reference tone (see the playback test below) tells them apart — so
    // guessing the colliding chord is a genuine miss, not an accepted answer.
    vi.mocked(exercises.generateChordQuestion).mockReturnValue(C6)
    chordSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major-6th', 'minor-7th', 'major'],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor 7th' }))
    expect(screen.getByRole('button', { name: 'Minor 7th' })).toHaveClass(
      'bg-incorrect',
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('accepts only the exact chord that was generated, once the collision is resolved', async () => {
    vi.mocked(exercises.generateChordQuestion).mockReturnValue(C6)
    chordSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major-6th', 'minor-7th', 'major'],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Major 6th' }))
    expect(screen.getByRole('button', { name: 'Major 6th' })).toHaveClass(
      'bg-correct',
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('plays the root alone first when the chord is ambiguous among enabled answers', async () => {
    vi.mocked(exercises.generateChordQuestion).mockReturnValue(C6)
    chordSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major-6th', 'minor-7th', 'major'],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() =>
      expect(piano.play).toHaveBeenCalledWith([[60], [60, 64, 67, 69]]),
    )
  })

  it('plays no reference tone when the chord is unambiguous', async () => {
    // Default chord set: a plain C major triad matches nothing else.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await waitFor(() => expect(piano.play).toHaveBeenCalledOnce())
    expect(piano.play).toHaveBeenCalledWith([[60, 64, 67]])
  })

  it('leaves the actual chord untouched when a colliding guess is wrong', async () => {
    vi.mocked(exercises.generateChordQuestion).mockReturnValue(C6)
    chordSettingsStore.write({
      ...DEFAULT_CHORD_SETTINGS,
      chords: ['major-6th', 'minor-7th', 'major'],
    })
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor 7th' }))
    expect(screen.getByRole('button', { name: 'Major 6th' })).not.toHaveClass(
      'bg-correct',
    )
    expect(screen.getByRole('button', { name: 'Major 6th' })).toBeEnabled()
  })

  it('replays without changing the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(piano.play).toHaveBeenCalledWith([[60, 64, 67]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })
})

describe('scoring', () => {
  it('counts every guess: two misses then a hit is 1/3', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))
    await user.click(screen.getByRole('button', { name: 'Diminished Triad' }))
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/3')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('33%')
  })

  it('keeps its score separate from the interval exercise', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))

    expect(chordScoreStore.read()).toEqual({ correct: 1, total: 1 })
    expect(localStorage.getItem('met.score.intervals')).toBeNull()
  })
})

describe('advancing', () => {
  it('plays a new question after a pause, with the buttons reset', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))
    expect(screen.getByRole('button', { name: 'Minor Triad' })).toHaveClass(
      'bg-incorrect',
    )
    vi.mocked(piano.play).mockClear()

    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Minor Triad' })).toHaveClass(
          'bg-surface',
        ),
      { timeout: 4000 },
    )
    expect(piano.play).toHaveBeenCalledOnce()
  })
})

describe('menu', () => {
  it('resets the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Reset Score' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Score')).toHaveTextContent('0/0'),
    )
  })
})

describe('buildChordCells', () => {
  it('blanks disabled chords while holding their position', () => {
    const cells = buildChordCells(['major', 'diminished'], [], null)
    expect(cells[0]).toMatchObject({ label: 'Major Triad' })
    expect(cells[1]).toBeNull() // Minor Triad, switched off
    expect(cells[2]).toMatchObject({ label: 'Diminished Triad' })
  })

  it('trims trailing blank rows', () => {
    expect(buildChordCells(['major', 'minor'], [], null)).toHaveLength(2)
  })

  it('keeps the grid rectangular', () => {
    for (const enabled of [['major'], ['major', 'minor', 'sus2']]) {
      expect(buildChordCells(enabled, [], null).length % 2).toBe(0)
    }
  })

  it('drops blank rows in the middle, not only the trailing ones', () => {
    // The complaint that led here: three ninth chords out of thirty-five gave
    // three buttons too small to hit, staggered down fourteen empty rows.
    const cells = buildChordCells(
      ['major-9th', 'major-7th-sharp-11', 'major-13th'],
      [],
      null,
    )

    expect(cells).toHaveLength(6)
    expect(cells.filter((cell) => cell !== null)).toHaveLength(3)
  })

  it('keeps every button in the column it was in', () => {
    // Left versus right is the half of a button's position a user actually
    // memorises, and rows are dropped whole so nothing slides sideways. All
    // three of these are right-hand buttons in the chord table and all three
    // stay there, empty left-hand cells and all.
    const cells = buildChordCells(
      ['major-9th', 'major-7th-sharp-11', 'major-13th'],
      [],
      null,
    )

    expect(cells.map((cell) => cell?.label ?? null)).toEqual([
      null,
      'Major 9th',
      null,
      'Major 7♯11',
      null,
      'Major 13th',
    ])
  })

  it('holds a switched-off chord that shares a row with an enabled one', () => {
    // The gaps that earn their place. Major Triad and Minor Triad are one row,
    // so switching Minor off leaves a hole rather than promoting Diminished
    // into the place the user's thumb expects Minor.
    const cells = buildChordCells(['major', 'diminished'], [], null)

    expect(cells[0]).toMatchObject({ label: 'Major Triad' })
    expect(cells[1]).toBeNull()
    expect(cells[2]).toMatchObject({ label: 'Diminished Triad' })
  })

  it('marks wrong guesses and the solved answer', () => {
    const cells = buildChordCells(
      ['major', 'minor', 'diminished'],
      ['minor'],
      'major',
    )
    const byLabel = new Map(
      cells.filter((c) => c !== null).map((c) => [c.label, c.state]),
    )
    expect(byLabel.get('Minor Triad')).toBe('wrong')
    expect(byLabel.get('Major Triad')).toBe('correct')
    expect(byLabel.get('Diminished Triad')).toBe('idle')
  })
})

/**
 * A drill is two chords, so it gets two buttons and the whole screen.
 *
 * The reserved positions exist so a chord keeps its place among the other
 * thirty-four. A drill has no other thirty-four, and honouring the table there
 * meant the layout depended on where the pair happened to land in a list the
 * user cannot see — Major versus Minor filled the screen because those two sit
 * in one row of it, and Add9 versus Major 9th got opposite corners of a
 * four-cell grid with two holes in it.
 */
describe('buildDrillCells', () => {
  const drill = (id: string) => {
    const found = DRILLS.find((d) => d.id === id)
    if (!found) throw new Error(`no drill ${id}`)
    return found
  }

  it('gives a pair from opposite ends of the table one full row', () => {
    // Add9 and Major 9th are five rows apart in the chord table.
    const cells = buildDrillCells(drill('add9-major-9th'), [], null)

    expect(cells).toEqual([
      { id: 'add9', label: 'Add9', state: 'idle' },
      { id: 'major-9th', label: 'Major 9th', state: 'idle' },
    ])
  })

  it('gives every drill exactly one row, with no holes in it', () => {
    // The property, rather than a case: whichever two chords a drill names,
    // they are the whole grid.
    for (const each of DRILLS) {
      const cells = buildDrillCells(each, [], null)
      expect(cells, each.id).toHaveLength(ANSWER_COLUMNS)
      expect(cells.includes(null), each.id).toBe(false)
    }
  })

  it('puts the chords in table order, not in the order the pair is written', () => {
    // Which chord is on the left should be a fact about the two chords rather
    // than a detail of how the drill list happens to be typed — and in table
    // order it agrees with the main grid for every pair sharing a row there.
    const written = drill('major-minor')
    const cells = buildDrillCells(
      { ...written, chords: ['minor', 'major'] },
      [],
      null,
    )

    expect(cells.map((cell) => cell?.label)).toEqual([
      'Major Triad',
      'Minor Triad',
    ])
  })

  it('marks wrong guesses and the solved answer like any other grid', () => {
    const cells = buildDrillCells(drill('major-minor'), ['minor'], 'major')

    expect(cells[0]).toMatchObject({ label: 'Major Triad', state: 'correct' })
    expect(cells[1]).toMatchObject({ label: 'Minor Triad', state: 'wrong' })
  })

  it('marks a revealed answer as given rather than as got right', () => {
    const cells = buildDrillCells(drill('major-minor'), [], null, 'minor')

    expect(cells[1]).toMatchObject({ state: 'revealed' })
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

    const correct = screen.getByRole('button', { name: 'Major Triad' })
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

    expect(piano.play).toHaveBeenCalledExactlyOnceWith([[60, 64, 67]])
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
  })
})

describe('revealing the answer', () => {
  const reveal = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Reveal' }))

  it('is offered from the start, not only after a wrong guess', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeEnabled()
  })

  it('names the chord and sounds it', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    vi.mocked(piano.play).mockClear()

    await reveal(user)

    expect(piano.play).toHaveBeenCalledWith([[60, 64, 67]])
  })

  it('marks the answer as given rather than found', async () => {
    // Green would tell the user they got something they asked to be handed.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await reveal(user)

    // `active:bg-surface-raised` is in the idle style too, so match the
    // standalone class rather than the substring.
    const answer = screen.getByRole('button', { name: 'Major Triad' })
    expect(answer).toHaveClass('bg-surface-raised')
    expect(answer).not.toHaveClass('bg-correct')
  })

  /**
   * This exercise scores every press — three wrong guesses then a hit is 1/4 —
   * so a reveal is one more attempt that failed, not one per chord left. The
   * ambiguity is real in an exercise where a single question can already be
   * 0/3, so it is pinned down here rather than left to the reader.
   */
  it('charges one miss, whatever has already been guessed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await reveal(user)

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('charges one more miss on top of the guesses already made', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Minor Triad' }))
    await user.click(screen.getByRole('button', { name: 'Diminished Triad' }))
    await reveal(user)

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/3')
  })

  it('cannot be charged twice for one question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await reveal(user)
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled()
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('stops the grid scoring once the answer has been given', async () => {
    // Pressing the chord it just named must not turn a lost question into a
    // won one.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await reveal(user)
    await user.click(screen.getByRole('button', { name: 'Major Triad' }))

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('is not offered once the question has been solved', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Major Triad' }))

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled()
  })

  it('moves on to a new question by itself', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await reveal(user)
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled()

    // Live again, which only a fresh question makes it.
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Reveal' })).toBeEnabled(),
      { timeout: 4000 },
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })
})

describe('what goes into the statistics', () => {
  const press = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) => user.click(screen.getByRole('button', { name }))

  it('records the chord, the inversion and the play mode', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Major Triad')

    const stats = chordStatsStore.read()
    expect(stats['chord:major']).toMatchObject({ attempts: 1, correct: 1 })
    expect(stats['inversion:0']).toMatchObject({ attempts: 1, correct: 1 })
    expect(stats['mode:block']).toMatchObject({ attempts: 1, correct: 1 })
  })

  it('records what was pressed instead, so a confusion can be named', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Minor Triad')

    expect(chordStatsStore.read()['chord:major']).toMatchObject({
      attempts: 1,
      correct: 0,
      recent: [{ correct: false, answered: 'minor' }],
    })
  })

  it('records a reveal as a miss, so giving up is not invisible', async () => {
    // Where the Reveal button and the statistics meet. Without this, a chord
    // the user reveals every single time records nothing at all and reads as
    // untouched rather than as the hardest thing on the screen.
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(chordStatsStore.read()['chord:major']).toMatchObject({
      attempts: 1,
      correct: 0,
    })
    // They did not confuse it with anything — they had nothing.
    expect(chordStatsStore.read()['chord:major']).not.toHaveProperty(
      'confusions',
    )
  })

  it('does not count a reveal twice when the grid was already pressed', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Minor Triad')
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(chordStatsStore.read()['chord:major'].attempts).toBe(1)
  })

  it('takes the first press only, unlike the score', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await press(user, 'Minor Triad')
    await press(user, 'Major Triad')

    expect(screen.getByLabelText('Score')).toHaveTextContent('1/2')
    expect(chordStatsStore.read()['chord:major']).toMatchObject({
      attempts: 1,
      correct: 0,
    })
  })
})
