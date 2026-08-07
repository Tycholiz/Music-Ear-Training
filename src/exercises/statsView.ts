import {
  CADENCES,
  chordById,
  degreeLabel,
  isKnownInterval,
  numeralById,
  numeralsInCustomizeOrder,
  scaleById,
  scalesByDifficulty,
  type Degree,
} from '../theory'
import {
  CHORD_PLAY_MODES,
  INTERVAL_PLAY_MODES,
  itemsInNamespace,
  type ExerciseStats,
  type ItemStats,
} from '../settings'
import { smoothedAccuracy } from './adaptive'
import { BASS_AS_ROOT } from './progressionVoicing'
import { CHORD_PLAY_MODE_NAMES, INVERSION_NAMES } from './chordValidation'
import {
  PLAY_MODE_NAMES,
  directedIntervalName,
  parseIntervalValue,
} from './intervalValidation'
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
 * ## One flat list of sections, in the order they are shown
 *
 * Sections used to come in two tiers — a single `answer` that was always first,
 * then the breakdowns after it — and the tier decided the order. That held
 * until progressions needed the *first chord* above the per-chord buckets: the
 * lead measure there is not the bucketed one, and no amount of reordering
 * within a tier can say so.
 *
 * So order is explicit and the tiers are now one flag. `bucketed` marks the
 * measure worth splitting into learning / practising / solid — the thing the
 * user names, usually, though melody marks *how a note arrived* instead,
 * because which degree it was matters less there than whether it was a step or
 * a leap. Every other section is a condition the question was asked under:
 * which inversion, which play mode, which cadence, how far the root moved.
 * Those say *why* a bucketed figure looks the way it does — "root position 88%,
 * second inversion 41%" is the whole difficulty of chord root in one line — but
 * bucketing them as though the user were learning "2nd inversion" would be
 * nonsense, so they stay a plain list.
 *
 * **Exactly one section per view is bucketed**, asserted by test rather than by
 * the type. Two bucketed sections would put two sets of needs work / getting
 * there / solid on one screen with nothing to say which was which, and a screen
 * with none would lead with a list and never name what the user is bad at.
 *
 * Whether a section diagnoses — "often mistaken for …" — is a separate question
 * again, and one each section answers for itself with `showsConfusions`.
 * Bucketing does not imply it, and a plain list can still want it: the first
 * chord of a progression is a list, and what it gets mistaken for is the most
 * useful thing on the screen.
 */

export interface StatsSection {
  /** The namespace its items live under, without the colon. */
  namespace: string
  title: string
  /** Turns the value after the colon into something a musician reads. */
  label: (value: string) => string
  /**
   * Split into learning / practising / solid rather than listed flat.
   *
   * One section per view, and the one the screen is really about.
   */
  bucketed?: boolean
  /**
   * Whether a stored value still belongs on this screen at all.
   *
   * For when the *shape* of a value changes rather than its namespace. A
   * namespace change orphans old records for free — nothing reads them — but a
   * value that gains a field cannot do that, because the new records live
   * alongside the old under the same prefix.
   *
   * Intervals are the case: `interval:10` became `interval:10-asc`, and the
   * bare one is an average of ascending and descending with no way to say now
   * which it was. Left in, it would sit in a bucket next to the two rows that
   * replaced it, reading as a third finding about a third skill.
   *
   * Only rows are filtered. A confusion naming an old value is still fine —
   * `label` stays lenient — because naming what was pressed does not claim the
   * record was about one direction.
   *
   * Everything is kept by default.
   */
  recognizes?: (value: string) => boolean
  /**
   * Whether "often mistaken for …" is worth showing here.
   *
   * Declared rather than inferred from what happens to be in the store. It was
   * inferred once — a section showed confusions if the exercise recorded an
   * `answered` — and the two promptly disagreed: melody stopped recording them
   * for degrees, and every record already written kept showing them until its
   * window rolled over. A screen that reports whatever it finds cannot be
   * changed by changing what is written, only by waiting.
   *
   * Off by default, so a namespace has to *ask* to be diagnosed.
   */
  showsConfusions?: boolean
  /**
   * How the rows are ordered.
   *
   * `'worst-first'` by default, because the point of the screen is what to work
   * on next.
   *
   * **A list the user already knows in a fixed order is shown in that order
   * instead.** Inversions were the first of these — root position, 1st, 2nd is
   * a sequence the reader has in their head, and shuffling it by accuracy makes
   * a three-row list something you parse rather than scan. It generalises: where
   * a statistic corresponds to a list a Customize screen shows, the two agree,
   * so a user who has just chosen four cadences does not then meet them shuffled.
   * The sequence also carries meaning worst-first destroys — inversion accuracy
   * usually falls off as the bass climbs, and that shape is only visible in
   * order.
   *
   * An explicit array is the canonical sequence, taken from wherever the
   * Customize screen gets its own. Values missing from it sort after everything
   * in it, worst-first among themselves — a record from a removed cadence or a
   * hand-edited blob ends up last rather than silently first.
   *
   * `'natural'` is numeric-then-lexicographic, for values that *are* their own
   * order: inversion `0 1 2`, scale degree `0…11`. Writing those out as an array
   * would be restating the number line.
   */
  order?: 'worst-first' | 'natural' | readonly string[]
}

