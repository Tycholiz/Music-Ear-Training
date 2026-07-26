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

  it('throws if the nav hook is used outside a sheet', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Root />)).toThrow(/inside a ModalSheet/)
    vi.restoreAllMocks()
  })
})
