import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import ChordRoot from './ChordRoot'
import * as audio from '../audio'
import { piano } from '../audio'
import { microphone } from '../pitch'
import {
  rootInputModeStore,
  rootScoreStore,
  rootSettingsStore,
} from '../settings'
import * as exercises from '../exercises'
import type { RootQuestion } from '../exercises'

/** C major, first inversion: E G C. Root is C, and it is not the bass note. */
const INVERTED: RootQuestion = {
  notes: [64, 67, 72],
  chordId: 'major',
  inversion: 1,
  playMode: 'block',
  root: 60,
}

/** Whatever the screen most recently subscribed to the microphone with. */
let emitPitch: ((midi: number) => void) | null = null

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

/** Wait out the chord so the microphone is trusted again. */
async function untilListening() {
  await waitFor(
    () => expect(screen.getByRole('status')).toHaveAccessibleName('Listening'),
    { timeout: 3000 },
  )
}

/** Hum a note into the screen's pitch subscription. */
async function hum(midi: number) {
  await act(async () => {
    emitPitch?.(midi)
  })
}

beforeEach(() => {
  localStorage.clear()
  rootSettingsStore.reset()
  rootScoreStore.reset()
  rootInputModeStore.reset()
  rootInputModeStore.write('microphone')

  emitPitch = null
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
  // Chords take well over a second to ring out, and the screen waits for that
  // before trusting the microphone. Collapse it so a test that retries several
  // times is not dominated by silence.
  vi.spyOn(audio, 'scheduleDurationMs').mockReturnValue(0)
  vi.spyOn(microphone, 'start').mockResolvedValue(undefined)
  vi.spyOn(microphone, 'stop').mockImplementation(() => {})
  vi.spyOn(microphone, 'onPitch').mockImplementation((listener) => {
    emitPitch = listener
    return () => {
      if (emitPitch === listener) emitPitch = null
    }
  })
  vi.spyOn(exercises, 'generateRootQuestion').mockReturnValue(INVERTED)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('opening the microphone', () => {
  it('opens it from the Start tap, where the permission prompt is allowed', async () => {
    const user = userEvent.setup()
    renderExercise()
    expect(microphone.start).not.toHaveBeenCalled()

    await start(user)
    expect(microphone.start).toHaveBeenCalledOnce()
  })

  it('leaves it shut in Reveal mode', async () => {
    rootInputModeStore.write('reveal')
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    expect(microphone.start).not.toHaveBeenCalled()
  })

  it('releases it when the exercise is left', async () => {
    const user = userEvent.setup()
    const { unmount } = renderExercise()
    await start(user)
    unmount()

    expect(microphone.stop).toHaveBeenCalled()
  })
})

describe('not listening to itself', () => {
  it('ignores anything heard while the chord is still sounding', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    // The microphone hears the piano, including the answer. It must not count.
    expect(screen.getByRole('status')).toHaveAccessibleName('Playing')
    await hum(72)

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
    expect(screen.getByRole('status')).not.toHaveAccessibleName('Correct')
  })

  it('starts listening once the chord has finished', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)

    await untilListening()
  })
})

describe('humming the right note', () => {
  it('accepts it and scores the question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await hum(72)

    expect(screen.getByRole('status')).toHaveAccessibleName('Correct')
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('accepts the root in any octave', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    // C2 rather than the C5 in the chord: a bass cannot hum C5.
    await hum(36)

    expect(screen.getByRole('status')).toHaveAccessibleName('Correct')
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1')
  })

  it('rejects the bass note of an inverted chord', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    // E is the lowest note sounding, but the chord is a C.
    await hum(64)

    expect(screen.getByRole('status')).toHaveAccessibleName('Not the root')
  })

  it('moves on to the next question', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()
    await hum(72)
    vi.mocked(piano.play).mockClear()

    await waitFor(
      () => expect(piano.play).toHaveBeenCalledWith([[64, 67, 72]]),
      { timeout: 3000 },
    )
  })
})

describe('humming the wrong note', () => {
  it('shows a cross and keeps the question open', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await hum(65)

    expect(screen.getByRole('status')).toHaveAccessibleName('Not the root')
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('plays the chord again so the next attempt has something to work from', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()
    await hum(65)
    vi.mocked(piano.play).mockClear()

    await waitFor(
      () => expect(piano.play).toHaveBeenCalledWith([[64, 67, 72]]),
      { timeout: 3000 },
    )
  })

  it('lets the user try again, and takes the right answer', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await hum(65)
    await untilListening()
    await hum(72)

    expect(screen.getByRole('status')).toHaveAccessibleName('Correct')
  })

  it('charges only the first attempt, however many it takes', async () => {
    // Humming is imprecise; a singer who knows the answer may still fumble
    // several times reaching it.
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await hum(65)
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    await untilListening()
    await hum(66)
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')

    await untilListening()
    await hum(72)
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('does not credit a correct answer that follows a miss', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await hum(65)
    await untilListening()
    await hum(72)

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('0%')
  })
})

describe('revealing instead', () => {
  it('is still available, and plays the root', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()
    vi.mocked(piano.play).mockClear()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(piano.play).toHaveBeenCalledWith([[72]])
  })

  it('counts as a miss, since they did not identify it themselves', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })

  it('does not charge twice when the user then hums it', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    await hum(72)

    expect(screen.getByLabelText('Score')).toHaveTextContent('0/1')
  })
})

describe('switching modes', () => {
  it('shows the grading buttons in Reveal mode and not in Microphone mode', async () => {
    const user = userEvent.setup()
    renderExercise()
    await start(user)
    await untilListening()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    // Microphone mode grades itself; there is nothing to self-report.
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull()
  })
})
