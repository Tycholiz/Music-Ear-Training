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

  describe('locked', () => {
    it('refuses the change but reports the press', async () => {
      const onChange = vi.fn()
      const onLockedPress = vi.fn()
      const user = userEvent.setup()
      render(
        <CheckRow
          label="V"
          checked
          locked
          onChange={onChange}
          onLockedPress={onLockedPress}
        />,
      )

      await user.click(screen.getByRole('checkbox'))
      expect(onChange).not.toHaveBeenCalled()
      expect(onLockedPress).toHaveBeenCalledOnce()
    })

    it('stays reachable, unlike disabled', async () => {
      // `disabled` takes the row out of the tab order and swallows the click,
      // which is the whole reason locking cannot be built on it: the press has
      // to land somewhere to be answered.
      const user = userEvent.setup()
      const onLockedPress = vi.fn()
      render(
        <CheckRow
          label="V"
          checked
          locked
          onChange={vi.fn()}
          onLockedPress={onLockedPress}
        />,
      )

      const row = screen.getByRole('checkbox')
      expect(row).toBeEnabled()
      expect(row).toHaveAttribute('aria-disabled', 'true')

      await user.tab()
      expect(row).toHaveFocus()
      await user.keyboard(' ')
      expect(onLockedPress).toHaveBeenCalledOnce()
    })

    it('still reads as checked, because it is', () => {
      render(<CheckRow label="V" checked locked onChange={vi.fn()} />)
      expect(screen.getByRole('checkbox')).toBeChecked()
    })

    it('wins over disabled, which would make it unreachable', async () => {
      const onLockedPress = vi.fn()
      const user = userEvent.setup()
      render(
        <CheckRow
          label="V"
          checked
          locked
          disabled
          onChange={vi.fn()}
          onLockedPress={onLockedPress}
        />,
      )

      await user.click(screen.getByRole('checkbox'))
      expect(onLockedPress).toHaveBeenCalledOnce()
    })

    it('says nothing about being disabled when it is not locked', () => {
      render(<CheckRow label="V" checked onChange={vi.fn()} />)
      expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled')
    })
  })
})
