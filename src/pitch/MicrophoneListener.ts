import { claimRecordingSession, releaseRecordingSession } from '../audio'
import { nearestMidi } from '../theory'
import { detectPitch } from './detectPitch'

/**
 * Turns the microphone into a stream of settled notes.
 *
 * Exercise-agnostic on purpose: this knows nothing about chords, roots or
 * scoring, so the listening exercises after this one reuse it rather than
 * reimplement it. It emits MIDI notes; what they mean is the caller's problem.
 *
 * Shaped like the piano engine — `getStatus`/`subscribe` for
 * `useSyncExternalStore`, and an injectable context and `getUserMedia` so the
 * whole thing is testable against a fake stream.
 */

export type MicStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  /** Permission refused. Cannot be re-requested; the user has to change it. */
  | 'denied'
  /** No microphone, or an insecure context where the API does not exist. */
  | 'unavailable'

/**
 * Default band: roughly B1 to D6.
 *
 * Deliberately much narrower than the detector's full A0–C8. The cost of a
 * frame scales with the lowest frequency you are willing to look for — the
 * full piano range needs a 16k buffer and about 27 ms per frame, while this
 * band needs 4k and about 3 ms. Nobody hums at 27 Hz, and because root matching
 * is octave-agnostic, a bass player whose low notes fall below this can play
 * them an octave up and still be right.
 */
const DEFAULT_MIN_FREQUENCY = 60
const DEFAULT_MAX_FREQUENCY = 1200

/** Enough samples to resolve the bottom of that band. */
const DEFAULT_FFT_SIZE = 4096

/** How often to analyse. 20 Hz is well inside a frame's budget. */
const DEFAULT_INTERVAL_MS = 50

/**
 * How many consecutive frames must land on the same note before it counts.
 *
 * Three frames is about 150 ms of steady pitch. Without this the attack of a
 * plucked string, or the swoop at the start of a hum, fires an answer before
 * the note has settled anywhere near where the singer is aiming.
 */
const DEFAULT_STABLE_FRAMES = 3

export interface MicrophoneOptions {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  audioContextFactory?: () => AudioContext
  minFrequency?: number
  maxFrequency?: number
  fftSize?: number
  intervalMs?: number
  stableFrames?: number
}

export class MicrophoneListener {
  private status: MicStatus = 'idle'
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  // Explicitly backed by an ArrayBuffer: getFloatTimeDomainData will not accept
  // the SharedArrayBuffer that a bare Float32Array also allows.
  private buffer: Float32Array<ArrayBuffer> = new Float32Array(0)
  private starting: Promise<void> | null = null
  /** Whether we hold a recording claim on the audio session — see `open`. */
  private claimedSession = false

  /** Recent detections, used to decide when a note has settled. */
  private run: number[] = []
  /** The note currently sounding, so a held note emits once rather than every frame. */
  private sounding: number | null = null

  private readonly statusListeners = new Set<() => void>()
  private readonly pitchListeners = new Set<(midi: number) => void>()

  private readonly options: Required<
    Omit<MicrophoneOptions, 'getUserMedia' | 'audioContextFactory'>
  >
  private readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>
  private readonly createContext: () => AudioContext

  constructor(options: MicrophoneOptions = {}) {
    this.options = {
      minFrequency: options.minFrequency ?? DEFAULT_MIN_FREQUENCY,
      maxFrequency: options.maxFrequency ?? DEFAULT_MAX_FREQUENCY,
      fftSize: options.fftSize ?? DEFAULT_FFT_SIZE,
      intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
      stableFrames: options.stableFrames ?? DEFAULT_STABLE_FRAMES,
    }
    this.getUserMedia =
      options.getUserMedia ??
      ((constraints) => navigator.mediaDevices.getUserMedia(constraints))
    this.createContext =
      options.audioContextFactory ?? (() => new AudioContext())
  }

  // --- status --------------------------------------------------------------

  getStatus = (): MicStatus => this.status

  subscribe = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /** Called once per settled note, not once per frame. */
  onPitch = (listener: (midi: number) => void): (() => void) => {
    this.pitchListeners.add(listener)
    return () => this.pitchListeners.delete(listener)
  }

