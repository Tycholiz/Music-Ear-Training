import { chordById, type Chord } from '../theory'
import type { ChordSettings, ExerciseStats, ItemStats } from '../settings'
import { itemsInNamespace } from '../settings'
import {
  CONFUSION_THRESHOLD,
  MIN_ATTEMPTS_TO_REPORT,
  mastery,
  type Mastery,
} from './statsView'
import { chordKey } from './adaptive'

/**
 * Short drills on two chords that get mistaken for each other.
 *
 * The chord exercise asks about everything at once, which is right for practice
 * and wrong for a specific confusion. Someone who hears every dominant 9th as a
 * dominant 7th meets that pair perhaps twice in a session, buried among eight
 * other chords. A drill puts the two side by side and nothing else, ten times.
 *
 * ## Why the pairs are curated rather than computed
 *
 * The obvious rule is shared notes, and it is most of the story: two chords
 * differing by one voice are harder to tell apart than two differing by three.
 * It is not all of it. Major and minor share everything but the third, so by
 * that rule they would be among the hardest pairs in the table — and they are
 * one of the *easiest* distinctions there is, because the third is most of what
 * a chord sounds like. A rule that cannot see that would open the list with a
 * drill nobody needs.
 *
 * So the pairs are chosen, and each carries a `rank` for how fundamental it is
 * rather than how similar the two chords look. Major versus minor is rank 1
 * because everything else is built on hearing it, not because it is hard.
 */

export interface Drill {
  /** Stable id — it goes in a URL and in the record. */
  readonly id: string
  /** Exactly two, and the whole pool while the drill runs. */
  readonly chords: readonly [string, string]
  /**
   * How fundamental the distinction is, lowest first.
   *
   * Not how hard it is. The list is ordered so that someone working down it
   * builds on what they have already got, which is the opposite of ordering by
   * difficulty.
   */
  readonly rank: number
  /** What actually differs, in one line. The reason to do this one. */
  readonly listenFor: string
}

/**
 * The pairs, roughly in the order a musician would meet them.
 *
 * Triad-level distinctions first, then the sevenths, then the extensions. Each
 * pair differs by one or two voices — beyond that the two chords stop being
 * confusable and the drill stops being about anything.
 */
export const DRILLS: readonly Drill[] = [
  {
    id: 'major-minor',
    chords: ['major', 'minor'],
    rank: 1,
    listenFor: 'The third. Everything else about the two chords is the same.',
  },
  {
    id: 'minor-diminished',
    chords: ['minor', 'diminished'],
    rank: 2,
    listenFor:
      'The fifth. Both have a minor third, so the difference is entirely in how tight the top sounds.',
  },
  {
    id: 'major-augmented',
    chords: ['major', 'augmented'],
    rank: 3,
    listenFor: 'The fifth again, pushed up instead of down.',
  },
  {
    id: 'major-sus4',
    chords: ['major', 'sus4'],
    rank: 4,
    listenFor:
      'Whether the middle voice is a third or a fourth. The sus wants to resolve; the major is already home.',
  },
  {
    id: 'sus2-sus4',
    chords: ['sus2', 'sus4'],
    rank: 5,
    listenFor:
      'Neither has a third. The question is which side of it the middle voice sits.',
  },
  {
    id: 'dominant-major-7th',
    chords: ['dominant-7th', 'major-7th'],
    rank: 6,
    listenFor:
      'One semitone at the top. The dominant pulls somewhere; the major 7th sits still.',
  },
  {
    id: 'minor-half-diminished-7th',
    chords: ['minor-7th', 'half-diminished-7th'],
    rank: 7,
    listenFor: 'The fifth, under two chords that are otherwise identical.',
  },
  {
    id: 'half-diminished-diminished-7th',
    chords: ['half-diminished-7th', 'diminished-7th'],
    rank: 8,
    listenFor:
      'The seventh. The fully diminished one is symmetrical, which is what makes it sound like it has no home.',
  },
  {
    id: 'major-6th-dominant-7th',
    chords: ['major-6th', 'dominant-7th'],
    rank: 9,
    listenFor: 'Whether the note above the fifth is a sixth or a seventh.',
  },
  {
    id: 'add9-major-9th',
    chords: ['add9', 'major-9th'],
    rank: 10,
    listenFor:
      'Whether there is a seventh in there at all. The add9 skips it; the 9th chord stacks it underneath.',
  },
  {
    id: 'dominant-7th-9th',
    chords: ['dominant-7th', 'dominant-9th'],
    rank: 11,
    listenFor:
      'One voice added on top, and how much warmer it makes the chord.',
  },
  {
    id: 'dominant-9th-11th',
    chords: ['dominant-9th', 'dominant-11th'],
    rank: 12,
    listenFor:
      'The 11th drops the third to make room. That absence is easier to hear than the note that replaced it.',
  },
  {
    id: 'dominant-11th-13th',
    chords: ['dominant-11th', 'dominant-13th'],
    rank: 13,
    listenFor:
      'The 13th brings the third back and drops the 11th. Two changes at once, near the top of a crowded chord.',
  },
  {
    id: 'major-7th-13th',
    chords: ['major-7th', 'major-13th'],
    rank: 14,
    listenFor:
      'Three voices apart, but all of them above the seventh — which is why this is the last one on the list rather than the easiest.',
  },
  {
    id: 'minor-7th-9th',
    chords: ['minor-7th', 'minor-9th'],
    rank: 15,
    listenFor: 'One voice on top of a chord you already know well.',
  },
]

/** How many questions one drill asks. */
export const DRILL_LENGTH = 10

