import { ListCard, ListRow } from '../components'
import { InstallCard } from '../pwa'

/**
 * Landing screen: the list of available exercises.
 *
 * The icons echo the reference design's staff notation — two stacked noteheads
 * for intervals, three for chords.
 */

const EXERCISES = [
  {
    to: '/intervals',
    label: 'Interval Ear Training',
    icon: <StaffIcon noteheads={2} />,
  },
  {
    to: '/chords',
    label: 'Chord Ear Training',
    icon: <StaffIcon noteheads={3} />,
  },
]

export default function Home() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="pt-8 pb-1 text-3xl font-bold">Ear Training</h1>

      <ListCard title="Exercises">
        {EXERCISES.map((exercise) => (
          <ListRow
            key={exercise.to}
            to={exercise.to}
            label={exercise.label}
            icon={exercise.icon}
            chevron
          />
        ))}
      </ListCard>

      <InstallCard />
    </main>
  )
}

/** A stack of noteheads on a staff, sized to sit inside a list row. */
function StaffIcon({ noteheads }: { noteheads: number }) {
  // Stacked in thirds, so they alternate line and space like real notation.
  const positions = Array.from({ length: noteheads }, (_, i) => 22 - i * 5)

  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent"
    >
      <svg viewBox="0 0 24 28" className="h-5 w-5">
        {[6, 11, 16, 21].map((y) => (
          <line
            key={y}
            x1={3}
            x2={21}
            y1={y}
            y2={y}
            stroke="white"
            strokeWidth={1}
            opacity={0.55}
          />
        ))}
        {positions.map((cy) => (
          <ellipse
            key={cy}
            cx={12}
            cy={cy}
            rx={3.6}
            ry={2.6}
            fill="white"
            transform={`rotate(-20 12 ${cy})`}
          />
        ))}
      </svg>
    </span>
  )
}
