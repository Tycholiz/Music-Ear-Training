import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTE_GAIN, Piano } from './piano'
import { SAMPLED_NOTES, nearestSample, playbackRate } from './samples'
import {
  buildMelodySchedule,
  buildSchedule,
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
} from './schedule'
import type { Timing } from './schedule'

/**
 * jsdom has no Web Audio, so the engine is exercised against a fake context
 * that records what was scheduled.
 */

interface FakeSource {
  buffer: unknown
  playbackRate: { value: number }
  onended: (() => void) | null
  startedAt: number | null
  stoppedAt: number | null
  connected: boolean
}

interface FakeGain {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
    cancelScheduledValues: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
}

/** Includes `interrupted`, which WebKit has and the specification does not. */
type FakeState = 'suspended' | 'running' | 'interrupted' | 'closed'

class FakeAudioContext {
  state: FakeState = 'suspended'
  currentTime = 0
  destination = { id: 'destination' }

  resumeCount = 0
  closeCount = 0
  decodeCount = 0
  sources: FakeSource[] = []
  gains: FakeGain[] = []

  /** Set to leave the context stuck, the way iOS sometimes does. */
  unrevivable = false
  /** Set to have resume reject rather than quietly fail. */
  resumeThrows = false

  async resume() {
    this.resumeCount++
    if (this.resumeThrows) throw new Error('cannot resume')
    if (!this.unrevivable) this.state = 'running'
  }

  async close() {
    this.closeCount++
    this.state = 'closed'
  }

  async decodeAudioData(_data: ArrayBuffer) {
    this.decodeCount++
    return { duration: 1 } as unknown as AudioBuffer
  }

  createBufferSource() {
    const source: FakeSource = {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      startedAt: null,
      stoppedAt: null,
      connected: false,
    } as FakeSource
    Object.assign(source, {
      connect: () => {
        source.connected = true
      },
      start: (when: number) => {
        source.startedAt = when
      },
      stop: (when: number) => {
        source.stoppedAt = when
      },
    })
    this.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  createGain() {
    const gain: FakeGain = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
    }
    this.gains.push(gain)
    return gain as unknown as GainNode
  }
}

const timing: Timing = { onsetMs: 100, releaseMs: 200, chordReleaseMs: 300 }

