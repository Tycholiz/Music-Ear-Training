import { ListCard, ListRow } from '../components'
import {
  usePersisted,
  type ExerciseStats,
  type PersistedStore,
} from '../settings'
import {
  confusionsFor,
  hasAnyStats,
  mastery,
  reportableRows,
  statsRows,
  type Mastery,
  type StatsRow,
  type StatsSection,
  type StatsView,
} from '../exercises'

/**
 * What the user is actually bad at.
 *
 * Not a scoreboard — the exercise header already carries the score. This
 * answers *which* things go wrong and, where the exercise can know it, what
 * they are being mistaken for.
 *
 * ## Confusions are the only diagnostic thing here
 *
 * "Diminished 41%" tells a user to practise more, which they knew. "Often
 * mistaken for Minor Triad" tells them what to listen for. So it sits directly
 * under the row it belongs to rather than in a section of its own, where it
 * would be a second list to cross-reference against the first.
 *
 * Named rather than counted, and at most two. A count invites arithmetic
 * against a total that is not on screen, and the threshold in `confusionsFor`
 * has already answered the only question a count would settle — whether this
 * happens often enough to be worth saying. Two, because a row that grows to
 * four clauses stops being readable at a glance, and the third commonest
 * mistake is not what anyone came to find out.
 *
 * Chord root shows none and should not: it is self-graded, so there is no
 * wrong answer to name.
 *
 * ## Every section is a heading with cards under it
 *
 * One shape for all of them. The bucketed section used to get a real heading
 * with `Needs work` / `Getting there` / `Solid` beneath it, while every other
 * section was a bare card whose only label was the small uppercase strip a
 * `ListCard` draws — so two things at the same level in the model rendered a
 * tier apart, and the reader had no way to see that "First chord recognition"
 * and "Naming each chord after the first" are peers rather than one nested in
 * the other.
 *
 * Now a section is always `<h2>` plus cards. The buckets are cards *within* a
 * section, which is what they always were, and the `ListCard` strip is free to
 * mean subsection everywhere it appears.
 *
 * ## An item with too little evidence is not shown at all
 *
 * Two out of three is not 67%, so nothing is reported below
 * `MIN_ATTEMPTS_TO_REPORT`. Thin items are left off entirely and counted in one
 * line underneath: the user does not need to know how many more attempts each
 * one wants, only that some things have not been practised enough to say
 * anything about yet.
 *
 * **Bucketing and reporting have to agree about what counts as enough.**
 * `mastery` smooths, so it always produces an answer — bucket a thin item and
 * it lands under "Getting there" with no percentage beside it, which is a
 * verdict delivered on evidence the same screen is refusing to summarise. No
 * wording fixes that; the two have to use one threshold, and `reportableRows`
 * is where it is applied.
 *
 * **Say what a number counts.** `{n} more to go` never said more of *what*,
 * and read as progress toward the next bucket rather than toward a figure
 * existing at all. `{percent}% of {n}` parses like a fraction — "40% of 5" is
 * how you write "40% of 5 dollars".
 */
