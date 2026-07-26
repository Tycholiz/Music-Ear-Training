import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseHeader } from './ExerciseHeader'
import { formatAccuracy } from './score'

describe('formatAccuracy', () => {
  it.each([
    [0, 0, '—'],
    [86, 115, '75%'],
    [235, 350, '67%'],
    [1, 4, '25%'],
    [7, 10, '70%'],
    [10, 10, '100%'],
    [0, 3, '0%'],
  ])('formats %i/%i as %s', (correct, total, expected) => {
    expect(formatAccuracy(correct, total)).toBe(expected)
  })

  it('shows a dash rather than 0% before the first guess', () => {
    expect(formatAccuracy(0, 0)).toBe('—')
  })
})

describe('ExerciseHeader', () => {
  it('shows the raw score alongside the percentage', () => {
    render(
      <ExerciseHeader
        correct={86}
        total={115}
        onBack={vi.fn()}
        onMenu={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('86/115')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('75%')
  })

  it('starts a fresh exercise at 0/0', () => {
    render(
      <ExerciseHeader
        correct={0}
        total={0}
        onBack={vi.fn()}
        onMenu={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0')
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('—')
  })

  it('wires up back and menu', async () => {
    const onBack = vi.fn()
    const onMenu = vi.fn()
    const user = userEvent.setup()
    render(
      <ExerciseHeader correct={1} total={2} onBack={onBack} onMenu={onMenu} />,
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(onMenu).toHaveBeenCalledOnce()
  })
})
