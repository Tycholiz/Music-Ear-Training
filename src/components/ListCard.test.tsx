import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListCard, ListRow } from './ListCard'

describe('ListCard', () => {
  it('renders an optional section title and footer around its rows', () => {
    render(
      <ListCard title="Range" footer="Applies to both notes.">
        <ListRow label="Lowest" value="C3" />
      </ListCard>,
    )
    expect(screen.getByRole('heading', { name: 'Range' })).toBeVisible()
    expect(screen.getByText('Applies to both notes.')).toBeVisible()
    expect(screen.getByText('Lowest')).toBeVisible()
  })

  it('omits the title and footer when not given', () => {
    render(
      <ListCard>
        <ListRow label="Lowest" />
      </ListCard>,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('ListRow', () => {
  it('is a button only when it does something', () => {
    const { rerender } = render(<ListRow label="Static" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<ListRow label="Tappable" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Tappable' })).toBeVisible()
  })

  it('calls onClick when tapped', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<ListRow label="Customize Exercise" chevron onClick={onClick} />)

    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows a trailing value', () => {
    render(<ListRow label="Instrument" value="Piano" />)
    expect(screen.getByText('Piano')).toBeVisible()
  })

  it('renders custom children instead of the label', () => {
    render(
      <ListRow>
        <span>Custom content</span>
      </ListRow>,
    )
    expect(screen.getByText('Custom content')).toBeVisible()
  })

  it('never lets the value be squeezed into wrapping', () => {
    // The label is the side with room to give — it has `min-w-0`. A value that
    // shrank instead broke over two lines, and two rows in one card then put
    // their figures at different heights.
    const { container } = render(<ListRow label="Instrument" value="Piano" />)
    const value = screen.getByText('Piano').closest('span')

    expect(value?.className).toContain('shrink-0')
    expect(container.querySelector('.min-w-0')).not.toBeNull()
  })

  it('centres the value by default, and lines it up with the first line on request', () => {
    // Centring is right while a label is one line, and wrong the moment it is
    // three: the value drifts to the middle of however tall the row is.
    const { container: centred } = render(
      <ListRow label="Instrument" value="Piano" />,
    )
    expect(centred.firstElementChild?.className).toContain('items-center')

    const { container: aligned } = render(
      <ListRow alignFirstLine label="Instrument" value="Piano" />,
    )
    expect(aligned.firstElementChild?.className).toContain('items-baseline')
  })
})
