import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckRow } from './CheckRow'

describe('CheckRow', () => {
  it('exposes its checked state to assistive tech', () => {
    const { rerender } = render(
      <CheckRow label="Minor 2nd" checked={false} onChange={vi.fn()} />,
    )
    expect(
      screen.getByRole('checkbox', { name: 'Minor 2nd' }),
    ).not.toBeChecked()

    rerender(<CheckRow label="Minor 2nd" checked onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Minor 2nd' })).toBeChecked()
  })

  it('toggles to the opposite of its current state', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <CheckRow label="Tritone" checked={false} onChange={onChange} />,
    )

    await user.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)

    onChange.mockClear()
    rerender(<CheckRow label="Tritone" checked onChange={onChange} />)
    await user.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('cannot be toggled when disabled, so the last selection can be pinned', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CheckRow label="Ascending" checked disabled onChange={onChange} />)

    await user.click(screen.getByRole('checkbox'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
