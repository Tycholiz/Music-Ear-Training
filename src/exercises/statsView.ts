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

const MOTION_NAMES: Record<string, string> = {
  opening: 'First note',
  repeat: 'Repeated note',
  'step-up': 'Step up',
  'step-down': 'Step down',
  'leap-up': 'Leap up',
  'leap-down': 'Leap down',
}

/**
 * Melody leads with *motion* rather than with the degree.
 *
 * A per-degree figure conflates every way a degree can arrive, and the ways
 * differ more than the degrees do: the first note of a phrase is judged
 * against the drone with nothing before it, while every note after it is
 * judged against what just happened. Someone can be solid at one and lost at
 * the other, and a list of degrees cannot say which.
 *
 * Degrees stay as a breakdown, because the featured-degrees setting can act on
 * them — but without confusions. Melodic misses land on a neighbouring degree
 * for nearly everyone, so that pairing reads as a finding while saying the
 * same thing about every user.
 */
export const MELODY_STATS_VIEW: StatsView = {
  answer: {
    namespace: 'motion',
    title: 'By melodic motion',
    label: (value) => MOTION_NAMES[value] ?? value,
  },
  breakdowns: [
    {
      namespace: 'degree',
      title: 'By scale degree',
      label: safely((value) => degreeLabel(Number(value) as Degree)),
    },
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
 * How many recent attempts before a percentage is worth printing.
 *
 * Two out of three is not 67%. A statistics screen that says so is worse than
 * one that says nothing, because the user acts on it — and this one sits next
 * to a feature that is already quietly using the same thin evidence, so the
 * temptation to show a number is real.
 *
 * Counted against the recent window rather than the lifetime total, so the
 * threshold guards the same figure it is gating. They only differ for a record
 * whose window is shorter than its history, which is what a hand-edited blob
 * looks like.
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
}

/**
 * One section's rows, worst first, before the reporting threshold is applied.
 *
 * Accuracy is measured over the **recent window**, the same span the buckets
 * and adaptive difficulty read. A lifetime figure answers a question nobody is
 * asking — someone who was bad at a chord months ago and has since fixed it
 * would read a low percentage while sitting under "Solid", because the two
 * numbers were describing different stretches of time.
 */
export function statsRows(
  stats: ExerciseStats,
  section: StatsSection,
): StatsRow[] {
  return Object.entries(itemsInNamespace(stats, section.namespace))
    .map(([id, item]) => {
      const seen = item.recent.length
      const right = item.recent.filter((a) => a.correct).length

      return {
        id,
        label: section.label(id),
        item,
        accuracy: seen >= MIN_ATTEMPTS_TO_REPORT ? right / seen : null,
      }
    })
    .sort((a, b) => smoothedAccuracy(a.item) - smoothedAccuracy(b.item))
}

/**
 * The rows there is enough evidence to say anything about.
 *
 * Everything else is left off the screen entirely rather than shown without a
 * number. An item was previously bucketed anyway — `mastery` smooths, so it
 * always produces an answer — while its percentage abstained, so a chord
 * answered once correctly appeared under "Getting there" reading as a verdict
 * on evidence that did not exist. Bucketing and reporting have to agree about
 * what counts as enough, and this is the one place that decides.
 */
export function reportableRows(rows: readonly StatsRow[]): StatsRow[] {
  return rows.filter((row) => row.accuracy !== null)
}

/**
 * How often a mistake has to happen before it is worth naming.
 *
 * As a share of *attempts*, not of misses: mistaking a perfect 5th for an
 * octave a fifth of the time is a habit worth knowing about, and the same
 * mistake made once in twenty tries is noise. A share of misses would call
 * that second one 100% of a single miss and say it just as loudly.
 *
 * Set between the two cases that decide it — a fifth of the time counts, a
 * twentieth does not.
 */
export const CONFUSION_THRESHOLD = 0.15

/** At most this many named per row, commonest first. */
export const MAX_CONFUSIONS_SHOWN = 2

/**
 * What this item is habitually mistaken for, commonest first.
 *
 * Counted over the recent window, so a mistake stops being mentioned once it
 * stops being made — the same span the accuracy and the bucket use. Answers
 * below `CONFUSION_THRESHOLD` are left out entirely rather than listed with a
 * small number beside them: a rare mistake named alongside a habitual one
 * reads as though both were findings.
 *
 * No counts come back with them. "Mistaken for an octave 11 times" invites
 * arithmetic against a total that is not on screen, and the threshold has
 * already answered the only question a count would settle.
 */
export function confusionsFor(row: StatsRow, section: StatsSection): string[] {
  const attempts = row.item.recent.length
  if (attempts === 0) return []

  const counts = new Map<string, number>()
  for (const { answered } of row.item.recent) {
    if (answered !== undefined) {
      counts.set(answered, (counts.get(answered) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count / attempts >= CONFUSION_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_CONFUSIONS_SHOWN)
    .map(([answered]) => section.label(answered))
}

/** Whether anything at all has been recorded for this exercise. */
export function hasAnyStats(stats: ExerciseStats): boolean {
  return Object.keys(stats).length > 0
}
