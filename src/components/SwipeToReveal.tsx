import { useRef, useState, type ReactNode } from 'react'

/**
 * A row that slides aside to reveal one action behind it.
 *
 * The app's first gesture, and deliberately the smallest one that works: a
 * horizontal drag, a snap open or closed, and a button underneath. No gesture
 * library — this is one interaction on one screen, and the whole of it is
 * shorter than the wiring a library would need.
 *
 * ## Not fighting the scroll
 *
 * A list that steals vertical drags is worse than a list with no gestures at
 * all, so the horizontal drag has to lose every argument with the scroll.
 *
 * Two things enforce that, and both are needed. `touch-action: pan-y` tells the
 * browser vertical panning is still its job, which is what keeps scrolling
 * smooth rather than waiting on a handler that might call `preventDefault`.
 * Then the first move of each gesture decides: horizontal only if it is moving
 * *more* sideways than up, and past a threshold that a thumb travelling
 * straight down will never cross sideways. Once a gesture has been judged one
 * way it stays judged, so a drag that curves does not start scrolling the page
 * halfway through revealing a button.
 *
 * ## Reachable without the gesture
 *
 * A swipe is invisible to anyone using a screen reader — VoiceOver takes the
 * swipe for itself — so an action only reachable that way is an action those
 * users do not have. The button is therefore always in the DOM and always
 * focusable, and focusing it opens the row: the reveal follows the focus rather
 * than being a precondition for it, so keyboard and assistive tech get the
 * action without needing the gesture at all.
 */

/** How far the row slides, and how wide the action behind it is. */
const ACTION_WIDTH = 88

/**
 * How far a drag must go sideways before it counts as a swipe.
 *
 * Small enough not to feel sticky, large enough that the sideways wobble of a
 * thumb travelling down a list never reaches it.
 */
const ENGAGE_PX = 10

/** Past this much of the action's width, letting go opens rather than closes. */
const SNAP_FRACTION = 0.4

type Gesture = 'undecided' | 'horizontal' | 'vertical'

export function SwipeToReveal({
  actionLabel,
  actionName,
  onAction,
  children,
}: {
  /** The word on the button. Short, because the button is thumb-sized. */
  actionLabel: string
  /**
   * What the button is called to assistive tech, when that differs.
   *
   * A list of rows each offering "Reset" gives a screen reader nothing to tell
   * them apart — the row it belongs to is on screen and obvious to a sighted
   * user, and entirely absent from the button's own name. So the caller can
   * name it "Reset Perfect 5th" without putting all of that on a small button.
   */
  actionName?: string
  onAction: () => void
  children: ReactNode
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const gesture = useRef<Gesture>('undecided')
  const openedAt = useRef(0)

  const close = () => setOffset(0)

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    start.current = { x: touch.clientX, y: touch.clientY }
    gesture.current = 'undecided'
    openedAt.current = offset
  }

  const onTouchMove = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (!touch || !start.current) return

    const dx = touch.clientX - start.current.x
    const dy = touch.clientY - start.current.y

    if (gesture.current === 'undecided') {
      // Nothing is decided until one axis is clearly ahead. Deciding on the
      // first pixel would call every scroll a swipe, since no thumb travels in
      // a straight line.
      if (Math.abs(dx) < ENGAGE_PX && Math.abs(dy) < ENGAGE_PX) return
      gesture.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      if (gesture.current === 'horizontal') setDragging(true)
    }

    if (gesture.current !== 'horizontal') return

    // Only leftward, and never past the action. Dragging right on a closed row
    // would peel it away from nothing.
    const next = Math.min(Math.max(openedAt.current - dx, 0), ACTION_WIDTH)
    setOffset(next)
  }

  const onTouchEnd = () => {
    start.current = null
    if (gesture.current === 'horizontal') {
      setDragging(false)
      setOffset(offset > ACTION_WIDTH * SNAP_FRACTION ? ACTION_WIDTH : 0)
    }
    gesture.current = 'undecided'
  }

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        aria-label={actionName ?? actionLabel}
        onClick={() => {
          close()
          onAction()
        }}
        onFocus={() => setOffset(ACTION_WIDTH)}
        onBlur={close}
        style={{ width: ACTION_WIDTH }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-incorrect text-sm font-medium text-white"
      >
        {actionLabel}
      </button>

      <div
        style={{
          transform: `translateX(-${offset}px)`,
          // Snapping is animated; dragging is not, because a transition during
          // a drag makes the row lag the thumb.
          transition: dragging ? undefined : 'transform 150ms ease-out',
          touchAction: 'pan-y',
        }}
        className="relative bg-surface"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
