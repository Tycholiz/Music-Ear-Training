import { Link } from 'react-router'
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
    label: 'Interval Identification',
    icon: <StaffIcon noteheads={2} />,
  },
  {
    to: '/chords',
    label: 'Chord Identification',
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
  {
    to: '/progressions',
    label: 'Chord Progression Recognition',
    // Three chords side by side: the other exercises ask about one sound, this
    // one about how several of them follow each other.
    icon: <ProgressionIcon />,
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

      {/*
        Not a list row, deliberately. Everything above is an exercise, and a
        sixth row with an icon would read as a sixth exercise — this is the
        manual, so it is set apart and centred rather than dressed as one.
      */}
      <div className="mt-auto flex justify-center pt-6 pb-2">
        <Link
          to="/about"
          className="px-4 py-2 text-center text-sm text-content-muted underline underline-offset-4 active:opacity-60"
        >
          How to use this app
        </Link>
      </div>
    </main>
  )
}

/** Three stacks side by side: chords following one another. */
function ProgressionIcon() {
  const stacks = [6, 14, 22]

  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent"
    >
      <svg viewBox="0 0 28 28" className="h-5 w-5">
        {[8, 13, 18].map((y) => (
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
        {stacks.map((cx, i) =>
          // Each stack a third higher than the last, so they read as changing.
          [18 - i * 2.5, 13 - i * 2.5, 8 - i * 2.5].map((cy) => (
            <ellipse
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              rx={2.6}
              ry={1.9}
              fill="white"
              transform={`rotate(-20 ${cx} ${cy})`}
            />
          )),
        )}
      </svg>
    </span>
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
