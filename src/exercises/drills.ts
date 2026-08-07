import { chordById, type Chord } from '../theory'
import type { ChordSettings, ExerciseStats, ItemStats } from '../settings'
import { itemsInNamespace } from '../settings'
import { mastery, type Mastery } from './statsView'

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

export interface DrillProgress {
  drill: Drill
  /** Null until the drill has been finished at least once. */
  record: ItemStats | null
  /** Null until there is a record to judge. */
  bucket: Mastery | null
}

/**
 * Every drill, most fundamental first, with whatever is known about each.
 *
 * Ordered by `rank` alone for now. Blending in what the user's ordinary chord
 * play already says about each pair is #118's second half and wants the
 * confusion records, which this deliberately does not read yet.
 */
export function drillProgress(stats: ExerciseStats): DrillProgress[] {
  const records = itemsInNamespace(stats, DRILL_NAMESPACE)

  return [...DRILLS]
    .sort((a, b) => a.rank - b.rank)
    .map((drill) => {
      const record = records[drill.id] ?? null
      return {
        drill,
        record,
        bucket: record && record.recent.length > 0 ? mastery(record) : null,
      }
    })
}
