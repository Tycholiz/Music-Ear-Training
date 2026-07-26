import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Home from './Home'

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )
}

describe('Home', () => {
  it('lists both exercises', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: 'Interval Ear Training' }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Chord Ear Training' }),
    ).toBeVisible()
  })

  it('points each row at its exercise route', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: 'Interval Ear Training' }),
    ).toHaveAttribute('href', '/intervals')
    expect(
      screen.getByRole('link', { name: 'Chord Ear Training' }),
    ).toHaveAttribute('href', '/chords')
  })

  it('uses real links, so exercises can be opened in a new tab', () => {
    renderHome()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the decorative icons out of the accessible name', () => {
    renderHome()
    // Would read as "Interval Ear Training" plus icon noise if the svg leaked.
    expect(
      screen.getByRole('link', { name: 'Interval Ear Training' }),
    ).toHaveAccessibleName('Interval Ear Training')
  })
})
