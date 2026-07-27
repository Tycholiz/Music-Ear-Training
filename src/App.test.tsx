import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import App from './App'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <App />,
        children: [{ index: true, element: <p>screen</p> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('App shell', () => {
  it('keeps content clear of the status bar and home indicator', () => {
    // `viewport-fit=cover` lets the layout run under the notch. A browser tab
    // hides that behind its own chrome, but an installed app does not — without
    // this the score and menu end up under the status bar.
    renderShell()
    expect(screen.getByText('screen').parentElement).toHaveClass('safe-area')
  })

  it('renders the routed screen inside the shell', () => {
    renderShell()
    expect(screen.getByText('screen')).toBeVisible()
  })
})
