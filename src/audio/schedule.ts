/**
 * Playback shapes and their timing.
 *
 * Everything either exercise needs to play is a list of note groups: notes
 * within a group sound together, groups sound one after another. That single
 * shape covers all five interval play modes and both chord play modes:
 *
 *   ascending             [[60], [64]]
 *   descending            [[64], [60]]
 *   harmonic              [[60, 64]]
 *   ascending + harmonic  [[60], [64], [60, 64]]
 *   block chord           [[60, 64, 67]]
 *   arpeggiated chord     [[60], [64], [67]]
 */

/** Notes sounded simultaneously. */
export type NoteGroup = readonly number[]

export interface ScheduledNote {
  midi: number
  /** Milliseconds from the start of playback. */
  startMs: number
  durationMs: number
  /**
   * Let the sample decay on its own instead of being faded out at
   * `durationMs`.
   *
   * A struck piano note takes several seconds to die away. Cutting it at a
   * scheduled length is right when something else is about to happen — the next
   * note, the next question — and wrong for a note played on its own to be
   * listened to, where the fade is heard as the sound being taken away.
   * `durationMs` still says roughly how long it lasts, for anything timing off
   * the schedule.
   */
  ringOut?: boolean
  /**
   * Multiplier on the engine's standard note gain. Defaults to 1.
   *
   * Everything that plays a question wants every note at the same volume, so
   * this stays unset almost everywhere. It exists for accompaniment, which has
   * to sit under what it accompanies rather than compete with it.
   */
  gain?: number
}

export interface Timing {
  /** How long a lone note rings. */
  onsetMs: number
  /** How long the phrase rings on after the last onset, when it ends on one note. */
  releaseMs: number
  /** How long it rings on when the phrase ends on two or more notes together. */
  chordReleaseMs: number
}

/** Tuned in one place so the feel of both exercises can be adjusted together. */
export const TIMING: Timing = {
  onsetMs: 700,
  releaseMs: 900,
  chordReleaseMs: 1300,
}

function releaseFor(group: NoteGroup, timing: Timing): number {
  return group.length > 1 ? timing.chordReleaseMs : timing.releaseMs
}

/** When the last note stops sounding. */
function phraseEndMs(groups: readonly NoteGroup[], timing: Timing): number {
  const lastOnset = (groups.length - 1) * timing.onsetMs
  return lastOnset + releaseFor(groups[groups.length - 1], timing)
}

/**
 * Flatten note groups into absolute-timed notes.
 *
 * Notes are struck one group at a time but every one of them rings until the
 * end of the phrase, as if the sustain pedal were held down throughout and
 * lifted once at the end. An arpeggio therefore accumulates into its chord
 * rather than sounding as a row of separate notes, and a melodic interval
 * still has its first note under the second.
 */
export function buildSchedule(
  groups: readonly NoteGroup[],
  timing: Timing = TIMING,
): ScheduledNote[] {
  if (groups.length === 0) return []

  const end = phraseEndMs(groups, timing)
  const scheduled: ScheduledNote[] = []

  groups.forEach((group, index) => {
    const startMs = index * timing.onsetMs
    for (const midi of group) {
      scheduled.push({ midi, startMs, durationMs: end - startMs })
    }
  })

  return scheduled
}

/** Total length of a schedule, from first onset to the pedal lifting. */
export function scheduleDurationMs(
  groups: readonly NoteGroup[],
  timing: Timing = TIMING,
): number {
  if (groups.length === 0) return 0
  return phraseEndMs(groups, timing)
}

// --- progressions -----------------------------------------------------------

export interface ProgressionTiming {
  /** Time between one chord being struck and the next. */
  onsetMs: number
  /** How long each chord rings before it is released. */
  chordMs: number
}

/**
 * Chords change more slowly than a melody moves.
 *
 * At a melody's pace a progression is a blur — a chord needs long enough to be
 * heard *as* a chord, with its quality settled, before the next one arrives.
 * `chordMs` clears `onsetMs` by more than the engine's release fade for the
 * same reason melody notes do: a chord that began fading before its successor
 * struck would make a run of them pulse rather than move.
 */
export const PROGRESSION_TIMING: ProgressionTiming = {
  onsetMs: 900,
  chordMs: 1150,
}

/**
 * A progression, chord by chord.
 *
 * Not `buildSchedule`, which holds every note to the end of the phrase — four
 * triads under that rule finish as a twelve-note cluster, and what the user is
 * asked to identify is four chords rather than the pile they add up to. Each
 * chord is released as the next takes over instead.
 *
 * The last chord is left to ring. It is the cadence: the whole point of it is
 * the arrival, and cutting that off at a scheduled length is the one place in a
 * progression where the sound being taken away is most obvious.
 *
 * ## Nothing is sounded before it
 *
 * A tonic was, briefly, to settle the ambiguity that `I V I V` and `IV I IV I`
 * are the same four sounds. It was removed: whatever it fixed on paper, in use
 * it read as part of the progression, and a user counting chords had to know to
 * discard the first thing they heard. The Key button already answers "where is
 * home" for anyone who wants it, on demand and without being a sound they have
 * to learn to ignore.
 */