export function StatisticsScreen({
  store,
  view,
  onReset,
}: {
  store: PersistedStore<ExerciseStats>
  view: StatsView
  onReset: () => void
}) {
  const [stats] = usePersisted(store)

  if (!hasAnyStats(stats)) {
    return (
      <div className="flex flex-col gap-4 p-8 text-center">
        <p className="text-content-muted">
          Nothing recorded yet. Answer a few questions and this will show which
          ones are giving you trouble — and what you are mistaking them for.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {view.sections.map((section) => (
        <Section key={section.namespace} stats={stats} section={section} />
      ))}

      <ListCard footer="Clears this exercise's record only. Your score is separate, and adaptive difficulty reads this — so resetting it also starts that over.">
        <ListRow label="Reset Statistics" destructive onClick={onReset} />
      </ListCard>
    </div>
  )
}

/**
 * One section: a heading, then either mastery buckets or a plain list.
 *
 * A section with no data at all is not rendered — there is nothing to promise
 * yet, and a heading for a namespace the user has never touched is a gap they
 * have to work out the meaning of. A section that *has* data but none of it
 * over the reporting threshold keeps its heading and says so; see `PlainList`.
 */
function Section({
  stats,
  section,
}: {
  stats: ExerciseStats
  section: StatsSection
}) {
  const all = statsRows(stats, section)
  if (all.length === 0) return null

  const rows = reportableRows(all)
  const body = section.bucketed ? (
    <Buckets rows={rows} section={section} thin={all.length - rows.length} />
  ) : (
    <PlainList rows={rows} section={section} measuring={all.length} />
  )

  return (
    <div className="flex flex-col gap-3">
      <h2 className="px-1 text-base font-semibold">{section.title}</h2>
      {body}
    </div>
  )
}

const BUCKET_TITLES: Record<Mastery, string> = {
  learning: 'Needs work',
  practising: 'Getting there',
  solid: 'Solid',
}

/** The order they are shown in: the useful one first. */
const BUCKET_ORDER: Mastery[] = ['learning', 'practising', 'solid']

/**
 * The measure this screen is about, in three subsections.
 *
 * Three short lists rather than one table of twenty percentages, because a
 * phone shows about six rows and the ones that matter are all at one end. The
 * buckets use the same smoothed accuracy adaptive difficulty weights by, so
 * "Needs work" is exactly what the exercise has been asking more often — two
 * definitions of struggling would have the app contradicting itself.
 */
function Buckets({
  rows,
  section,
  thin,
}: {
  rows: readonly StatsRow[]
  section: StatsSection
  /** How many items have data but not enough of it to report. */
  thin: number
}) {
  return (
    <>
      {BUCKET_ORDER.map((bucket) => {
        const inBucket = rows.filter((row) => mastery(row.item) === bucket)
        if (inBucket.length === 0) return null

        return (
          <ListCard key={bucket} title={BUCKET_TITLES[bucket]}>
            {inBucket.map((row) => (
              <StatRow key={row.id} row={row} section={section} />
            ))}
          </ListCard>
        )
      })}

      {thin > 0 && (
        <p className="px-4 text-sm text-content-muted">
          {rows.length === 0
            ? 'Nothing has been answered enough times yet. Keep practising and your statistics will appear here.'
            : `${thin} other${thin === 1 ? '' : 's'} need${
                thin === 1 ? 's' : ''
              } more practice before statistics can show.`}
        </p>
      )}
    </>
  )
}

/**
 * Everything that is not the bucketed measure — a plain worst-first list.
 *
 * A section with data but nothing over the threshold keeps its heading and says
 * so, rather than disappearing. Vanishing silently was defensible while every
 * such section filled at one record per question, but melody's opening degrees
 * fill at one per *melody* — so the most useful section on that screen was also
 * the last to appear, and until it did the screen said "you struggle with the
 * first note" and nothing about which one. Progressions' first chord fills at
 * the same rate and now leads the screen, which makes the placeholder load
 * bearing rather than an edge case.
 *
 * A heading that promises a figure later is worth more than a gap the reader
 * has to notice is missing.
 */
function PlainList({
  rows,
  section,
  measuring,
}: {
  rows: readonly StatsRow[]
  section: StatsSection
  /** How many items exist at all, reported while none can be summarised. */
  measuring: number
}) {
  return (
    <ListCard
      footer={
        rows.length === 0
          ? 'Not enough yet — keep practising and this will fill in.'
          : undefined
      }
    >
      {rows.length === 0 ? (
        <ListRow
          label={
            <span className="text-content-muted">
              {measuring} still being measured
            </span>
          }
        />
      ) : (
        rows.map((row) => <StatRow key={row.id} row={row} section={section} />)
      )}
    </ListCard>
  )
}

function StatRow({ row, section }: { row: StatsRow; section: StatsSection }) {
  const confusions = confusionsFor(row, section)

  return (
    <ListRow
      label={
        <>
          <span className="block">{row.label}</span>
          {confusions.length > 0 && (
            <span className="block text-sm text-content-muted">
              Often mistaken for {confusions.join(' and ')}
            </span>
          )}
        </>
      }
      value={<Accuracy row={row} />}
    />
  )
}

/**
 * Only ever reached for a reportable row, so the null case cannot arrive here.
 *
 * "accurate" rather than a bare percentage or an attempt count beside it: the
 * threshold already guarantees the figure is worth trusting, so repeating the
 * sample size next to it adds a number the reader has to decide what to do
 * with and answers a question they were not asking.
 */
function Accuracy({ row }: { row: StatsRow }) {
  if (row.accuracy === null) return null

  return (
    <span className="tabular-nums">
      {Math.round(row.accuracy * 100)}% accurate
    </span>
  )
}
