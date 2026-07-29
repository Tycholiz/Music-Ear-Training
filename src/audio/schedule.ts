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
  /** How often the backing chord is struck again. */
  backingRestrikeMs: number
}

/**
 * Melodies move faster than questions about a single interval.
 *
 * `TIMING.onsetMs` is 700ms, which is the right pace for two notes you are
 * meant to compare against each other and the wrong pace for eight you are
 * meant to hear as a phrase — strung out that far they stop being a melody and
 * become a list. `noteMs` is a little longer than `onsetMs` so consecutive
 * notes just overlap, joining rather than clicking apart.
 */
export const MELODY_TIMING: MelodyTiming = {
  onsetMs: 460,
  noteMs: 520,
  releaseMs: 1100,
  backingRestrikeMs: 1500,
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
 * The backing is struck more than once. Piano samples decay, and a single
 * strike is long gone by the end of a longer melody — which would leave the
 * last degrees, the ones a tiring listener is most likely to lose, with the
 * least harmony under them. Each strike runs until the next one, so the
 * engine's own release fade carries one into the other instead of two copies
 * of the same note sounding together.
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
  const phraseEnd = melodyEndMs + timing.releaseMs

  const strikes = backingStrikes(melodyEndMs, timing)
  strikes.forEach((startMs, i) => {
    // Each strike lasts until the next one takes over, so the engine's release
    // fade carries between them rather than stacking two of the same note.
    const endMs = strikes[i + 1] ?? phraseEnd
    for (const midi of backing) {
      scheduled.push({
        midi,
        startMs,
        durationMs: endMs - startMs,
        gain: BACKING_GAIN,
      })
    }
  })

  return scheduled
}

/** When the backing is struck: on the first note, then at a steady interval. */
function backingStrikes(melodyEndMs: number, timing: MelodyTiming): number[] {
  const strikes: number[] = []
  for (let at = 0; at < melodyEndMs; at += timing.backingRestrikeMs) {
    strikes.push(at)
  }
  return strikes
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
