import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import App from '../App'
import Home from './Home'
import Intervals from './Intervals'
import Chords from './Chords'
import ChordRoot from './ChordRoot'
import Melody from './Melody'
import Progressions from './Progressions'
import { piano } from '../audio'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <App />,
        children: [
          { index: true, element: <Home /> },
          { path: 'intervals', element: <Intervals /> },
          { path: 'chords', element: <Chords /> },
          { path: 'chord-root', element: <ChordRoot /> },
          { path: 'melody', element: <Melody /> },
          { path: 'progressions', element: <Progressions /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(piano, 'play').mockResolvedValue(undefined)
  vi.spyOn(piano, 'stop').mockImplementation(() => {})
})

describe('routing', () => {
  it('renders the exercise list at /', () => {
    renderAt('/')
    expect(
      screen.getByRole('link', { name: /interval identification/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /chord identification/i }),
    ).toBeInTheDocument()
  })

  it('renders the interval exercise directly at /intervals', () => {
    renderAt('/intervals')
    expect(screen.getByLabelText('Score')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  it('renders the chord root exercise directly at /chord-root', () => {
    renderAt('/chord-root')
    expect(screen.getByLabelText('Score')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  it('renders the chord exercise directly at /chords', () => {
    renderAt('/chords')
    expect(screen.getByLabelText('Score')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  it('renders the melody exercise directly at /melody', () => {
    renderAt('/melody')
    expect(screen.getByLabelText('Score')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  it('renders the progression exercise directly at /progressions', () => {
    renderAt('/progressions')
    expect(screen.getByLabelText('Score')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  it('navigates from the list into an exercise and back', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(
      screen.getByRole('link', { name: /interval identification/i }),
    )
    expect(screen.getByLabelText('Score')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(
      screen.getByRole('link', { name: /chord identification/i }),
    ).toBeInTheDocument()
  })
})