  private setStatus(status: MicStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.statusListeners) listener()
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Open the microphone and begin analysing. Must be called from a user
   * gesture: browsers refuse the permission prompt otherwise, and iOS will not
   * start an audio context without one.
   *
   * Safe to call twice — the second call joins the first rather than opening a
   * second stream.
   */
  async start(): Promise<void> {
    if (this.status === 'listening') return
    this.starting ??= this.open()

    try {
      await this.starting
    } finally {
      this.starting = null
    }
  }

  private async open(): Promise<void> {
    this.setStatus('requesting')

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      // No API at all: an insecure origin, or a browser without it.
      this.setStatus('unavailable')
      return
    }

    // Claim the recording session before asking for the stream, not after. iOS
    // settles the audio category the moment capture starts, and if we have not
    // said we intend to keep playing it may route output to the earpiece for
    // the rest of the session.
    claimRecordingSession()
    this.claimedSession = true

    let stream: MediaStream
    try {
      stream = await this.getUserMedia({
        audio: {
          // Every one of these is designed to make speech intelligible, and
          // every one of them mangles pitch.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (error) {
      // Nothing was opened, so nothing should stay claimed — a refusal must
      // not leave playback stuck in a recording category.
      this.releaseSession()
      this.setStatus(classifyError(error))
      return
    }

    this.stream = stream
    this.ctx = this.createContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = this.options.fftSize
    this.source = this.ctx.createMediaStreamSource(stream)
    this.source.connect(this.analyser)

    // Deliberately not connected to the destination: routing the microphone to
    // the speakers is a feedback loop.
    this.buffer = new Float32Array(this.options.fftSize)
    this.run = []
    this.sounding = null

    this.timer = setInterval(() => this.analyse(), this.options.intervalMs)
    this.setStatus('listening')
  }

  /** Close the microphone and stop analysing. Safe to call when not listening. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.source?.disconnect()
    this.analyser?.disconnect()

    // Stopping the tracks is what actually releases the device and puts out the
    // recording indicator. Tearing down the audio graph alone does not.
    for (const track of this.stream?.getTracks() ?? []) track.stop()

    void this.ctx?.close()

    // Hand the session back only once the device is genuinely released, so
    // playback returns to the media channel and the ringer switch behaves again.
    this.releaseSession()

    this.source = null
    this.analyser = null
    this.stream = null
    this.ctx = null
    this.run = []
    this.sounding = null
    this.setStatus('idle')
  }

  /** Release our claim, if we have one. Idempotent, unlike the claim itself. */
  private releaseSession(): void {
    if (!this.claimedSession) return
    this.claimedSession = false
    releaseRecordingSession()
  }

  // --- analysis ------------------------------------------------------------

  /** One frame. Exposed for tests that would rather not drive a timer. */
  analyse(): void {
    if (!this.analyser || !this.ctx) return

    this.analyser.getFloatTimeDomainData(this.buffer)
    const frequency = detectPitch(this.buffer, this.ctx.sampleRate, {
      minFrequency: this.options.minFrequency,
      maxFrequency: this.options.maxFrequency,
    })

    if (frequency === null) {
      // Silence ends the note, which is what allows the next one — or another
      // attempt at the same one — to be heard as new.
      this.run = []
      this.sounding = null
      return
    }

    const midi = nearestMidi(frequency)
    if (this.run[this.run.length - 1] !== midi) {
      this.run = [midi]
      return
    }

    this.run.push(midi)
    if (this.run.length < this.options.stableFrames) return

    if (this.sounding !== midi) {
      this.sounding = midi
      for (const listener of this.pitchListeners) listener(midi)
    }
  }
}

function classifyError(error: unknown): MicStatus {
  const name = (error as { name?: string })?.name
  // NotAllowedError is a refusal; SecurityError is the same thing on older
  // Safari. Everything else — no device, hardware in use — is unavailable.
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'denied'
    : 'unavailable'
}

/** Shared instance used by the app, in the same spirit as `piano`. */
export const microphone = new MicrophoneListener()
