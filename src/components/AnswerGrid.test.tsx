import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnswerGrid, type AnswerCell } from './AnswerGrid'
import { ANSWER_COLUMNS, dropEmptyRows } from './answerCells'

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

  it('shares the height between however many rows are left', () => {
    // Dropping rows only buys anything because the survivors grow into the
    // space. `auto-rows-fr` is what does that, and it is the whole fix.
    const { container } = render(
      <AnswerGrid cells={cells} onAnswer={vi.fn()} />,
    )
    expect(container.firstElementChild).toHaveClass('auto-rows-fr')
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

/** A cell that only has to be distinguishable from a hole. */
const at = (id: string): AnswerCell => ({ id, label: id, state: 'idle' })

describe('dropEmptyRows', () => {
  it('removes a row with nothing in it', () => {
    expect(dropEmptyRows([at('a'), null, null, null, null, at('b')])).toEqual([
      at('a'),
      null,
      null,
      at('b'),
    ])
  })

  it('keeps a row that has one button in it', () => {
    // These are the gaps that earn their place: a hole beside a button is what
    // keeps the button in its column.
    expect(dropEmptyRows([at('a'), null])).toEqual([at('a'), null])
    expect(dropEmptyRows([null, at('b')])).toEqual([null, at('b')])
  })

  it('never moves a button between columns', () => {
    // The property the whole rule rests on. Whatever is dropped, a button that
    // was on the right is still on the right, because rows go whole.
    const table: AnswerCell[] = [
      null,
      at('right'),
      null,
      null,
      at('left'),
      null,
      null,
      null,
    ]
    const kept = dropEmptyRows(table)

    const columnOf = (cells: AnswerCell[], id: string) =>
      cells.findIndex((cell) => cell?.id === id) % ANSWER_COLUMNS

    expect(columnOf(kept, 'right')).toBe(columnOf(table, 'right'))
    expect(columnOf(kept, 'left')).toBe(columnOf(table, 'left'))
  })

  it('squares off an odd-length table before reading it as rows', () => {
    // The builders map over a table of whatever length the theory gives them.
    // A trailing half-row still has a button in it and has to survive.
    expect(dropEmptyRows([at('a')])).toEqual([at('a'), null])
    expect(dropEmptyRows([null, null, at('c')])).toEqual([at('c'), null])
  })

  it('leaves a full table exactly as it is', () => {
    const full = [at('a'), at('b'), at('c'), at('d')]
    expect(dropEmptyRows(full)).toEqual(full)
  })

  it('comes back empty rather than throwing when nothing is enabled', () => {
    // Not reachable — an empty selection is rejected by the settings store —
    // but a grid is the last place worth crashing.
    expect(dropEmptyRows([null, null, null, null])).toEqual([])
  })
})
