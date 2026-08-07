import { ListCard, ListRow } from '../components'
import { chordDrillStatsStore, usePersisted } from '../settings'
import {
  DRILL_LENGTH,
  drillChords,
  drillProgress,
  type DrillProgress,
  type Mastery,
} from '../exercises'

/**
 * The drills, most fundamental first, grouped by how each has gone.
 *
 * Ordered by how basic the distinction is rather than by how hard it is, so
 * working down the list builds on what is already there. Untried drills stay in
 * that order in a list of their own rather than being mixed into the buckets —
 * an untried drill is not a weak one, and putting it under *needs work* would
 * be a verdict on evidence nobody has collected.
 *
 * Nothing here is a prerequisite for anything. A user who can already hear
 * major against minor can skip it, and #118's second half will mark that sort
 * of thing solid from ordinary play without them having to.
 */
export function DrillsScreen({ onStart }: { onStart: (id: string) => void }) {
  const [stats] = usePersisted(chordDrillStatsStore)
  const progress = drillProgress(stats)

  const tried = progress.filter((entry) => entry.bucket !== null)
  const untried = progress.filter((entry) => entry.bucket === null)

  return (
    <div className="flex flex-col gap-6 p-4">
      {BUCKET_ORDER.map((bucket) => {
        const inBucket = tried.filter((entry) => entry.bucket === bucket)
        if (inBucket.length === 0) return null

        return (
          <ListCard key={bucket} title={BUCKET_TITLES[bucket]}>
            {inBucket.map((entry) => (
              <DrillRow key={entry.drill.id} entry={entry} onStart={onStart} />
            ))}
          </ListCard>
        )
      })}

      {untried.length > 0 && (
        <ListCard
          title={tried.length > 0 ? 'Not tried yet' : undefined}
          footer={`Each drill is ${DRILL_LENGTH} questions on those two chords and nothing else. Start anywhere — they are ordered by how fundamental the distinction is, not by how hard.`}
        >
          {untried.map((entry) => (
            <DrillRow key={entry.drill.id} entry={entry} onStart={onStart} />
          ))}
        </ListCard>
      )}
    </div>
  )
}

const BUCKET_TITLES: Record<Mastery, string> = {
  learning: 'Needs work',
  practising: 'Getting there',
  solid: 'Solid',
}

const BUCKET_ORDER: Mastery[] = ['learning', 'practising', 'solid']

/**
 * One drill: the two chords, and what to listen for.
 *
 * The pair names *are* the title — "Major Triad vs Minor Triad" says what the
 * drill is better than any name for it would. Underneath, the one line that
 * says what actually differs, which is the part that turns ten repetitions into
 * practice rather than a quiz.
 */
function DrillRow({
  entry,
  onStart,
}: {
  entry: DrillProgress
  onStart: (id: string) => void
}) {
  const [first, second] = drillChords(entry.drill)

  return (
    <ListRow
      alignFirstLine
      chevron
      onClick={() => onStart(entry.drill.id)}
      label={
        <>
          <span className="block">
            {first.name} vs {second.name}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-content-muted">
            {entry.drill.listenFor}
          </span>
        </>
      }
    />
  )
}
