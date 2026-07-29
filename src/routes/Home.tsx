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
  {
    to: '/chord-root',
    label: 'Chord Root Recognition',
    // The same three noteheads, with the lowest one picked out: this exercise
    // is about one note of the chord rather than the chord as a whole.
    icon: <StaffIcon noteheads={3} highlightRoot />,
  },
  {
    to: '/melody',
    label: 'Melody Dictation',
    // Noteheads spread across the staff rather than stacked on it: the other
    // three exercises ask about notes sounding together, this one about notes
    // following one another.
    icon: <MelodyIcon />,
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

/** Four noteheads walking across the staff, for the one melodic exercise. */
function MelodyIcon() {
  // A rise, a dip and a rise: enough contour to read as a tune at 20px rather
  // than as a scale.
  const notes = [
    { cx: 5, cy: 19 },
    { cx: 11, cy: 11.5 },
    { cx: 17, cy: 16.5 },
    { cx: 23, cy: 9 },
  ]

  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent"
    >
      <svg viewBox="0 0 28 28" className="h-5 w-5">
        {[6, 11, 16, 21].map((y) => (
          <line
            key={y}
            x1={2}
            x2={26}
            y1={y}
            y2={y}
            stroke="white"
            strokeWidth={1}
            opacity={0.55}
          />
        ))}
        {notes.map(({ cx, cy }) => (
          <ellipse
            key={cx}
            cx={cx}
            cy={cy}
            rx={3}
            ry={2.2}
            fill="white"
            transform={`rotate(-20 ${cx} ${cy})`}
          />
        ))}
      </svg>
    </span>
  )
}

/** A stack of noteheads on a staff, sized to sit inside a list row. */
function StaffIcon({
  noteheads,
  highlightRoot = false,
}: {
  noteheads: number
  /** Draw the lowest notehead solid and the rest hollow. */
  highlightRoot?: boolean
}) {
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
        {positions.map((cy, i) => {
          const hollow = highlightRoot && i > 0
          return (
            <ellipse
              key={cy}
              cx={12}
              cy={cy}
              rx={3.6}
              ry={2.6}
              fill={hollow ? 'none' : 'white'}
              stroke={hollow ? 'white' : 'none'}
              strokeWidth={hollow ? 1.4 : 0}
              transform={`rotate(-20 12 ${cy})`}
            />
          )
        })}
      </svg>
    </span>
  )
}