export interface StatsView {
  /** Every section, in the order the screen shows them. */
  sections: StatsSection[]
}

/** The one bucketed section — what this screen is really measuring. */
export function bucketedSection(view: StatsView): StatsSection {
  const found = view.sections.find((section) => section.bucketed)
  if (!found) throw new Error('a stats view needs a bucketed section')
  return found
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
  title: 'Naming each chord',
  label: safely((id) => chordById(id).name),
  bucketed: true,
  showsConfusions: true,
}

const inversionBreakdown: StatsSection = {
  namespace: 'inversion',
  title: 'By inversion',
  label: (value) => INVERSION_NAMES[Number(value)] ?? value,
  order: 'natural',
}

/**
 * Intervals lead with the interval *and the direction it was heard in*.
 *
 * A descending minor 7th and an ascending one are two skills. Someone can name
 * one every time and lose the other, and the pooled figure described neither —
 * while the play-mode breakdown could say ascending was going badly without
 * saying *which interval* was the problem in it.
 *
 * Which means the buckets can now disagree with themselves about one interval,
 * and should: "Minor 7th (desc)" under Solid and "Minor 7th (asc)" under Needs
 * work is the finding, not a contradiction.
 *
 * The play-mode breakdown stays. Direction is three values — up, down, together
 * — and the play mode is five, so what it still says is whether the harmonic
 * confirmation after an ascending pair is doing any work. That is a real
 * question about how a user hears, and nothing above it can answer.
 */
export const INTERVAL_STATS_VIEW: StatsView = {
  sections: [
    {
      namespace: 'interval',
      title: 'Naming each interval',
      label: safely(directedIntervalName),
      // Two kinds of record get left off rather than shown.
      //
      // Ones written before direction was part of the identity are an average
      // of two skills, and there is no way to say now which one they were.
      //
      // Ones naming an interval the app no longer has — every `interval:0`, now
      // that the Unison is gone — would otherwise fall through `safely` and
      // print their own raw id.
      recognizes: (value) => {
        const { semitones, direction } = parseIntervalValue(value)
        return direction !== null && isKnownInterval(semitones)
      },
      bucketed: true,
      showsConfusions: true,
    },
    {
      namespace: 'mode',
      title: 'By play mode',
      label: (value) => PLAY_MODE_NAMES[value as 'ascending'] ?? value,
      order: INTERVAL_PLAY_MODES,
    },
  ],
}

