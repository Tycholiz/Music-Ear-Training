import { Link } from 'react-router'

/** Placeholder. Built out in #7 (screen) and #8 (question generator). */
export default function Intervals() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link to="/" className="pt-6 text-accent">
        ‹ Back
      </Link>
      <h1 className="text-2xl font-bold">Interval Ear Training</h1>
      <p className="text-content-muted">Coming soon.</p>
    </main>
  )
}
