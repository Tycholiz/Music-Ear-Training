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
 * "Diminished 41%" tells a user to practise more, which they knew. "You hear
 * diminished as minor" tells them what to listen for. So a confusion sits
 * directly under the row it belongs to rather than in a section of its own,
 * where it would be a second list to cross-reference against the first.
 *
 * Chord root shows none and should not: it is self-graded, so there is no
 * wrong answer to name.
 *
 * ## Nothing prints a percentage on thin evidence
 *
 * Two out of three is not 67%. A statistics screen that says so is worse than
 * no screen at all, because the user acts on it. Below the threshold a row says
 * how many more attempts it needs, which is both honest and a nudge.
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
      <AnswerSection stats={stats} section={view.answer} />

      {view.breakdowns.map((section) => (
        <BreakdownSection
          key={section.namespace}
          stats={stats}
          section={section}
        />
      ))}

      <ListCard footer="Clears this exercise's record only. Your score is separate, and adaptive difficulty reads this — so resetting it also starts that over.">
        <ListRow label="Reset Statistics" destructive onClick={onReset} />
      </ListCard>
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
 * The thing the user names, in three buckets.
 *
 * Three short lists rather than one table of twenty percentages, because a
 * phone shows about six rows and the ones that matter are all at one end. The
 * buckets use the same smoothed accuracy adaptive difficulty weights by, so
 * "Needs work" is exactly what the exercise has been asking more often — two
 * definitions of struggling would have the app contradicting itself.
 */
function AnswerSection({
  stats,
  section,
}: {
  stats: ExerciseStats
  section: StatsSection
}) {
  const rows = statsRows(stats, section)
  if (rows.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}

/** A condition the question was asked under — a plain worst-first list. */
function BreakdownSection({
  stats,
  section,
}: {
  stats: ExerciseStats
  section: StatsSection
}) {
  const rows = statsRows(stats, section)
  if (rows.length === 0) return null

  return (
    <ListCard title={section.title}>
      {rows.map((row) => (
        <StatRow key={row.id} row={row} section={section} />
      ))}
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
              Heard as {confusions[0].label}
              {confusions[0].count > 1 && ` (×${confusions[0].count})`}
            </span>
          )}
        </>
      }
      value={<Accuracy row={row} />}
    />
  )
}

function Accuracy({ row }: { row: StatsRow }) {
  if (row.accuracy === null) {
    return (
      <span className="text-sm text-content-muted">
        {row.moreNeeded} more to go
      </span>
    )
  }

  return (
    <span className="tabular-nums">
      {Math.round(row.accuracy * 100)}%{' '}
      <span className="text-sm text-content-muted">of {row.item.attempts}</span>
    </span>
  )
}
