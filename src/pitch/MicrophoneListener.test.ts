import { afterEach, describe, expect, it, vi } from 'vitest'
import { MicrophoneListener } from './MicrophoneListener'
import { midiToFrequency } from '../theory'
import { TEST_SAMPLE_RATE as SR, noise, silence, tone } from './testTones'

/**
 * A fake microphone. `signal` is whatever the analyser will hand back on the
 * next frame, so a test can "hum" by assigning to it.
 */
function harness(
  options: {
    failWith?: string
    noMediaDevices?: boolean
    listener?: ConstructorParameters<typeof MicrophoneListener>[0]
  } = {},
) {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  const stream = {
    getTracks: () => tracks,
  } as unknown as MediaStream

  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const analyserConnections: unknown[] = []
  let signal = silence(4096)

  const ctx = {
    sampleRate: SR,
    createAnalyser: () => ({
      fftSize: 0,
      disconnect: vi.fn(),
      connect: (target: unknown) => analyserConnections.push(target),
      getFloatTimeDomainData: (out: Float32Array) => {
        out.set(signal.subarray(0, out.length))
      },
    }),
    createMediaStreamSource: () => source,
    close: vi.fn().mockResolvedValue(undefined),
    destination: { id: 'destination' },
  }

  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    void constraints
    if (options.failWith) {
      const error = new Error('nope')
      error.name = options.failWith
      throw error
    }
    return stream
  })

  if (options.noMediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    })
  } else {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    })
  }

  const mic = new MicrophoneListener({
    getUserMedia: getUserMedia as unknown as typeof getUserMedia,
    audioContextFactory: () => ctx as unknown as AudioContext,
    ...options.listener,
  })

  const heard: number[] = []
  mic.onPitch((midi) => heard.push(midi))

  return {
    mic,
    heard,
    tracks,
    ctx,
    source,
    analyserConnections,
    getUserMedia,
    /** Feed the next N frames with this signal. */
    hum(midi: number | null, frames = 3) {
      signal = midi === null ? silence(4096) : tone(midiToFrequency(midi), 4096)
      for (let i = 0; i < frames; i++) mic.analyse()
    },
    play(samples: Float32Array, frames = 3) {
      signal = samples
      for (let i = 0; i < frames; i++) mic.analyse()
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error removing the stub the harness installed
  delete navigator.mediaDevices
  vi.restoreAllMocks()
})

describe('lifecycle', () => {
  it('starts idle', () => {
    const { mic } = harness()
    expect(mic.getStatus()).toBe('idle')
  })

  it('reaches listening once permission is granted', async () => {
    const { mic } = harness()
    await mic.start()
    expect(mic.getStatus()).toBe('listening')
  })

  it('passes through requesting on the way', async () => {
    const { mic } = harness()
    const seen: string[] = []
    mic.subscribe(() => seen.push(mic.getStatus()))

    await mic.start()
    expect(seen).toEqual(['requesting', 'listening'])
  })

  it('opens one stream however many times it is started', async () => {
    const { mic, getUserMedia } = harness()
    await Promise.all([mic.start(), mic.start()])
    await mic.start()

    expect(getUserMedia).toHaveBeenCalledOnce()
  })

  it('turns off the browser processing that would mangle pitch', async () => {
    const { mic, getUserMedia } = harness()
    await mic.start()

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  })

  it('never routes the microphone to the speakers', async () => {
    const { mic, ctx, source, analyserConnections } = harness()
    await mic.start()

    // The analyser is a dead end. Connecting it onward would feed the mic
    // straight back out and howl.
    expect(analyserConnections).not.toContain(ctx.destination)
    expect(source.connect).toHaveBeenCalledOnce()
  })
})

describe('releasing the device', () => {
  it('stops every track, not just the audio graph', async () => {
    const { mic, tracks } = harness()
    await mic.start()
    mic.stop()

    // Tearing down the nodes alone leaves the recording indicator lit.
    for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce()
  })

  it('closes the audio context and returns to idle', async () => {
    const { mic, ctx } = harness()
    await mic.start()
    mic.stop()

    expect(ctx.close).toHaveBeenCalledOnce()
    expect(mic.getStatus()).toBe('idle')
  })

  it('is harmless before anything has started', () => {
    const { mic } = harness()
    expect(() => mic.stop()).not.toThrow()
    expect(mic.getStatus()).toBe('idle')
  })

  it('stops analysing', async () => {
    vi.useFakeTimers()
    const { mic, heard, hum } = harness()
    await mic.start()
    mic.stop()

    hum(60, 5)
    expect(heard).toEqual([])
  })
})

