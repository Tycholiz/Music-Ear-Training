import {
  HIGHEST_NOTE,
  LOWEST_NOTE,
  SAMPLED_NOTES,
  isPlayable,
  nearestSample,
  playbackRate,
  sampleUrl,
} from './samples'
import {
  TIMING,
  buildSchedule,
  type NoteGroup,
  type ScheduledNote,
  type Timing,
} from './schedule'
import { configureAudioSession } from './audioSession'

/**
 * Piano playback.
 *
 * The engine owns one AudioContext, decodes the bundled sample set once, and
 * schedules everything against the audio clock rather than timers so notes stay
 * tight. It deliberately knows nothing about intervals or chords — callers hand
 * it note groups (see `schedule.ts`).
 */

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Fade applied at the end of every note so it never cuts off with a click. */
const RELEASE_MS = 180

/** Fade used when playback is cancelled part-way through. */
const CANCEL_MS = 40

/**
 * Per-note gain. Chords stack several of these, so leave headroom.
 *
 * Exported because `ScheduledNote.gain` scales it: a caller asking for a
 * quieter voice is asking for a fraction of this, not of full scale.
 */
export const NOTE_GAIN = 0.8

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
}

export interface PianoOptions {
  /** Injectable for tests; defaults to the platform AudioContext. */
  audioContextFactory?: () => AudioContext
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
  timing?: Timing
}

export class Piano {
  private ctx: AudioContext | null = null
  private readonly buffers = new Map<number, AudioBuffer>()
  private voices: Voice[] = []
  private loading: Promise<void> | null = null
  private status: LoadStatus = 'idle'
  private readonly listeners = new Set<() => void>()

  private readonly createContext: () => AudioContext
  private readonly fetchImpl: typeof fetch
  private readonly timing: Timing

  constructor(options: PianoOptions = {}) {
    this.createContext =
      options.audioContextFactory ?? (() => new AudioContext())
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.timing = options.timing ?? TIMING
  }

  // --- status, shaped for useSyncExternalStore -----------------------------

  getStatus = (): LoadStatus => this.status

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: LoadStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.listeners) listener()
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Create and resume the AudioContext. Must be called from inside a real user
   * gesture — iOS Safari starts the context suspended and silently drops
   * anything scheduled before a tap unlocks it.
   *
   * Also claims a playback audio session, which is what keeps the iPhone's
   * ringer switch from silencing the app. Done here rather than at startup
   * because a user gesture is the one moment Safari is guaranteed to honour it.
   */
  async unlock(): Promise<void> {
    configureAudioSession()
    this.ctx ??= this.createContext()
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  /** Fetch and decode every sample. Safe to call repeatedly. */
  async load(): Promise<void> {
    this.loading ??= this.loadAll()
    return this.loading
  }

  private async loadAll(): Promise<void> {
    this.setStatus('loading')
    try {
      this.ctx ??= this.createContext()
      const ctx = this.ctx

      await Promise.all(
        SAMPLED_NOTES.map(async (midi) => {
          const response = await this.fetchImpl(sampleUrl(midi))
          if (!response.ok) {
            throw new Error(`Failed to load piano sample ${midi}`)
          }
          const encoded = await response.arrayBuffer()
          this.buffers.set(midi, await ctx.decodeAudioData(encoded))
        }),
      )

      this.setStatus('ready')
    } catch (error) {
      // Let the next call retry rather than latching the failure forever.
      this.loading = null
      this.setStatus('error')
      throw error
    }
  }

  // --- playback ------------------------------------------------------------

  /**
   * Play note groups. Cancels anything already sounding, so hammering the
   * replay button restarts cleanly instead of stacking voices.
   */
  async play(groups: readonly NoteGroup[]): Promise<void> {
    await this.playSchedule(buildSchedule(groups, this.timing))
  }

  /**
   * Play notes that have already been placed on the clock.
   *
   * Note groups cover everything with one sustain rule for the whole phrase.
   * A melody over a held chord needs two at once — detached on top, sustained
   * underneath — which no arrangement of groups can express, so that caller
   * builds its own schedule and hands it over.
   */
  async playSchedule(notes: readonly ScheduledNote[]): Promise<void> {
    await this.unlock()
    await this.load()
    this.stop()

    const ctx = this.ctx
    if (!ctx) return

    const startedAt = ctx.currentTime
    for (const note of notes) {
      if (!isPlayable(note.midi)) {
        throw new RangeError(
          `Note ${note.midi} is outside the piano range ${LOWEST_NOTE}-${HIGHEST_NOTE}`,
        )
      }
      this.startVoice(ctx, startedAt, note)
    }
  }

  private startVoice(
    ctx: AudioContext,
    startedAt: number,
    { midi, startMs, durationMs, gain: gainScale = 1 }: ScheduledNote,
  ) {
    const sampleMidi = nearestSample(midi)
    const buffer = this.buffers.get(sampleMidi)
    if (!buffer) return

    const startAt = startedAt + startMs / 1000
    const endAt = startAt + durationMs / 1000
    const releaseAt = Math.max(startAt, endAt - RELEASE_MS / 1000)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = playbackRate(midi, sampleMidi)

    // Hold at full gain, then fade over the last RELEASE_MS so the note
    // decays instead of being chopped off.
    const level = NOTE_GAIN * gainScale
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(level, startAt)
    gain.gain.setValueAtTime(level, releaseAt)
    gain.gain.linearRampToValueAtTime(0, endAt)

    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(startAt)
    source.stop(endAt)

    const voice: Voice = { source, gain }
    this.voices.push(voice)
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice)
    }
  }

  /** Silence everything currently sounding or scheduled. */
  stop(): void {
    const ctx = this.ctx
    if (!ctx) return

    const now = ctx.currentTime
    for (const { source, gain } of this.voices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + CANCEL_MS / 1000)
      source.stop(now + CANCEL_MS / 1000)
    }
    this.voices = []
  }
}

/** Shared instance used by the app. */
export const piano = new Piano()
