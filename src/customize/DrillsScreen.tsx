import { ListCard, ListRow } from '../components'
import {
  chordDrillStatsStore,
  chordStatsStore,
  usePersisted,
} from '../settings'
import {
  DRILL_LENGTH,
  drillChords,
  drillProgress,
  type DrillEvidence,
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
  const [chordStats] = usePersisted(chordStatsStore)
  const progress = drillProgress(stats, chordStats)

  const filed = progress.filter((entry) => entry.bucket !== null)
  const open = progress.filter((entry) => entry.bucket === null)

  return (
    <div className="flex flex-col gap-6 p-4">
      {BUCKET_ORDER.map((bucket) => {
        const inBucket = filed.filter((entry) => entry.bucket === bucket)
        if (inBucket.length === 0) return null

        return (
          <ListCard key={bucket} title={BUCKET_TITLES[bucket]}>
            {inBucket.map((entry) => (
              <DrillRow key={entry.drill.id} entry={entry} onStart={onStart} />
            ))}
          </ListCard>
        )
      })}

      {open.length > 0 && (
        <ListCard
          title={filed.length > 0 ? 'Worth doing' : undefined}
          footer={`Each drill is ${DRILL_LENGTH} questions on those two chords and nothing else. Anything the exercise has already seen you mix up is at the top; the rest are in order of how fundamental the distinction is, not how hard.`}
        >
          {open.map((entry) => (
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
          {WHY[entry.evidence.kind] && (
            <span className="mt-0.5 block text-xs leading-snug text-accent">
              {WHY[entry.evidence.kind]}
            </span>
          )}
        </>
      }
    />
  )
}

/**
 * Why a row is where it is, when the reason is not "you did this drill".
 *
 * A pair marked solid without ever being opened is the one thing on this screen
 * a user would otherwise have to guess at, and guessing wrong means concluding
 * the app has lost their record. So it says where it came from.
 *
 * Nothing is said for `unknown` — that is the ordinary state of the list, and a
 * line under every untouched row explaining that nothing is known yet would be
 * noise on the screen's most common case.
 */
const WHY: Record<DrillEvidence['kind'], string | null> = {
  drilled: null,
  unknown: null,
  confused: 'The exercise has seen you mix these two up.',
  'no-confusion': 'You already tell these apart in the exercise.',
}