export function buildProgressionSchedule(
  chords: readonly NoteGroup[],
  timing: ProgressionTiming = PROGRESSION_TIMING,
): ScheduledNote[] {
  return chords.flatMap((chord, index) => {
    const last = index === chords.length - 1
    return chord.map((midi) => ({
      midi,
      startMs: index * timing.onsetMs,
      durationMs: last ? RING_OUT_MS : timing.chordMs,
      ringOut: last,
    }))
  })
}

/** Roughly how long a struck note stays audible. */
export const RING_OUT_MS = 6000

/**
 * A chord struck once and left to ring.
 *
 * For a reference the user asks to hear rather than a question being posed:
 * nothing follows it, so nothing needs it to stop.
 */
export function struck(notes: readonly number[]): ScheduledNote[] {
  return notes.map((midi) => ({
    midi,
    startMs: 0,
    // Long enough to cover a piano note's decay, for anything measuring the
    // schedule. The sound itself ends when the sample does.
    durationMs: RING_OUT_MS,
    ringOut: true,
  }))
}

/**
 * How long a schedule runs for, measured from the notes themselves.
 *
 * `scheduleDurationMs` derives the answer from note groups, which a melody
 * does not have — its two layers run on different clocks. Exercise screens key
 * their timers off this, so it has to be the real end of the sound rather than
 * the last onset.
 */
export function scheduleEndMs(notes: readonly ScheduledNote[]): number {
  return notes.reduce(
    (end, note) => Math.max(end, note.startMs + note.durationMs),
    0,
  )
}

// --- melodies ---------------------------------------------------------------

export interface MelodyTiming {
  /** Time between one melody note starting and the next. */
  onsetMs: number
  /** How long each melody note rings. */
  noteMs: number
  /** How long the backing rings on after the melody has finished. */
  releaseMs: number
}

/**
 * Melodies move faster than questions about a single interval.
 *
 * `TIMING.onsetMs` is 700ms, which is the right pace for two notes you are
 * meant to compare against each other and the wrong pace for eight you are
 * meant to hear as a phrase — strung out that far they stop being a melody and
 * become a list. `noteMs` is a little longer than `onsetMs` so consecutive
 * notes just overlap, joining rather than clicking apart.
 *
 * `noteMs` has to clear `onsetMs` by more than the engine's release fade, or
 * the melody comes out choppy: at 520ms a note began fading 180ms before its
 * end, which is 340ms in, while the next note did not arrive until 460ms. Every
 * note swelled and died before its successor began, so the line pulsed instead
 * of joining up. Held past the next onset, the handover happens at full volume,
 * which is what legato is.
 */
export const MELODY_TIMING: MelodyTiming = {
  onsetMs: 460,
  noteMs: 760,
  releaseMs: 1100,
}

/**
 * How loud the backing sits relative to the melody.
 *
 * It is a reference, not a part. Loud enough that every degree is heard
 * against it, quiet enough that it never competes with the notes being
 * transcribed — and it stacks two or three voices against the melody's one, so
 * matching gains would not even be matching volumes.
 */
const BACKING_GAIN = 0.4

export interface MelodyPhrase {
  /** The notes to be transcribed, in order. */
  melody: readonly number[]
  /** Sounded underneath throughout. Empty plays the melody unaccompanied. */
  backing?: readonly number[]
}

/**
 * A melody over a chord held underneath it.
 *
 * The two layers want opposite things from the same phrase, which is why this
 * cannot be expressed as note groups. `buildSchedule` holds every note to the
 * end as if the pedal were down — right for an arpeggio, which is supposed to
 * accumulate into its chord, and wrong for a melody, where eight notes still
 * ringing at the end is a cluster rather than a phrase. So melody notes are
 * detached here, while the backing does exactly what `buildSchedule` would
 * have done to all of it.
 *
 * The backing is struck exactly once, on the first melody note, and left to
 * ring. It was restruck at first, on the reasoning that piano samples decay
 * and the last degrees would be left with the least harmony under them — but
 * a chord arriving again part-way through a melody is heard as a chord change,
 * which is precisely the wrong thing to say when the whole point of the
 * backing is that home has not moved. A decaying chord still says where home
 * is; a second strike says something untrue.
 */
export function buildMelodySchedule(
  phrase: MelodyPhrase,
  timing: MelodyTiming = MELODY_TIMING,
): ScheduledNote[] {
  const { melody, backing = [] } = phrase
  if (melody.length === 0) return []

  const scheduled: ScheduledNote[] = melody.map((midi, index) => ({
    midi,
    startMs: index * timing.onsetMs,
    durationMs: timing.noteMs,
  }))

  if (backing.length === 0) return scheduled

  const melodyEndMs = (melody.length - 1) * timing.onsetMs + timing.noteMs

  for (const midi of backing) {
    scheduled.push({
      midi,
      startMs: 0,
      durationMs: melodyEndMs + timing.releaseMs,
      gain: BACKING_GAIN,
    })
  }

  return scheduled
}

// Shape helpers, named for how the exercises talk about them.

/** One note after another. */
export function sequence(notes: readonly number[]): NoteGroup[] {
  return notes.map((note) => [note])
}

/** All notes at once. */
export function simultaneous(notes: readonly number[]): NoteGroup[] {
  return [[...notes]]
}

/** One note after another, then all of them together. */
export function sequenceThenSimultaneous(
  notes: readonly number[],
): NoteGroup[] {
  return [...sequence(notes), [...notes]]
}
