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
  struck,
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

/**
 * Fade applied at the end of every note so it never cuts off with a click.
 *
 * Exported because it constrains note timing: a note whose length does not
 * clear its onset gap by at least this much begins fading before the next note
 * arrives, and a run of them is heard as choppy rather than joined up.
 */
export const RELEASE_MS = 180

/** Fade used when playback is cancelled part-way through. */
const CANCEL_MS = 40

/**
 * Per-note gain. Chords stack several of these, so leave headroom.
 *
 * Exported because `ScheduledNote.gain` scales it: a caller asking for a
 * quieter voice is asking for a fraction of this, not of full scale.
 */
export const NOTE_GAIN = 0.8

/**
 * A limiter across everything the engine plays, to stop chords clipping.
 *
 * Voices sum. One note peaks below full scale, but three or four of them
 * sounding together — a block chord, or an arpeggio accumulating under the
 * pedal — add up past it and the result clips: a faint crackle on the attack,
 * intermittent because it depends on whether the partials happen to line up.
 *
 * Scaling each note down by how many are sounding was the obvious alternative
 * and does not work here. Under the sustain-pedal behaviour the count changes
 * throughout a phrase, an arpeggio ends as dense as the block chord it spells,
 * and a melody note struck over its backing would be quietened by the backing
 * rather than by anything about itself.
 *
 * So the sum is caught where it happens instead. The threshold sits above a
 * single note's own peak, so nothing that was never going to clip is touched;
 * only stacked voices are pulled back, gently enough that a chord is quieter
 * than the sum of its parts rather than audibly squashed.
 */
const LIMITER = {
  thresholdDb: -1,
  kneeDb: 3,
  ratio: 12,
  attackSeconds: 0.003,
  releaseSeconds: 0.2,
} as const

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
  /** The limiter every voice is routed through. Belongs to `ctx`. */
  private master: DynamicsCompressorNode | null = null
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
    await this.revive()
  }

  /**
   * Get the context running again after iOS has taken it away.
   *
   * Leave the app for long enough and iOS interrupts its audio session. The
   * context stops, and nothing says so: `play` still resolves, notes are still
   * scheduled, and the clock they are scheduled against is not moving. The app
   * goes silent with no error anywhere, and stays silent until it is killed and
   * relaunched — which works only because that builds a new context.
   *
   * This used to resume a `suspended` context and nothing else, which is the
   * state a *fresh* context starts in and not the one an interrupted context
   * ends in. WebKit parks it in `interrupted` instead — a state that is not in
   * the specification and not in the TypeScript lib — so the check was false
   * exactly when it mattered, and a resume was never attempted.
   *
   * Anything that is not running is now resumed, and a context that will not
   * come back is replaced. The decoded samples survive the swap: an AudioBuffer
   * belongs to no context in particular, so the new one can play the buffers
   * the old one decoded without fetching a byte.
   */
  private async revive(): Promise<void> {
    if (await resumed(this.ctx)) return

    const dead = this.ctx
    // Voices and the limiter belong to the context that made them; none of
    // them will ever sound, and stopping them later would be reaching into a
    // corpse.
    this.voices = []
    this.master = null
    this.ctx = this.createContext()
    void dead?.close().catch(() => {})

    await resumed(this.ctx)
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
    {
      midi,
      startMs,
      durationMs,
      gain: gainScale = 1,
      ringOut = false,
    }: ScheduledNote,
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

    const level = NOTE_GAIN * gainScale
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(level, startAt)

    // Hold at full gain, then fade over the last RELEASE_MS so the note decays
    // instead of being chopped off — unless it was asked to ring, in which case
    // the sample's own decay is the envelope and any fade we add is heard as
    // the sound being taken away.
    if (!ringOut) {
      gain.gain.setValueAtTime(level, releaseAt)
      gain.gain.linearRampToValueAtTime(0, endAt)
    }

    source.connect(gain)
    gain.connect(this.masterFor(ctx))
    source.start(startAt)
    if (!ringOut) source.stop(endAt)

    const voice: Voice = { source, gain }
    this.voices.push(voice)
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice)
    }
  }

  /**
   * The limiter for this context, built on first use.
   *
   * Rebuilt with the context rather than reused across one, since nodes belong
   * to the context that made them.
   */
  private masterFor(ctx: AudioContext): AudioNode {
    if (this.master && this.master.context === ctx) return this.master

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = LIMITER.thresholdDb
    limiter.knee.value = LIMITER.kneeDb
    limiter.ratio.value = LIMITER.ratio
    limiter.attack.value = LIMITER.attackSeconds
    limiter.release.value = LIMITER.releaseSeconds
    limiter.connect(ctx.destination)

    this.master = limiter
    return limiter
  }

  /**
   * Strike notes together and let them ring.
   *
   * For a reference the user asked to hear — the tonic, the chord a melody sits
   * over — where nothing follows and so nothing needs it to stop. `play` is for
   * questions, which end because something else is about to begin.
   */
  async strike(notes: readonly number[]): Promise<void> {
    await this.playSchedule(struck(notes))
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

/**
 * Whether a context is running, resuming it if it is not.
 *
 * `closed` is not worth trying: resuming one throws, and the throw is the
 * expected outcome rather than a surprise worth catching loudly.
 */
async function resumed(ctx: AudioContext | null): Promise<boolean> {
  if (!ctx) return false
  if (stateOf(ctx) === 'running') return true
  if (stateOf(ctx) === 'closed') return false

  try {
    await ctx.resume()
  } catch {
    // An interrupted context sometimes cannot be revived at all. The caller
    // builds a new one rather than treating this as fatal.
    return false
  }

  return stateOf(ctx) === 'running'
}

/**
 * The context's state, including the one WebKit invented.
 *
 * `interrupted` is what iOS uses when it takes the audio session away from a
 * backgrounded app. It is not in the specification, so it is not in
 * `AudioContextState`, so the compiler will not let you compare against it
 * without being told it exists.
 */
function stateOf(ctx: AudioContext): AudioContextState | 'interrupted' {
  return ctx.state
}

/** Shared instance used by the app. */
export const piano = new Piano()
