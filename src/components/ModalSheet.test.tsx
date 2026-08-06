import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from './ModalSheet'
import { useModalNav } from './modalNav'
import { ListCard, ListRow } from './ListCard'

/** Stand-in for the real Customize flow: root -> Customize -> Intervals. */
function Root() {
  const { push } = useModalNav()
  return (
    <ListCard>
      <ListRow label="Reset Score" onClick={vi.fn()} />
      <ListRow
        label="Customize Exercise"
        chevron
        onClick={() => push({ title: 'Customize', content: <Customize /> })}
      />
    </ListCard>
  )
}

function Customize() {
  const { push } = useModalNav()
  return (
    <ListCard>
      <ListRow
        label="Intervals"
        chevron
        onClick={() =>
          push({
            title: 'Intervals',
            content: <button type="button">Minor 2nd</button>,
          })
        }
      />
    </ListCard>
  )
}

function open(onClose = vi.fn()) {
  const user = userEvent.setup()
  render(
    <ModalSheet open onClose={onClose} title="Menu">
      <Root />
    </ModalSheet>,
  )
  return { user, onClose }
}

describe('ModalSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <ModalSheet open={false} onClose={vi.fn()} title="Menu">
        <Root />
      </ModalSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the root screen title and content when open', () => {
    open()
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reset Score' })).toBeVisible()
  })

  it('pushes a screen without leaving the sheet', async () => {
    const { user } = open()

    await user.click(screen.getByRole('button', { name: 'Customize Exercise' }))

    expect(screen.getByRole('heading', { name: 'Customize' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Intervals' })).toBeVisible()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('pushes two levels deep', async () => {
    const { user } = open()

    await user.click(screen.getByRole('button', { name: 'Customize Exercise' }))
    await user.click(screen.getByRole('button', { name: 'Intervals' }))

    expect(screen.getByRole('heading', { name: 'Intervals' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Minor 2nd' })).toBeVisible()
  })

  it('pops one level at a time with the back chevron', async () => {
    const { user } = open()

    await user.click(screen.getByRole('button', { name: 'Customize Exercise' }))
    await user.click(screen.getByRole('button', { name: 'Intervals' }))

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Customize' })).toBeVisible(),
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Menu' })).toBeVisible(),
    )
  })

  it('labels the leading button Close at the root and Back once nested', async () => {
    const { user } = open()
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Customize Exercise' }))
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible()
  })

  it('dismisses from the root, after the slide-down finishes', async () => {
    const onClose = vi.fn()
    const { user } = open(onClose)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('dismisses when the backdrop is tapped', async () => {
    const onClose = vi.fn()
    const { user } = open(onClose)

    await user.click(screen.getByTestId('modal-backdrop'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('treats Escape as back, popping before it closes', async () => {
    const onClose = vi.fn()
    const { user } = open(onClose)

    await user.click(screen.getByRole('button', { name: 'Customize Exercise' }))
    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Menu' })).toBeVisible(),
    )
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('keeps a scroll inside the sheet rather than moving the page behind it', () => {
    // A scroll that reaches the end of the sheet chains outward to the next
    // thing that can scroll, which is the exercise page the sheet is covering.
    // The user then watches the background move while reading a modal, with
    // nothing on screen to explain why.
    //
    // `body { overscroll-behavior: none }` does not cover this: that stops the
    // body passing its *own* overscroll to the document, and says nothing about
    // a nested scroller passing scroll into the body.
    render(
      <ModalSheet open onClose={vi.fn()} title="Statistics">
        <p>Content</p>
      </ModalSheet>,
    )

    const scroller = screen.getByText('Content').closest('.overflow-y-auto')
    expect(scroller?.className).toContain('overscroll-y-contain')
  })

  it('holds the page still while it is open, and gives it back after', () => {
    // Containment on the sheet's own scroller only takes effect on a container
    // that is actually scrolling. A screen whose content fits — the root menu,
    // most of the Customize screens — absorbs nothing, so the drag goes to the
    // page behind. That is why the statistics screen behaved and the short ones
    // did not.
    const { rerender } = render(
      <ModalSheet open onClose={vi.fn()} title="Menu">
        <p>Content</p>
      </ModalSheet>,
    )

    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <ModalSheet open={false} onClose={vi.fn()} title="Menu">
        <p>Content</p>
      </ModalSheet>,
    )

    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
  })

  it('gives back whatever the page had, not an empty string', () => {
    // The app sets neither today. A rule arriving later should not be quietly
    // erased by opening and closing a modal.
    document.body.style.overflow = 'scroll'

    const { unmount } = render(
      <ModalSheet open onClose={vi.fn()} title="Menu">
        <p>Content</p>
      </ModalSheet>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('does not let a drag on the scrim scroll the page', () => {
    // The scrim cannot scroll and should not be mistaken for something that
    // can: a drag there falls through to the nearest thing that *can*.
    render(
      <ModalSheet open onClose={vi.fn()} title="Statistics">
        <p>Content</p>
      </ModalSheet>,
    )

    expect(screen.getByTestId('modal-backdrop').className).toContain(
      'touch-none',
    )
  })

  it('throws if the nav hook is used outside a sheet', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Root />)).toThrow(/inside a ModalSheet/)
    vi.restoreAllMocks()
  })
})
