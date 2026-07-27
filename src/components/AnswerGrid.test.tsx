import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnswerGrid, type AnswerCell } from './AnswerGrid'

const cells: AnswerCell[] = [
  { id: 'm2', label: 'Minor 2nd', state: 'idle' },
  null,
  { id: 'm3', label: 'Minor 3rd', state: 'wrong' },
  { id: 'M3', label: 'Major 3rd', state: 'correct' },
]

describe('AnswerGrid', () => {
  it('renders a button per answer and nothing for placeholders', () => {
    render(<AnswerGrid cells={cells} onAnswer={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Minor 2nd' })).toBeVisible()
  })

  it('keeps placeholder cells in the grid so answers do not reflow', () => {
    const { container } = render(
      <AnswerGrid cells={cells} onAnswer={vi.fn()} />,
    )
    // One DOM child per cell, including the null one.
    expect(container.firstElementChild?.children).toHaveLength(cells.length)
  })

  it('reports the answer id when an idle button is pressed', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(<AnswerGrid cells={cells} onAnswer={onAnswer} />)

    await user.click(screen.getByRole('button', { name: 'Minor 2nd' }))
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('m2')
  })

  it('keeps answered buttons pressable so their sound can be replayed', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(<AnswerGrid cells={cells} onAnswer={onAnswer} />)

    const wrong = screen.getByRole('button', { name: 'Minor 3rd' })
    const correct = screen.getByRole('button', { name: 'Major 3rd' })
    expect(wrong).toBeEnabled()
    expect(correct).toBeEnabled()

    // The grid reports the press either way; whether it scores is the
    // exercise screen's call, not something the grid can know.
    await user.click(wrong)
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('m3')

    await user.click(correct)
    expect(onAnswer).toHaveBeenLastCalledWith('M3')
  })

  it('colors buttons by state', () => {
    render(<AnswerGrid cells={cells} onAnswer={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Minor 3rd' })).toHaveClass(
      'bg-incorrect',
    )
    expect(screen.getByRole('button', { name: 'Major 3rd' })).toHaveClass(
      'bg-correct',
    )
    expect(screen.getByRole('button', { name: 'Minor 2nd' })).toHaveClass(
      'bg-surface',
    )
  })
})
