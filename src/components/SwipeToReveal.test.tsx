import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SwipeToReveal } from './SwipeToReveal'

/** The element that slides. Its transform is the whole of the visible state. */
function slider(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[style*="translateX"]')
  if (!node) throw new Error('no sliding element')
  return node
}

/** How far the row has slid, as a positive distance. */
function offsetOf(container: HTMLElement): number {
  const match = slider(container).style.transform.match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function swipe(
  container: HTMLElement,
  moves: readonly { x: number; y: number }[],
) {
  drag(container, moves)
  fireEvent.touchEnd(slider(container), { touches: [] })
}

/** The moves without the release, for asserting what happens mid-gesture. */
function drag(
  container: HTMLElement,
  moves: readonly { x: number; y: number }[],
) {
  const target = slider(container)
  fireEvent.touchStart(target, { touches: [{ clientX: 0, clientY: 0 }] })
  for (const { x, y } of moves) {
    fireEvent.touchMove(target, { touches: [{ clientX: x, clientY: y }] })
  }
}

function renderRow(onAction = vi.fn()) {
  const result = render(
    <SwipeToReveal actionLabel="Reset" onAction={onAction}>
      <div>Perfect 5th</div>
    </SwipeToReveal>,
  )
  return { ...result, onAction }
}

describe('revealing', () => {
  it('opens on a swipe that goes far enough left', () => {
    const { container } = renderRow()
    swipe(container, [{ x: -60, y: 0 }])

    expect(offsetOf(container)).toBeGreaterThan(0)
  })

  it('springs back when the swipe does not commit', () => {
    // A short drag is more likely a mis-touch than an intent to reset.
    const { container } = renderRow()
    swipe(container, [{ x: -14, y: 0 }])

    expect(offsetOf(container)).toBe(0)
  })

  it('does not open on a swipe to the right', () => {
    // There is nothing on that side to peel the row away from.
    const { container } = renderRow()
    swipe(container, [{ x: 60, y: 0 }])

    expect(offsetOf(container)).toBe(0)
  })
})

describe('not fighting the scroll', () => {
  it('ignores a drag that is mostly vertical', () => {
    // The important one. A list that steals vertical drags is worse than a
    // list with no gestures at all.
    //
    // Asserted *during* the drag, not after letting go. A version that decided
    // every gesture was horizontal still passed this when it only checked the
    // end state: 20px is under the snap threshold, so it sprang back to zero
    // and looked innocent. What the user would have seen is the row twitching
    // sideways while they scrolled, which is exactly the mid-gesture offset.
    const { container } = renderRow()
    drag(container, [{ x: -20, y: -80 }])

    expect(offsetOf(container)).toBe(0)
  })

  it('stays a scroll once it has been judged a scroll', () => {
    // A thumb travelling down a list wanders sideways as it goes. Re-deciding
    // every frame would have the row twitching open mid-scroll.
    const { container } = renderRow()
    drag(container, [
      { x: -4, y: -40 },
      { x: -70, y: -80 },
    ])

    expect(offsetOf(container)).toBe(0)
  })

  it('stays a swipe once it has been judged a swipe', () => {
    // And the reverse: a drag that curves downward should not hand the gesture
    // back to the page halfway through revealing a button.
    const { container } = renderRow()
    swipe(container, [
      { x: -40, y: -2 },
      { x: -60, y: -90 },
    ])

    expect(offsetOf(container)).toBeGreaterThan(0)
  })

  it('leaves vertical panning to the browser', () => {
    // Declared rather than fought over: without this the browser waits on the
    // handler in case it calls preventDefault, and scrolling goes sticky.
    const { container } = renderRow()
    expect(slider(container).style.touchAction).toBe('pan-y')
  })
})

describe('the action', () => {
  it('runs when the revealed button is pressed', () => {
    const { container, onAction } = renderRow()
    swipe(container, [{ x: -60, y: 0 }])

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('does not run merely because the row was swiped', () => {
    // Revealing is not confirming. The button is the confirmation.
    const { container, onAction } = renderRow()
    swipe(container, [{ x: -60, y: 0 }])

    expect(onAction).not.toHaveBeenCalled()
  })

  it('is reachable without the gesture at all', () => {
    // A swipe is invisible to a screen reader — VoiceOver takes it for itself
    // — so an action only reachable that way is one those users do not have.
    // The button is always in the DOM, and focusing it opens the row so the
    // focus lands somewhere visible.
    const { container, onAction } = renderRow()
    const button = screen.getByRole('button', { name: 'Reset' })

    expect(button).toBeVisible()
    fireEvent.focus(button)
    expect(offsetOf(container)).toBeGreaterThan(0)

    fireEvent.click(button)
    expect(onAction).toHaveBeenCalledOnce()
  })
})