/** The namespace a drill's record lives under. */
export const DRILL_NAMESPACE = 'drill'

export function drillById(id: string): Drill | null {
  return DRILLS.find((drill) => drill.id === id) ?? null
}

/** The two chords, as table entries, for naming them on screen. */
export function drillChords(drill: Drill): [Chord, Chord] {
  return [chordById(drill.chords[0]), chordById(drill.chords[1])]
}

/**
 * The settings a drill runs under.
 *
 * The user's range is kept and everything else is pinned. A drill exists to
 * isolate one distinction, and inversions and arpeggiation are difficulties of
 * their own — leaving them on would mean a failed drill could not say whether
 * the pair or the voicing was the problem, which is the whole thing a drill is
 * supposed to answer.
 *
 * Adaptive weighting is off for the same reason. With two chords in the pool it
 * would quietly stop asking the one being got right, and a drill that asks the
 * same chord nine times out of ten is not a comparison.
 */
export function drillSettings(
  drill: Drill,
  settings: ChordSettings,
): ChordSettings {
  return {
    ...settings,
    chords: [...drill.chords],
    inversions: [0],
    playModes: ['block'],
    adaptive: false,
  }
}

/**
 * How often the ordinary chord exercise sees these two mixed up.
 *
 * Null when there is not enough to say. **Both chords have to have been asked
 * about**, not just one: someone who has met a dominant 9th five times and a
 * dominant 11th never has shown nothing about telling the two apart, and
 * reading their clean 9th record as proof would mark the pair solid on the
 * strength of a chord they have never heard.
 *
 * Counted over attempts rather than over misses, the same way `confusionsFor`
 * counts. Two chords answered as each other a fifth of the time is a habit;
 * once in twenty tries is a slip, and a rate over misses would call a single
 * slip 100%.
 */
export function pairConfusionRate(
  chordStats: ExerciseStats,
  drill: Drill,
): number | null {
  const [a, b] = drill.chords.map((id) => chordStats[chordKey(id)])
  if (!a || !b) return null
  if (
    a.recent.length < MIN_ATTEMPTS_TO_REPORT ||
    b.recent.length < MIN_ATTEMPTS_TO_REPORT
  ) {
    return null
  }

  const mistakenFor = (item: ItemStats, other: string) =>
    item.recent.filter((attempt) => attempt.answered === other).length

  const mistakes =
    mistakenFor(a, drill.chords[1]) + mistakenFor(b, drill.chords[0])

  return mistakes / (a.recent.length + b.recent.length)
}

/**
 * What is known about a pair, and where it came from.
 *
 * A drill the user has actually done outranks anything inferred, because it is
 * the same question asked directly. Everything else is read off ordinary play.
 */
export type DrillEvidence =
  | { kind: 'drilled'; bucket: Mastery }
  | { kind: 'confused' }
  | { kind: 'no-confusion' }
  | { kind: 'unknown' }

export interface DrillProgress {
  drill: Drill
  /** Null until the drill has been finished at least once. */
  record: ItemStats | null
  evidence: DrillEvidence
  /** Where the row is filed. Null means it has not earned a bucket. */
  bucket: Mastery | null
}

/**
 * Every drill, with what is known about each and in the order to work them.
 *
 * ## One threshold, read both ways
 *
 * `CONFUSION_THRESHOLD` already decides when a mistake is worth naming on the
 * statistics screen — a fifth of the time counts, a twentieth does not. The
 * same number decides both answers here: above it the pair is one the user
 * mixes up, below it is one they do not. Inventing a second, stricter number
 * for "demonstrably fine" would be two thresholds nobody could hold in their
 * head at once, and the honest reading of "below the line worth mentioning" is
 * that there is nothing to mention.
 *
 * ## Ordered in tiers, not by a blended score
 *
 * Confused pairs first, then unknown ones, and each tier by `rank`. The obvious
 * alternative is a weighted score — rank minus some multiple of the confusion
 * rate — which needs a constant chosen to make the arithmetic come out, and
 * nobody reading the list afterwards can say why one row sits above another.
 *
 * Within a tier it stays `rank` rather than confusion rate on purpose. Someone
 * who mixes up major and minor *and* the elevenths should fix major and minor
 * first, whichever they get wrong more often, because everything else is built
 * on it.
 */
export function drillProgress(
  stats: ExerciseStats,
  chordStats: ExerciseStats = {},
): DrillProgress[] {
  const records = itemsInNamespace(stats, DRILL_NAMESPACE)

  const entries = DRILLS.map((drill) => {
    const record = records[drill.id] ?? null
    if (record && record.recent.length > 0) {
      const bucket = mastery(record)
      return { drill, record, evidence: { kind: 'drilled', bucket }, bucket }
    }

    const rate = pairConfusionRate(chordStats, drill)
    if (rate === null) {
      return { drill, record, evidence: { kind: 'unknown' }, bucket: null }
    }
    if (rate >= CONFUSION_THRESHOLD) {
      return { drill, record, evidence: { kind: 'confused' }, bucket: null }
    }
    // Told apart in ordinary play often enough that being made to drill them
    // would be busywork. Filed as solid without ever having been opened.
    return {
      drill,
      record,
      evidence: { kind: 'no-confusion' },
      bucket: 'solid',
    }
  }) as DrillProgress[]

  return entries.sort(
    (a, b) => tier(a) - tier(b) || a.drill.rank - b.drill.rank,
  )
}

/** Confused pairs before unknown ones; anything already filed sorts last. */
function tier(entry: DrillProgress): number {
  if (entry.evidence.kind === 'confused') return 0
  if (entry.evidence.kind === 'unknown') return 1
  return 2
}
