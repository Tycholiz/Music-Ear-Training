import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Piano } from './piano'
import { SAMPLED_NOTES, nearestSample, playbackRate } from './samples'
import { sequence, sequenceThenSimultaneous, simultaneous } from './schedule'
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

class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  destination = { id: 'destination' }

  resumeCount = 0
  decodeCount = 0
  sources: FakeSource[] = []
  gains: { setValueAtTime: ReturnType<typeof vi.fn> }[] = []

  async resume() {
    this.resumeCount++
    this.state = 'running'
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
    const gain = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
    }
    this.gains.push(gain as never)
    return gain as unknown as GainNode
  }
}

const timing: Timing = { onsetMs: 100, releaseMs: 200, chordReleaseMs: 300 }

function setup(options: { failFetch?: boolean } = {}) {
  const ctx = new FakeAudioContext()
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
    audioContextFactory: () => ctx as unknown as AudioContext,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    timing,
  })

  return { piano, ctx, fetchImpl }
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
