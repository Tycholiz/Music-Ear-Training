import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ModalNavContext, type ModalScreen } from './modalNav'

/**
 * Slide-up modal with an internal navigation stack.
 *
 * The Customize flow is several screens deep but never leaves the sheet, so the
 * sheet owns a stack of screens rather than the router. Pushing slides the new
 * screen in from the right; the back chevron pops one level, and at the root it
 * dismisses the sheet entirely.
 */

/** Kept in sync with the CSS transition durations in index.css. */
const SHEET_MS = 300
const SCREEN_MS = 250

export function ModalSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Title of the root screen. */
  title: string
  /** Content of the root screen. */
  children: ReactNode
}) {
  const [raised, setRaised] = useState(false)
  const [stack, setStack] = useState<ModalScreen[]>([])
  const [exiting, setExiting] = useState<ModalScreen | null>(null)

  // Mount at translateY(100%), then transition up on the next frame so the
  // browser has something to animate from.
  useEffect(() => {
    if (!open) {
      setRaised(false)
      return
    }
    const frame = requestAnimationFrame(() => setRaised(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Reset the stack once the sheet is fully closed, so reopening always starts
  // at the root without the reset being visible mid-animation.
  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => {
      setStack([])
      setExiting(null)
    }, SHEET_MS)
    return () => clearTimeout(timer)
  }, [open])

  const close = useCallback(() => {
    setRaised(false)
    setTimeout(onClose, SHEET_MS)
  }, [onClose])

  const push = useCallback((screen: ModalScreen) => {
    setStack((current) => [...current, screen])
  }, [])

  const pop = useCallback(() => {
    setStack((current) => {
      if (current.length === 0) return current
      setExiting(current[current.length - 1])
      setTimeout(() => setExiting(null), SCREEN_MS)
      return current.slice(0, -1)
    })
  }, [])

  const back = stack.length > 0 ? pop : close

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, back])

  if (!open) return null

  const current: ModalScreen = stack.at(-1) ?? { title, content: children }
  const depth = stack.length

  return (
    <ModalNavContext.Provider value={{ push, pop, close, depth }}>
      <div className="fixed inset-0 z-50 flex items-end justify-center">
        {/* Scrim, not a control: the header already exposes a labelled Close
            button and Escape works, so announcing a second dismiss affordance
            would just be noise. */}
        <div
          aria-hidden
          data-testid="modal-backdrop"
          onClick={close}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            raised ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.title}
          className={`safe-area-bottom relative flex h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-page transition-transform duration-300 ease-out ${
            raised ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <header className="relative flex shrink-0 items-center justify-center border-b border-separator px-2 py-3.5">
            <button
              type="button"
              onClick={back}
              aria-label={depth > 0 ? 'Back' : 'Close'}
              className="absolute left-1 p-2 text-accent"
            >
              <ChevronLeft />
            </button>
            <h2 className="text-lg font-semibold">{current.title}</h2>
          </header>

          <div className="relative flex-1 overflow-hidden">
            <div
              key={depth}
              className={`h-full overflow-y-auto ${
                depth > 0 ? 'modal-screen-in' : ''
              }`}
            >
              {current.content}
            </div>

            {exiting && (
              <div
                aria-hidden
                className="modal-screen-out pointer-events-none absolute inset-0 overflow-hidden bg-page"
              >
                {exiting.content}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalNavContext.Provider>
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
