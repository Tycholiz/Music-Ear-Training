import {
  chordById,
  degreeLabel,
  intervalName,
  numeralById,
  scaleById,
  type Degree,
} from '../theory'
import {
  itemsInNamespace,
  type ExerciseStats,
  type ItemStats,
} from '../settings'
import { smoothedAccuracy } from './adaptive'
import { CHORD_PLAY_MODE_NAMES, INVERSION_NAMES } from './chordValidation'
import { PLAY_MODE_NAMES } from './intervalValidation'
import { CADENCE_NAMES } from './progressionValidation'

/**
 * What a statistics screen should show for each exercise.
 *
 * The stats store is deliberately dumb about music — it keeps namespaced ids
 * and counts. Turning `chord:major-7th` back into "Major 7th", and knowing
 * that chord root wants a breakdown by *inversion* while intervals want one by
 * direction, is knowledge about the exercise. It lives here so the screen can
 * be one component rather than five.
 *
 * ## Two tiers, because they answer different questions
 *
 * The **answer** namespace is the thing the user names — the chord, the
 * interval, the numeral, the degree. It is the only one with confusions
 * recorded against it, since it is the only one where a wrong answer exists to
 * name, and it is what gets bucketed into learning / practising / solid.
 *
 * A **breakdown** is a condition the question was asked under: which inversion,
 * which play mode, which cadence, which position in the progression. These say
 * *why* an answer figure looks the way it does — "root position 88%, second
 * inversion 41%" is the whole difficulty of chord root in one line — but
 * bucketing them as though the user were learning "2nd inversion" would be
 * nonsense, so they are a plain worst-first list.
 */

export interface StatsSection {
  /** The namespace its items live under, without the colon. */
  namespace: string
  title: string
  /** Turns the value after the colon into something a musician reads. */
  label: (value: string) => string
}

export interface StatsView {
  /** The thing the user names. Bucketed, and the only one with confusions. */
  answer: StatsSection
  /** Conditions the question was asked under. Plain lists. */
  breakdowns: StatsSection[]
}

/** Falls back to the raw id rather than throwing on a stale record. */
function safely(label: (value: string) => string) {
  return (value: string) => {
    try {
      return label(value)
    } catch {
      return value
    }
  }
}

const chordAnswer: StatsSection = {
  namespace: 'chord',
  title: 'Chords',
  label: safely((id) => chordById(id).name),
}

const inversionBreakdown: StatsSection = {
  namespace: 'inversion',
  title: 'By inversion',
  label: (value) => INVERSION_NAMES[Number(value)] ?? value,
}

export const INTERVAL_STATS_VIEW: StatsView = {
  answer: {
    namespace: 'interval',
    title: 'Intervals',
    label: safely((value) => intervalName(Number(value))),
  },
  breakdowns: [
    {
      namespace: 'mode',
      title: 'By play mode',
      // Descending is a different skill from ascending, and one figure across
      // both hides which of the two is the problem.
      label: (value) => PLAY_MODE_NAMES[value as 'ascending'] ?? value,
    },
  ],
}

export const CHORD_STATS_VIEW: StatsView = {
  answer: chordAnswer,
  breakdowns: [
    inversionBreakdown,
    {
      namespace: 'mode',
      title: 'By play mode',
      label: (value) => CHORD_PLAY_MODE_NAMES[value] ?? value,
    },
  ],
}

/**
 * Chord root has no confusions to show — it is self-graded, so there is no
 * wrong answer, only the user's word that they had the note or did not.
 *
 * Inversion leads its breakdowns because it *is* the difficulty here. Finding
 * the root of a root-position chord and finding it under a 2nd inversion are
 * barely the same task.
 */
export const ROOT_STATS_VIEW: StatsView = {
  answer: chordAnswer,
  breakdowns: [inversionBreakdown],
}

export const MELODY_STATS_VIEW: StatsView = {
  answer: {
    namespace: 'degree',
    title: 'Scale degrees',
    label: safely((value) => degreeLabel(Number(value) as Degree)),
  },
  breakdowns: [
    {
      namespace: 'scale',
      title: 'By scale',
      label: safely((id) => scaleById(id).name),
    },
  ],
}

export const PROGRESSION_STATS_VIEW: StatsView = {
  answer: {
    namespace: 'numeral',
    title: 'Chords',
    label: safely((id) => numeralById(id).label),
  },
  breakdowns: [
    {
      namespace: 'cadence',
      title: 'By cadence',
      label: (value) => CADENCE_NAMES[value as 'authentic'] ?? value,
    },
    {
      namespace: 'position',
      // Losing chord four of five while getting one to three is working
      // memory, not harmony, and no amount of chord drilling addresses it.
      title: 'By position in the progression',
      label: (value) => `Chord ${Number(value) + 1}`,
    },
  ],
}

/**
 * How many attempts before a percentage is worth printing.
 *
 * Two out of three is not 67%. A statistics screen that says so is worse than
 * one that says nothing, because the user acts on it — and this one sits next
 * to a feature that is already quietly using the same thin evidence, so the
 * temptation to show a number is real.
 */
export const MIN_ATTEMPTS_TO_REPORT = 5

export type Mastery = 'learning' | 'practising' | 'solid'

/**
 * Which bucket an item falls into.
 *
 * Deliberately the *same* smoothed accuracy adaptive difficulty weights by, so
 * what the screen calls "needs work" is exactly what the exercise has been
 * asking more often. Two different definitions of struggling would have the
 * app contradicting itself in front of the user.
 */
export function mastery(item: ItemStats): Mastery {
  const accuracy = smoothedAccuracy(item)
  if (accuracy < 0.6) return 'learning'
  if (accuracy < 0.85) return 'practising'
  return 'solid'
}

export interface StatsRow {
  /** The value after the colon, e.g. `major-7th`. */
  id: string
  label: string
  item: ItemStats
  /** Null until there is enough evidence to report one. */
  accuracy: number | null
  /** How many more attempts before an accuracy can be shown. */
  moreNeeded: number
}

/** One section's rows, worst first. */
export function statsRows(
  stats: ExerciseStats,
  section: StatsSection,
): StatsRow[] {
  return Object.entries(itemsInNamespace(stats, section.namespace))
    .map(([id, item]) => ({
      id,
      label: section.label(id),
      item,
      accuracy:
        item.attempts >= MIN_ATTEMPTS_TO_REPORT
          ? item.correct / item.attempts
          : null,
      moreNeeded: Math.max(0, MIN_ATTEMPTS_TO_REPORT - item.attempts),
    }))
    .sort((a, b) => smoothedAccuracy(a.item) - smoothedAccuracy(b.item))
}

/** The confusions for one row, worst first, already labelled. */
export function confusionsFor(
  row: StatsRow,
  section: StatsSection,
): { label: string; count: number }[] {
  return Object.entries(row.item.confusions ?? {})
    .map(([answered, count]) => ({ label: section.label(answered), count }))
    .sort((a, b) => b.count - a.count)
}

/** Whether anything at all has been recorded for this exercise. */
export function hasAnyStats(stats: ExerciseStats): boolean {
  return Object.keys(stats).length > 0
}