describe('permission and availability', () => {
  it('reports a refusal as denied', async () => {
    const { mic } = harness({ failWith: 'NotAllowedError' })
    await mic.start()
    expect(mic.getStatus()).toBe('denied')
  })

  it('treats older Safari SecurityError as a refusal too', async () => {
    const { mic } = harness({ failWith: 'SecurityError' })
    await mic.start()
    expect(mic.getStatus()).toBe('denied')
  })

  it('reports a missing device as unavailable', async () => {
    const { mic } = harness({ failWith: 'NotFoundError' })
    await mic.start()
    expect(mic.getStatus()).toBe('unavailable')
  })

  it('reports an insecure context as unavailable rather than throwing', async () => {
    const { mic } = harness({ noMediaDevices: true })
    await expect(mic.start()).resolves.toBeUndefined()
    expect(mic.getStatus()).toBe('unavailable')
  })
})

describe('hearing a note', () => {
  it('emits the note that was hummed', async () => {
    const { mic, heard, hum } = harness()
    await mic.start()

    hum(60)
    expect(heard).toEqual([60])
  })

  it('waits for the pitch to settle before committing', async () => {
    const { mic, heard, hum } = harness({ listener: { stableFrames: 3 } })
    await mic.start()

    hum(60, 1)
    expect(heard).toEqual([])
    hum(60, 1)
    expect(heard).toEqual([])
    hum(60, 1)
    expect(heard).toEqual([60])
  })

  it('does not commit while the pitch is still moving', async () => {
    // A swooping hum: each frame lands on a different note, so nothing settles.
    const { mic, heard, hum } = harness()
    await mic.start()

    hum(57, 1)
    hum(59, 1)
    hum(60, 1)
    hum(62, 1)
    expect(heard).toEqual([])
  })

  it('emits once for a held note, not once per frame', async () => {
    const { mic, heard, hum } = harness()
    await mic.start()

    hum(60, 20)
    expect(heard).toEqual([60])
  })

  it('hears the same note again after it has been released', async () => {
    // The retry case: hum a wrong note, stop, hum it again.
    const { mic, heard, hum } = harness()
    await mic.start()

    hum(60)
    hum(null, 2)
    hum(60)

    expect(heard).toEqual([60, 60])
  })

  it('hears a different note without needing silence between', async () => {
    const { mic, heard, hum } = harness()
    await mic.start()

    hum(60)
    hum(64)
    expect(heard).toEqual([60, 64])
  })

  it('hears a note played on an instrument, not just a hum', async () => {
    const { mic, heard, play } = harness()
    await mic.start()

    play(tone(midiToFrequency(52), 4096, { harmonics: 8 }))
    expect(heard).toEqual([52])
  })
})

describe('ignoring what is not a note', () => {
  it('says nothing during silence', async () => {
    const { mic, heard, hum } = harness()
    await mic.start()

    hum(null, 10)
    expect(heard).toEqual([])
  })

  it('says nothing for room noise', async () => {
    const { mic, heard, play } = harness()
    await mic.start()

    play(noise(4096), 10)
    expect(heard).toEqual([])
  })

  it('ignores a note below the band it is listening to', async () => {
    const { mic, heard, hum } = harness({
      listener: { minFrequency: 200, maxFrequency: 1000 },
    })
    await mic.start()

    hum(40, 5) // ~82 Hz, under the floor
    expect(heard).toEqual([])

    hum(72, 5) // ~523 Hz, inside it
    expect(heard).toEqual([72])
  })
})

describe('driving itself', () => {
  it('analyses on a timer once started', async () => {
    vi.useFakeTimers()
    const { mic, heard } = harness({ listener: { intervalMs: 10 } })
    const analyse = vi.spyOn(mic, 'analyse')

    await mic.start()
    vi.advanceTimersByTime(35)

    expect(analyse).toHaveBeenCalledTimes(3)
    expect(heard).toEqual([])
  })
})

describe('subscriptions', () => {
  it('stops notifying a status listener after unsubscribe', async () => {
    const { mic } = harness()
    const listener = vi.fn()
    mic.subscribe(listener)()

    await mic.start()
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying a pitch listener after unsubscribe', async () => {
    const { mic, hum } = harness()
    const listener = vi.fn()
    const unsubscribe = mic.onPitch(listener)
    await mic.start()

    unsubscribe()
    hum(60)
    expect(listener).not.toHaveBeenCalled()
  })
})
