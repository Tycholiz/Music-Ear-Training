import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import Chords from './Chords'
import { buildChordCells } from '../exercises'
import { piano } from '../audio'
import {
  DEFAULT_CHORD_SETTINGS,
  chordScoreStore,
  chordSettingsStore,
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

describe('answering', () => {
  it('turns a wrong answer red and locks it', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    const wrong = screen.getByRole('button', { name: 'Minor Triad' })
    await user.click(wrong)

    expect(wrong).toHaveClass('bg-incorrect')
    expect(wrong).toBeDisabled()
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
    expect(screen.getByRole('button', { name: 'Minor Triad' })).toBeDisabled()
    vi.mocked(piano.play).mockClear()

    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: 'Minor Triad' }),
        ).toBeEnabled(),
      { timeout: 3000 },
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
