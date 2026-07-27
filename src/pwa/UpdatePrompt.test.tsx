import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = {
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [state.needRefresh, state.setNeedRefresh],
    offlineReady: [state.offlineReady, state.setOfflineReady],
    updateServiceWorker: state.updateServiceWorker,
  }),
}))

const { UpdatePrompt } = await import('./UpdatePrompt')

beforeEach(() => {
  state.needRefresh = false
  state.offlineReady = false
  state.setNeedRefresh = vi.fn()
  state.setOfflineReady = vi.fn()
  state.updateServiceWorker = vi.fn().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('UpdatePrompt', () => {
  it('shows nothing while the worker is quiet', () => {
    const { container } = render(<UpdatePrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('confirms when the app is cached, so the user knows offline is safe', () => {
    state.offlineReady = true
    render(<UpdatePrompt />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Ready to use offline.',
    )
    // Nothing to reload — this is confirmation, not an update.
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull()
  })

  it('gets out of the way on its own', async () => {
    vi.useFakeTimers()
    state.offlineReady = true
    render(<UpdatePrompt />)

    expect(state.setOfflineReady).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4000)
    expect(state.setOfflineReady).toHaveBeenCalledWith(false)
  })

  it('offers an update rather than applying it', async () => {
    const user = userEvent.setup()
    state.needRefresh = true
    render(<UpdatePrompt />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'A new version is ready.',
    )
    expect(state.updateServiceWorker).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(state.updateServiceWorker).toHaveBeenCalledOnce()
  })

  it('lets the user postpone an update mid-exercise', async () => {
    const user = userEvent.setup()
    state.needRefresh = true
    render(<UpdatePrompt />)

    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(state.setNeedRefresh).toHaveBeenCalledWith(false)
    expect(state.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('prefers the update message when both are pending', () => {
    state.needRefresh = true
    state.offlineReady = true
    render(<UpdatePrompt />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'A new version is ready.',
    )
  })

  it('clears the home indicator when installed', () => {
    state.offlineReady = true
    render(<UpdatePrompt />)
    expect(screen.getByRole('status')).toHaveClass('safe-area-bottom')
  })
})
