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