export const CHORD_STATS_VIEW: StatsView = {
  sections: [
    chordAnswer,
    inversionBreakdown,
    {
      namespace: 'mode',
      title: 'By play mode',
      label: (value) => CHORD_PLAY_MODE_NAMES[value] ?? value,
      order: CHORD_PLAY_MODES,
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
  sections: [
    // Not `chordAnswer`: same namespace and label, but this exercise is
    // self-graded, so there is no wrong answer and nothing to diagnose. Sharing
    // the object would have it opting into a confusion it can never have.
    { ...chordAnswer, showsConfusions: false },
    inversionBreakdown,
  ],
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
 * Which is why the degree breakdown covers the **opening note only**. That is
 * the one position where naming a degree is the actual task; everywhere else
 * the ear is following a step or a leap and the degree it lands on is mostly a
 * consequence of where it started. Recorded across all positions, the figure
 * averaged the two skills and described neither — so the title says which one
 * it is, and the recording matches.
 *
 * No confusions on it either. Melodic misses land on a neighbouring degree for
 * nearly everyone, so that pairing reads as a finding while saying the same
 * thing about every user.
 */
export const MELODY_STATS_VIEW: StatsView = {
  sections: [
    {
      namespace: 'motion',
      title: 'How each note arrives',
      label: (value) => MOTION_NAMES[value] ?? value,
      bucketed: true,
      showsConfusions: true,
    },
    {
      namespace: 'degree',
      title: 'First note, by degree',
      label: safely((value) => degreeLabel(Number(value) as Degree)),
      // Degrees are semitones from the tonic, so counting up *is* the ladder
      // the Featured Degrees screen offers them on. An explicit array here
      // would be restating the number line.
      order: 'natural',
    },
    {
      namespace: 'scale',
      title: 'By scale',
      label: safely((id) => scaleById(id).name),
      order: scalesByDifficulty().map((scale) => scale.id),
    },
  ],
}

/**
 * How the root moved, as analysed.
 *
 * Roots are pitch classes, so the far half of the circle is named by its
 * descending complement — which is how these moves are spoken about. `I` to
 * `vi` is nine semitones up and every musician calls it down a third.
 */
const ROOT_MOVEMENT_NAMES: Record<string, string> = {
  same: 'Root stays, quality changes',
  'up-half-step': 'Root moves up a half step',
  'up-whole-step': 'Root moves up a whole step',
  'up-third': 'Root moves up a third',
  'up-fourth': 'Root moves up a fourth',
  tritone: 'Root moves by a tritone',
  'up-fifth': 'Root moves up a fifth',
  'down-third': 'Root moves down a third',
  'down-whole-step': 'Root moves down a whole step',
  'down-half-step': 'Root moves down a half step',
}

/**
 * The same transitions as heard rather than analysed.
 *
 * Undirected, unlike the root: the bass is a sounding note, so a fourth up and
 * a fourth down are the same distance travelled and the ear meets them as one
 * move. The root is a pitch class and its direction is a fact about the
 * harmony, which is why that list is directed and this one is not.
 */
const BASS_MOVEMENT_NAMES: Record<string, string> = {
  same: 'Bass stays put',
  'half-step': 'Bass moves by a half step',
  'whole-step': 'Bass moves by a whole step',
  third: 'Bass moves by a third',
  fourth: 'Bass moves by a fourth',
  tritone: 'Bass moves by a tritone',
  fifth: 'Bass moves by a fifth',
  'sixth-or-more': 'Bass moves by a sixth or more',
}

/** Names a numeral, or the bass-reading failure that wears a numeral's clothes. */
const numeralLabel = (id: string) =>
  id === BASS_AS_ROOT
    ? 'the chord on the bass note'
    : safely((value) => numeralById(value).label)(id)

/**
 * Five questions about a progression, each with a different answer.
 *
 * *Which chord opened it* comes first. *Which chord was that, once the
 * progression is under way* is the bucketed measure. *How the harmony moved* is
 * the ear's actual work in between, asked twice — once by root and once by
 * bass. *How it ended* is the cadence.
 *
 * ## Root movement and bass movement are two sections, not one
 *
 * They were one list called "By root and bass movement", which is two findings
 * wearing one heading. Analysing where the harmony went and hearing where the
 * bottom note went are different skills, and they only *disagree* when an
 * inversion has put something other than the root underneath — which is the
 * hardest case in this exercise and the one worth being able to see on its own.
 * Interleaved worst-first, the two sets of rows also had to be read prefix by
 * prefix to work out which measure each belonged to.
 *
 * Split by namespace rather than by filtering one list in the view, so the
 * store groups them the way the screen shows them and `statsRows` needs to know
 * nothing about it. The direction prefix that used to live in the value —
 * `movement:root-up-fourth` — is now the namespace, `root-movement:up-fourth`.
 *
 * These two are the only sections here still ordered worst-first. No Customize
 * screen offers movements — they are a property of the progression that comes
 * out of it, not something switched on — so there is no order to mirror, and
 * nothing like the inversion list's falling-off shape that a fixed sequence
 * would preserve. What to work on next is the useful order.
 *
 * ## The first chord leads, and is not in the buckets
 *
 * These are two skills, and one figure across both describes neither. The first
 * chord has nothing before it, so it is heard by its function against the key
 * alone. Every later chord can lean on the one before it as a landmark, which
 * is a different task with a different fix — mistaking `V` for `I` when it
 * opens is a lost tonic; mistaking `vi` for `I` in the middle is two chords
 * that both sound like home; mistaking `ii` for `IV` is two chords sharing two
 * notes and a function.
 *
 * The first chord was already separated out, as a breakdown *below* the
 * buckets — which put the harder, more diagnostic measure underneath a bucketed
 * figure that was quietly averaging it in. Now it leads, and the buckets say in
 * their title that they start from the second chord. The recording side agrees:
 * `numeral` is written only from index 1 on (`routes/Progressions.tsx`).
 *
 * Records written before that split still have openings folded into `numeral`,
 * and records written before the movement split sit under a `movement`
 * namespace nothing reads any more. Neither is migrated. The rolling window is
 * twenty attempts deep and clears itself within a session or two of practice;
 * rewriting history to satisfy a heading would be inventing attempts that were
 * never separately measured, and the orphaned `movement:` keys are a few
 * hundred bytes that no section can surface.
 *
 * ## No breakdown by position
 *
 * Deliberately. A wrong press ends the attempt, so chord four would only ever
 * be recorded on progressions where one to three had already gone right, and
 * "Chord 4: 90%" would mean "when I had already got the first three, I usually
 * got the fourth" — a tautology wearing the clothes of a finding.
 */
export const PROGRESSION_STATS_VIEW: StatsView = {
  sections: [
    {
      namespace: 'opening',
      title: 'First chord recognition',
      label: numeralLabel,
      // A plain list that diagnoses. Bucketing is not what makes confusions
      // worth showing — "you hear the opening `V` as `I`" is the single most
      // useful line on this screen, and it belongs to the section that fills
      // one record per progression rather than one per chord.
      showsConfusions: true,
      // The Customize screen's order, flattened out of its section headings.
      // Which chord is worst at opening is what the confusion lines say; where
      // a numeral *is* in the list is what the user needs to find it.
      order: numeralsInCustomizeOrder().map((numeral) => numeral.id),
    },
    {
      namespace: 'numeral',
      // Says which chords it covers. "Naming each chord" over a list that
      // excludes the opening is a heading that contradicts its own contents.
      title: 'Naming each chord after the first',
      label: numeralLabel,
      bucketed: true,
      showsConfusions: true,
    },
    {
      namespace: 'root-movement',
      title: 'By root movement',
      label: (value) => ROOT_MOVEMENT_NAMES[value] ?? value,
    },
    {
      namespace: 'bass-movement',
      title: 'By bass movement',
      label: (value) => BASS_MOVEMENT_NAMES[value] ?? value,
    },
    {
      namespace: 'cadence',
      title: 'By cadence',
      label: (value) => CADENCE_NAMES[value as 'authentic'] ?? value,
      order: CADENCES,
    },
    // Heard but never answered — `I⁶` is still `I` — so this is the one
    // dimension a user cannot see going wrong from the pad alone. Shared with
    // the chord exercises rather than restated, so the ordering and the naming
    // cannot drift between screens showing the same thing.
    inversionBreakdown,
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
    .filter(([id]) => section.recognizes?.(id) ?? true)
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
    .sort((a, b) => compare(a, b, section.order))
}

function compare(
  a: StatsRow,
  b: StatsRow,
  order: StatsSection['order'],
): number {
  if (order === 'natural') return naturally(a.id, b.id)
  if (Array.isArray(order)) return canonically(a, b, order)
  return worstFirst(a, b)
}

function worstFirst(a: StatsRow, b: StatsRow): number {
  return smoothedAccuracy(a.item) - smoothedAccuracy(b.item)
}

/**
 * Compare two item values the way a reader would order them.
 *
 * Numeric when both sides are numbers, so `inversion:2` follows `inversion:1`
 * rather than sorting as text and putting `10` between `1` and `2`.
 */
function naturally(a: string, b: string): number {
  const left = Number(a)
  const right = Number(b)
  const numeric = !Number.isNaN(left) && !Number.isNaN(right)
  return numeric ? left - right : a.localeCompare(b)
}

/**
 * Position in a canonical sequence, with anything unlisted pushed to the end.
 *
 * Unlisted values sort worst-first among themselves rather than in whatever
 * order the store happened to yield them, so the fallback is the same rule the
 * rest of the screen uses. They go *after* rather than before because they are
 * the anomalies — a record from a cadence since removed, or a hand-edited
 * blob — and leading with an anomaly reads as a finding about the user.
 */
function canonically(
  a: StatsRow,
  b: StatsRow,
  order: readonly string[],
): number {
  const left = order.indexOf(a.id)
  const right = order.indexOf(b.id)

  if (left === -1 && right === -1) return worstFirst(a, b)
  if (left === -1) return 1
  if (right === -1) return -1
  return left - right
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

/**
 * There is no cap on how many are named, and there does not need to be.
 *
 * There was one — two — and the reason was the shape of the sentence they were
 * rendered as: "often mistaken for A and B and C and D" stops being readable at
 * a glance, so the third commonest mistake was dropped for costing more than it
 * told anyone. Set one per line, that reason is gone; four short lines under a
 * row scan fine.
 *
 * What remains is the threshold, and it bounds the list on its own. An answer
 * has to be `CONFUSION_THRESHOLD` of *attempts* to appear, so at most
 * `1 / CONFUSION_THRESHOLD` can ever qualify — and in practice far fewer, since
 * they also have to fit inside the share of attempts that went wrong at all. An
 * item at 40% accuracy has 60% to divide up, which is four answers at the very
 * most and two or three in anything real.
 *
 * Which leaves the count saying something a cap would have hidden: a row naming
 * one mistake is a systematic confusion, and a row naming four is a user
 * guessing. Those want different practice, and truncating to two made them look
 * the same.
 */

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
  // The section decides, not the record. A namespace that has stopped
  // recording answers still has them in every window written before it
  // stopped, and reading the store would keep reporting them for another
  // twenty questions.
  if (!section.showsConfusions) return []

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
    .map(([answered]) => section.label(answered))
}

/** Whether anything at all has been recorded for this exercise. */
export function hasAnyStats(stats: ExerciseStats): boolean {
  return Object.keys(stats).length > 0
}
