import { itemId, type ExerciseStats, type ItemStats } from '../settings'
import type { Random } from './intervalQuestion'

/**
 * Spending more of a session on the things going worst.
 *
 * Left uniform, a pool drills what the user already knows: enable twenty
 * chords, know eighteen of them, and nine questions in ten are revision. This
 * reweights *how often* each item comes up. It never changes which items are
 * in the pool — that is the user's, set on a screen they can see, and a chord
 * they switched off appearing anyway would make the settings a lie. Widening
 * the pool automatically is #99 and is deliberately a separate thing.
 *
 * ## Smoothed, because small samples lie
 *
 * One correct answer is not mastery and one miss is not a weakness. Raw
 * accuracy says 100% and 0% to both, and a weighting built on it lurches after
 * every question. So accuracy is smoothed toward an even prior — Beta(1,1),
 * which is just "pretend you have already seen one of each outcome". An item
 * with a single hit reads as 2/3 rather than certain, and settles toward the
 * truth as evidence arrives.
 *
 * The prior also answers the awkward case cleanly. An item nothing is known
 * about scores 0.5 and lands mid-weight, which is what it deserves: it needs
 * *exposure*, and either extreme would be a guess about a user who has not
 * been asked yet.
 *
 * ## Read from the recent window, not the lifetime totals
 *
 * `ItemStats` keeps both. Adaptivity wants the window: someone who has fixed
 * their diminished chords should stop being drilled on them within a session
 * or two, and a lifetime count of four hundred attempts would take weeks to
 * move. The lifetime numbers are for the statistics screen, which is asking a
 * different question.
 */

/**
 * How much more often the weakest item comes up than the strongest.
 *
 * The cap matters as much as the weighting does. Someone who is bad at exactly
 * one chord should not meet it eight times in ten — that is tedious rather
 * than effective, and it is the standard way naive spaced repetition becomes
 * unbearable. Four to one is enough to feel targeted and mild enough that a
 * session still moves around.
 */
export const MAX_WEIGHT_RATIO = 4

/**
 * Smoothed accuracy over an item's recent window, in `[0, 1]`.
 *
 * An item with no record at all returns 0.5, the prior's own answer, which is
 * the honest thing to say about a user who has not been asked yet.
 */
export function smoothedAccuracy(item: ItemStats | undefined): number {
  const recent = item?.recent ?? []
  // Not `filter(Boolean)`: an attempt is an object now, and every object is
  // truthy, so that quietly scored a perfect record for everyone.
  const correct = recent.filter((attempt) => attempt.correct).length

  // Beta(1, 1): one imagined hit and one imagined miss.
  return (correct + 1) / (recent.length + 2)
}

/**
 * How heavily to favour an item, from 1 (going fine) to `MAX_WEIGHT_RATIO`.
 *
 * Never zero. An item that drops out of the pool stops generating evidence
 * about itself, so a lucky streak would freeze it out permanently and the
 * record would never learn it had gone stale — which is exactly the failure
 * `lastSeen` was recorded to make visible.
 */
export function itemWeight(item: ItemStats | undefined): number {
  const wrongness = 1 - smoothedAccuracy(item)
  return 1 + (MAX_WEIGHT_RATIO - 1) * wrongness
}

/**
 * Pick one option, favouring the ones going worst.
 *
 * `keyOf` maps an option to the namespaced id its record lives under, so the
 * caller decides which dimension is being weighted. Falls back to a uniform
 * pick when adaptivity is off or nothing has been recorded yet, which keeps
 * one code path rather than branching at every call site.
 */
export function pickAdaptive<T>(
  options: readonly T[],
  keyOf: (option: T) => string,
  stats: ExerciseStats | undefined,
  random: Random,
): T {
  if (!stats || options.length === 0) {
    return options[Math.floor(random() * options.length)]
  }

  const weights = options.map((option) => itemWeight(stats[keyOf(option)]))
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  let cursor = random() * total
  for (const [i, option] of options.entries()) {
    cursor -= weights[i]
    if (cursor < 0) return option
  }
  // Only reachable through floating-point drift at the very top of the range.
  return options[options.length - 1]
}

/** The namespaced key an interval's record lives under. */
export function intervalKey(semitones: number): string {
  return itemId('interval', semitones)
}

/** The namespaced key a chord's record lives under. */
export function chordKey(chordId: string): string {
  return itemId('chord', chordId)
}