function setup(options: { failFetch?: boolean } = {}) {
  // Every context the engine has been handed, oldest first. The engine builds
  // a new one when it cannot revive the old, so this is how a replacement is
  // observed.
  const contexts = [new FakeAudioContext()]
  const ctx = contexts[0]
  let handedOut = 0
  const fetchImpl = vi.fn(async () => {
    if (options.failFetch) {
      return {
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response
    }
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response
  })

  const piano = new Piano({
    audioContextFactory: () => {
      handedOut += 1
      if (handedOut > 1) contexts.push(new FakeAudioContext())
      return contexts[contexts.length - 1] as unknown as AudioContext
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    timing,
  })

  return { piano, ctx, contexts, fetchImpl }
}

describe('loading', () => {
  it('starts idle', () => {
    const { piano } = setup()
    expect(piano.getStatus()).toBe('idle')
  })

  it('fetches and decodes one sample per sampled note, then reports ready', async () => {
    const { piano, ctx, fetchImpl } = setup()
    await piano.load()

    expect(fetchImpl).toHaveBeenCalledTimes(SAMPLED_NOTES.length)
    expect(ctx.decodeCount).toBe(SAMPLED_NOTES.length)
    expect(piano.getStatus()).toBe('ready')
  })

  it('only loads once no matter how often it is asked', async () => {
    const { piano, fetchImpl } = setup()
    await Promise.all([piano.load(), piano.load()])
    await piano.load()

    expect(fetchImpl).toHaveBeenCalledTimes(SAMPLED_NOTES.length)
  })

  it('reports an error and allows a retry when a sample fails', async () => {
    const { piano } = setup({ failFetch: true })

    await expect(piano.load()).rejects.toThrow(/Failed to load piano sample/)
    expect(piano.getStatus()).toBe('error')

    // Not latched: a second attempt tries again rather than resolving stale.
    await expect(piano.load()).rejects.toThrow()
  })

  it('notifies subscribers on status changes and stops after unsubscribe', async () => {
    const { piano } = setup()
    const listener = vi.fn()
    const unsubscribe = piano.subscribe(listener)

    await piano.load()
    expect(listener).toHaveBeenCalled()

    listener.mockClear()
    unsubscribe()
    piano.subscribe(vi.fn())
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('unlock', () => {
  it('resumes a suspended context', async () => {
    const { piano, ctx } = setup()
    await piano.unlock()

    expect(ctx.resumeCount).toBe(1)
    expect(ctx.state).toBe('running')
  })

  it('does not resume again once running', async () => {
    const { piano, ctx } = setup()
    await piano.unlock()
    await piano.unlock()

    expect(ctx.resumeCount).toBe(1)
  })

  it('claims a playback audio session, so the ringer switch cannot mute us', async () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', {
      value: session,
      configurable: true,
    })

    const { piano } = setup()
    await piano.unlock()
    expect(session.type).toBe('playback')

    delete (navigator as unknown as Record<string, unknown>).audioSession
  })
})

describe('coming back from an interruption', () => {
  it('resumes a context iOS interrupted while the app was away', async () => {
    // The bug: leaving the app for a few minutes silences it until it is
    // killed and relaunched. WebKit parks the context in `interrupted`, which
    // is not `suspended` and not in the specification, so the resume that
    // would have fixed it was never attempted.
    const { piano, ctx } = setup()
    await piano.unlock()
    ctx.state = 'interrupted'

    await piano.unlock()
    expect(ctx.state).toBe('running')
  })

  it('still resumes a plain suspended context', async () => {
    const { piano, ctx } = setup()
    expect(ctx.state).toBe('suspended')

    await piano.unlock()
    expect(ctx.state).toBe('running')
    expect(ctx.resumeCount).toBe(1)
  })

  it('does not resume one that is already running', async () => {
    const { piano, ctx } = setup()
    await piano.unlock()
    await piano.unlock()

    expect(ctx.resumeCount).toBe(1)
  })

  it('plays again after an interruption, rather than scheduling into silence', async () => {
    const { piano, ctx } = setup()
    await piano.load()
    await piano.play(simultaneous([60]))
    ctx.sources = []

    ctx.state = 'interrupted'
    await piano.play(simultaneous([60]))

    expect(ctx.state).toBe('running')
    expect(ctx.sources).toHaveLength(1)
  })

  it('replaces a context that will not come back', async () => {
    const { piano, ctx, contexts } = setup()
    await piano.unlock()

    ctx.state = 'interrupted'
    ctx.unrevivable = true
    await piano.unlock()

    expect(contexts).toHaveLength(2)
    expect(contexts[1].state).toBe('running')
    expect(ctx.closeCount).toBe(1)
  })

  it('replaces one whose resume rejects outright', async () => {
    const { piano, ctx, contexts } = setup()
    await piano.unlock()

    ctx.state = 'interrupted'
    ctx.resumeThrows = true
    await expect(piano.unlock()).resolves.toBeUndefined()

    expect(contexts).toHaveLength(2)
    expect(contexts[1].state).toBe('running')
  })

  it('replaces a closed context without trying to resume it', async () => {
    const { piano, ctx, contexts } = setup()
    await piano.unlock()

    ctx.state = 'closed'
    const before = ctx.resumeCount
    await piano.unlock()

    expect(ctx.resumeCount).toBe(before)
    expect(contexts).toHaveLength(2)
    expect(contexts[1].state).toBe('running')
  })

  it('plays through the replacement, using the samples already decoded', async () => {
    const { piano, ctx, contexts, fetchImpl } = setup()
    await piano.load()
    await piano.play(simultaneous([60]))
    vi.mocked(fetchImpl).mockClear()

    ctx.state = 'interrupted'
    ctx.unrevivable = true
    await piano.play(simultaneous([60, 64]))

    // An AudioBuffer belongs to no context in particular, so nothing is
    // re-fetched to play it on the new one.
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(contexts[1].sources).toHaveLength(2)
  })

  it('drops the voices of a context it replaced', async () => {
    // They belong to the dead context and will never sound; stopping them
    // later would be reaching into a corpse.
    const { piano, ctx, contexts } = setup()
    await piano.load()
    await piano.play(simultaneous([60, 64, 67]))
    const scheduled = ctx.sources.map((source) => source.stoppedAt)

    ctx.state = 'interrupted'
    ctx.unrevivable = true
    await piano.unlock()

    contexts[1].currentTime = 0.5
    expect(() => piano.stop()).not.toThrow()
    // Untouched since the context died: stop found nothing to reach into.
    expect(ctx.sources.map((source) => source.stoppedAt)).toEqual(scheduled)
  })

  it('claims the audio session again on the way back', async () => {
    // The session is what keeps the ringer switch from silencing us, and an
    // interruption is exactly the moment it may have been taken away.
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', {
      value: session,
      configurable: true,
    })

    const { piano, ctx } = setup()
    await piano.unlock()
    session.type = 'auto'
    ctx.state = 'interrupted'

    await piano.unlock()
    expect(session.type).toBe('playback')

    delete (navigator as unknown as Record<string, unknown>).audioSession
  })
})

describe('play', () => {
  let harness: ReturnType<typeof setup>

  beforeEach(async () => {
    harness = setup()
    await harness.piano.load()
  })

  it('unlocks the context before scheduling anything', async () => {
    await harness.piano.play(sequence([60, 64]))
    expect(harness.ctx.state).toBe('running')
  })

  it('creates one voice per note', async () => {
    await harness.piano.play(simultaneous([60, 64, 67]))
    expect(harness.ctx.sources).toHaveLength(3)
  })

  it('starts a harmonic group together and a sequence apart', async () => {
    await harness.piano.play(simultaneous([60, 64]))
    expect(harness.ctx.sources.map((s) => s.startedAt)).toEqual([0, 0])

    harness.ctx.sources = []
    await harness.piano.play(sequence([60, 64]))
    expect(harness.ctx.sources.map((s) => s.startedAt)).toEqual([0, 0.1])
  })

  it('holds a sequence under itself instead of cutting each note off', async () => {
    await harness.piano.play(sequence([60, 64, 67]))

    // Every voice is still sounding when the next is struck, and they are all
    // released together — the sustain-pedal behaviour.
    const [first, second, third] = harness.ctx.sources
    expect(first.stoppedAt).toBeGreaterThan(second.startedAt!)
    expect(second.stoppedAt).toBeGreaterThan(third.startedAt!)
    expect(first.stoppedAt).toBeCloseTo(third.stoppedAt!)
  })

  it('schedules the combined shape as sequence then dyad', async () => {
    await harness.piano.play(sequenceThenSimultaneous([60, 64]))
    expect(harness.ctx.sources.map((s) => s.startedAt)).toEqual([
      0, 0.1, 0.2, 0.2,
    ])
  })

  it('resamples notes that have no sample of their own', async () => {
    // 22 has no sample; 21 is its nearest neighbour.
    await harness.piano.play(simultaneous([22]))
    expect(harness.ctx.sources[0].playbackRate.value).toBeCloseTo(
      playbackRate(22, nearestSample(22)),
    )
  })

  it('plays sampled notes at their natural rate', async () => {
    await harness.piano.play(simultaneous([60]))
    expect(harness.ctx.sources[0].playbackRate.value).toBe(1)
  })

  it('stops each note at the end of its scheduled duration', async () => {
    await harness.piano.play(sequence([60]))
    expect(harness.ctx.sources[0].stoppedAt).toBeCloseTo(0.2)
  })

  it('connects every voice through to the destination', async () => {
    await harness.piano.play(simultaneous([60, 64]))
    expect(harness.ctx.sources.every((s) => s.connected)).toBe(true)
    expect(harness.ctx.gains).toHaveLength(2)
  })

  it('cancels the previous playback rather than stacking voices', async () => {
    await harness.piano.play(sequence([60, 64]))
    const first = [...harness.ctx.sources]

    harness.ctx.currentTime = 0.05
    await harness.piano.play(sequence([67, 71]))

    // The first pair was told to stop early, at the cancel time rather than
    // their originally scheduled end.
    for (const source of first) {
      expect(source.stoppedAt).toBeCloseTo(0.09)
    }
  })

  it('rejects notes outside the piano range', async () => {
    await expect(harness.piano.play(simultaneous([20]))).rejects.toThrow(
      RangeError,
    )
  })
})

describe('playSchedule', () => {
  let harness: ReturnType<typeof setup>

  beforeEach(async () => {
    harness = setup()
    await harness.piano.load()
  })

  it('plays notes exactly where the schedule puts them', async () => {
    await harness.piano.playSchedule([
      { midi: 60, startMs: 0, durationMs: 100 },
      { midi: 64, startMs: 250, durationMs: 100 },
    ])

    expect(harness.ctx.sources.map((s) => s.startedAt)).toEqual([0, 0.25])
    expect(harness.ctx.sources.map((s) => s.stoppedAt)).toEqual([0.1, 0.35])
  })

  it('is what play routes through, so both share one path', async () => {
    const spy = vi.spyOn(harness.piano, 'playSchedule')
    await harness.piano.play(sequence([60, 64]))

    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toEqual(
      buildSchedule(sequence([60, 64]), timing),
    )
  })

  it('unlocks the context and cancels what was playing, like play does', async () => {
    await harness.piano.playSchedule([
      { midi: 60, startMs: 0, durationMs: 100 },
    ])
    expect(harness.ctx.state).toBe('running')

    harness.ctx.currentTime = 0.05
    await harness.piano.playSchedule([
      { midi: 64, startMs: 0, durationMs: 100 },
    ])
    // The first voice was cut short rather than left to ring under the second.
    expect(harness.ctx.sources[0].stoppedAt).toBeCloseTo(0.09)
  })

  it('rejects notes outside the piano range', async () => {
    await expect(
      harness.piano.playSchedule([{ midi: 20, startMs: 0, durationMs: 100 }]),
    ).rejects.toThrow(RangeError)
  })

  it('plays at full gain when none is asked for', async () => {
    await harness.piano.playSchedule([
      { midi: 60, startMs: 0, durationMs: 100 },
    ])

    const [gain] = harness.ctx.gains
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(NOTE_GAIN, 0)
  })

  it('scales a voice down when the schedule asks it to', async () => {
    // Accompaniment has to sit under what it accompanies. Without this every
    // voice arrives at the same volume and the backing buries the melody.
    await harness.piano.playSchedule([
      { midi: 60, startMs: 0, durationMs: 100 },
      { midi: 48, startMs: 0, durationMs: 100, gain: 0.4 },
    ])

    const [melody, backing] = harness.ctx.gains
    expect(melody.gain.setValueAtTime).toHaveBeenCalledWith(NOTE_GAIN, 0)
    expect(backing.gain.setValueAtTime).toHaveBeenCalledWith(NOTE_GAIN * 0.4, 0)
  })

  it('plays a melody over a backing chord', async () => {
    const notes = buildMelodySchedule({
      melody: [60, 62, 64],
      backing: [48, 52, 55],
    })
    await harness.piano.playSchedule(notes)

    expect(harness.ctx.sources).toHaveLength(notes.length)

    const levels = harness.ctx.gains.flatMap((g) =>
      g.gain.setValueAtTime.mock.calls.map((call) => call[0] as number),
    )
    // Two voices at two volumes: the melody at full, the backing under it.
    expect(levels.some((level) => level === NOTE_GAIN)).toBe(true)
    expect(levels.some((level) => level > 0 && level < NOTE_GAIN)).toBe(true)
  })
})

describe('stop', () => {
  it('is harmless before anything has played', () => {
    const { piano } = setup()
    expect(() => piano.stop()).not.toThrow()
  })

  it('silences everything currently scheduled', async () => {
    const { piano, ctx } = setup()
    await piano.load()
    await piano.play(simultaneous([60, 64, 67]))

    ctx.currentTime = 0.02
    piano.stop()

    for (const source of ctx.sources) {
      expect(source.stoppedAt).toBeCloseTo(0.06)
    }
  })
})
