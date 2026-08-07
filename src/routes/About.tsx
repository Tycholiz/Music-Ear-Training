import { useNavigate } from 'react-router'
import { AboutPage } from '../components'
import { HOW_TO_USE_THIS_APP } from '../about/pages'

/**
 * The general guidance page, reached from the bottom of the home screen.
 *
 * Anything true of the whole app is here rather than repeated on five exercise
 * pages — what the app is for, why an instrument helps, and how the statistics
 * work. The exercise pages are shorter for it, which is the point: a manual
 * nobody finishes is a manual nobody read.
 */
export default function About() {
  const navigate = useNavigate()

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="relative flex shrink-0 items-center justify-center border-b border-separator px-2 py-3.5">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back"
          className="absolute left-1 p-2 text-accent"
        >
          <ChevronLeft />
        </button>
        <h1 className="text-lg font-semibold">How to use this app</h1>
      </header>

      <AboutPage content={HOW_TO_USE_THIS_APP} />
    </main>
  )
}

function ChevronLeft() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 20"
      className="h-5 w-3 stroke-current"
      fill="none"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2l-8 8 8 8" />
    </svg>
  )
}
