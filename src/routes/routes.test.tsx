import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import App from '../App'
import Home from './Home'
import Intervals from './Intervals'
import Chords from './Chords'

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
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('routing', () => {
  it('renders the exercise list at /', () => {
    renderAt('/')
    expect(
      screen.getByRole('link', { name: /interval ear training/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /chord ear training/i }),
    ).toBeInTheDocument()
  })

  it.each([
    ['/intervals', /interval ear training/i],
    ['/chords', /chord ear training/i],
  ])('renders %s directly', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('navigates from the list into an exercise and back', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(
      screen.getByRole('link', { name: /interval ear training/i }),
    )
    expect(
      screen.getByRole('heading', { name: /interval ear training/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /back/i }))
    expect(
      screen.getByRole('link', { name: /chord ear training/i }),
    ).toBeInTheDocument()
  })
})
