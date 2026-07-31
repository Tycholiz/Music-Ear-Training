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
  it('lists every exercise', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: 'Interval Identification' }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Chord Identification' }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Chord Root Recognition' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Melody Dictation' })).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Chord Progression Recognition' }),
    ).toBeVisible()
  })

  it('points each row at its exercise route', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: 'Interval Identification' }),
    ).toHaveAttribute('href', '/intervals')
    expect(
      screen.getByRole('link', { name: 'Chord Identification' }),
    ).toHaveAttribute('href', '/chords')
    expect(
      screen.getByRole('link', { name: 'Chord Root Recognition' }),
    ).toHaveAttribute('href', '/chord-root')
    expect(
      screen.getByRole('link', { name: 'Melody Dictation' }),
    ).toHaveAttribute('href', '/melody')
    expect(
      screen.getByRole('link', { name: 'Chord Progression Recognition' }),
    ).toHaveAttribute('href', '/progressions')
  })

  it('uses real links, so exercises can be opened in a new tab', () => {
    renderHome()
    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the decorative icons out of the accessible name', () => {
    renderHome()
    // Would read as "Interval Identification" plus icon noise if the svg leaked.
    expect(
      screen.getByRole('link', { name: 'Interval Identification' }),
    ).toHaveAccessibleName('Interval Identification')
  })
})
