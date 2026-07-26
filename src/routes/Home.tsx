import { Link } from 'react-router'

/**
 * Placeholder exercise list. The real grouped-list treatment lands with the
 * shared UI kit (#3) and this screen's own ticket (#6).
 */
const EXERCISES = [
  { to: '/intervals', label: 'Interval Ear Training' },
  { to: '/chords', label: 'Chord Ear Training' },
]

export default function Home() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="pt-6 text-3xl font-bold">Ear Training</h1>

      <ul className="overflow-hidden rounded-xl bg-surface">
        {EXERCISES.map((exercise) => (
          <li
            key={exercise.to}
            className="border-t border-separator first:border-t-0"
          >
            <Link
              to={exercise.to}
              className="flex items-center justify-between px-4 py-3.5"
            >
              <span>{exercise.label}</span>
              <span aria-hidden className="text-content-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
