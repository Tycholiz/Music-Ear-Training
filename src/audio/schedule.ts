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
  noteMs: number
  /** How long a group of two or more rings — chords need longer to register. */
  chordMs: number
  /** Silence between one group ending and the next starting. */
  gapMs: number
}

/** Tuned in one place so the feel of both exercises can be adjusted together. */
export const TIMING: Timing = {
  noteMs: 650,
  chordMs: 1100,
  gapMs: 60,
}

export function groupDurationMs(group: NoteGroup, timing: Timing): number {
  return group.length > 1 ? timing.chordMs : timing.noteMs
}

/** Flatten note groups into absolute-timed notes. */
export function buildSchedule(
  groups: readonly NoteGroup[],
  timing: Timing = TIMING,
): ScheduledNote[] {
  const scheduled: ScheduledNote[] = []
  let cursor = 0

  for (const group of groups) {
    const durationMs = groupDurationMs(group, timing)
    for (const midi of group) {
      scheduled.push({ midi, startMs: cursor, durationMs })
    }
    cursor += durationMs + timing.gapMs
  }

  return scheduled
}

/** Total length of a schedule, excluding the trailing gap. */
export function scheduleDurationMs(
  groups: readonly NoteGroup[],
  timing: Timing = TIMING,
): number {
  if (groups.length === 0) return 0
  const gaps = (groups.length - 1) * timing.gapMs
  const sounding = groups.reduce(
    (total, group) => total + groupDurationMs(group, timing),
    0,
  )
  return sounding + gaps
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
