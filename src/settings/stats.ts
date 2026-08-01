import type { PersistedStore } from './store'

/**
 * Per-item performance: which chords, intervals and numerals actually go
 * wrong, rather than how many.
 *
 * `Score` says the user is 71% and cannot say which chords the 29% were. Two
 * things need that missing detail — a statistics screen that answers "what am
 * I bad at", and adaptive difficulty that spends more reps on it — so the
 * record lives here once and both read it.
 *
 * ## The store stays dumb about music
 *
 * Items are namespaced string ids the *exercise* chooses: `chord:major-7th`,
 * `interval:6`, `numeral:V`, `cadence:authentic`, `inversion:1`. Nothing here
 * knows what any of those mean. Which dimensions are worth recording differs
 * by exercise — inversion is the whole difficulty of chord root and irrelevant
 * to intervals — and a store that tried to model all of them would model none
 * of them well. The namespace is what lets a reader group them again.
 *
 * ## Lifetime totals *and* a recent window
 *
 * They answer different questions. "You have done this 340 times" is not the
 * same claim as "you are getting it right lately", and a single
 * exponentially-decayed counter is an honest answer to neither — it reads as a
 * total that is somehow fractional and as a rate that quietly includes work
 * from months ago.
 *
 * So both are kept: lifetime counts for how much practice has happened, and
 * the last `RECENT_WINDOW` outcomes for how it is going now. Adaptive
 * difficulty should read the window; a statistics screen wants both.
 *
 * ## Nothing here reports an accuracy
 *
 * Deliberately. Two attempts out of three is not 67%, and every consumer needs
 * to smooth toward a prior or refuse to answer below a threshold. Doing that
 * *here* would bake one policy into both consumers, which want different ones:
 * a screen should decline to print a number, and a weighting function must
 * still return something for an item with no data at all. So this records, and
 * the callers decide what it means.
 */

/**
 * How many recent outcomes are kept per item.
 *
 * Long enough that a single unlucky guess does not read as a collapse, short
 * enough that a fortnight of improvement is visible. Also bounds storage: this
 * is the only field that grows with use rather than with the size of the
 * vocabulary.
 */
export const RECENT_WINDOW = 20

/** One tracked item — a chord, an interval, a cadence, an inversion. */
export interface ItemStats {
  /** Lifetime attempts, first tries only. */
  attempts: number
  /** Lifetime correct. */
  correct: number
  /**
   * The last `RECENT_WINDOW` outcomes, oldest first.
   *
   * Newest last so that reading it as a sequence goes forwards in time, which
   * is how anything charting it would want it.
   */
  recent: boolean[]
  /**
   * When this item was last attempted, ms since epoch.
   *
   * Nothing shows it yet. It is recorded from the start because weighted
   * selection can quietly starve an item, and without a timestamp there is no
   * way to notice that has happened.
   */
  lastSeen: number
  /**
   * What was answered instead, counted by answer id.
   *
   * Absent where there is no answer to record. Chord root is self-graded — the
   * user reports whether they had the note in mind, and there is no wrong
   * answer to name — so it records the chord and the inversion and leaves this
   * alone rather than inventing something.
   */
  confusions?: Record<string, number>
}

/** Every tracked item for one exercise, by namespaced id. */
export type ExerciseStats = Record<string, ItemStats>

export const EMPTY_ITEM_STATS: ItemStats = {
  attempts: 0,
  correct: 0,
  recent: [],
  lastSeen: 0,
}

/** One outcome to record. */
export interface Attempt {
  /** Namespaced item id, e.g. `chord:major-7th`. */
  item: string
  correct: boolean
  /**
   * What the user answered, when they got it wrong and an answer exists.
   *
   * Ignored on a correct attempt — "you confused X with X" is not a fact about
   * anything. Omitted entirely by self-graded exercises.
   */
  answered?: string
}

/**
 * Record one attempt against one item.
 *
 * Pure and returning a new object, like `recordGuess`, so the store's write
 * path stays the only thing that mutates.
 *
 * `now` is injected rather than read from `Date.now()` inside, because a test
 * that cannot control the clock ends up asserting nothing about `lastSeen`.
 */
export function recordAttempt(
  stats: ExerciseStats,
  { item, correct, answered }: Attempt,
  now: number = Date.now(),
): ExerciseStats {
  const previous = stats[item] ?? EMPTY_ITEM_STATS

  const updated: ItemStats = {
    attempts: previous.attempts + 1,
    correct: previous.correct + (correct ? 1 : 0),
    recent: [...previous.recent, correct].slice(-RECENT_WINDOW),
    lastSeen: now,
  }

  // Only a wrong answer says anything. Recording the right one would fill the
  // map with an item's own id and drown the pairs that mean something.
  const confusions =
    !correct && answered !== undefined
      ? {
          ...previous.confusions,
          [answered]: (previous.confusions?.[answered] ?? 0) + 1,
        }
      : previous.confusions

  if (confusions) updated.confusions = confusions

  return { ...stats, [item]: updated }
}

/** Record several outcomes at once, in order. */
export function recordAttempts(
  stats: ExerciseStats,
  attempts: readonly Attempt[],
  now: number = Date.now(),
): ExerciseStats {
  return attempts.reduce(
    (current, attempt) => recordAttempt(current, attempt, now),
    stats,
  )
}

/**
 * Record against a store, reading it fresh rather than from a render.
 *
 * The obvious thing — `setStats(recordAttempts(stats, …))` with `stats` from
 * `usePersisted` — is wrong twice over, and the melody screen fails loudly
 * enough to prove it.
 *
 * **It loses writes.** `stats` is the value *this render* was built with. Two
 * presses inside one React batch both read it, and the second write lands on
 * top of the first with the first attempt missing from it. That is the
 * "React batching loses presses" bug in the README, applied to a counter that
 * nobody would notice was short.
 *
 * **It loops.** The melody screen judges in an effect, so a write that changes
 * `stats` re-runs the effect that did the writing. Reading the store at write
 * time keeps `stats` out of the dependency array entirely, which is the honest
 * fix rather than a guard bolted on to break the cycle.
 *
 * Every subscriber still re-renders — the store notifies on write — so nothing
 * on screen goes stale from taking this path.
 */
export function recordInStore(
  store: PersistedStore<ExerciseStats>,
  attempts: readonly Attempt[],
  now: number = Date.now(),
): void {
  store.write(recordAttempts(store.read(), attempts, now))
}

/**
 * Build a namespaced item id.
 *
 * A function rather than template literals at each call site, so the separator
 * is decided once. It ends up in persisted keys, where changing it later means
 * every stored item silently stops matching.
 */
export function itemId(namespace: string, value: string | number): string {
  return `${namespace}:${value}`
}

/** The namespace an item id belongs to, for grouping a mixed record. */
export function itemNamespace(id: string): string {
  return id.slice(0, id.indexOf(':'))
}

/** Every item in one namespace, keyed by the value after the colon. */
export function itemsInNamespace(
  stats: ExerciseStats,
  namespace: string,
): Record<string, ItemStats> {
  const prefix = `${namespace}:`
  return Object.fromEntries(
    Object.entries(stats)
      .filter(([id]) => id.startsWith(prefix))
      .map(([id, item]) => [id.slice(prefix.length), item]),
  )
}
