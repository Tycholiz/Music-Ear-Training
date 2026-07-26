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

  it('locks buttons that have already been guessed', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(<AnswerGrid cells={cells} onAnswer={onAnswer} />)

    const wrong = screen.getByRole('button', { name: 'Minor 3rd' })
    const correct = screen.getByRole('button', { name: 'Major 3rd' })
    expect(wrong).toBeDisabled()
    expect(correct).toBeDisabled()

    await user.click(wrong)
    await user.click(correct)
    expect(onAnswer).not.toHaveBeenCalled()
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
