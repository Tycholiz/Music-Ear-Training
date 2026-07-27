import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SilentSwitchHint } from './SilentSwitchHint'
import { silentSwitchHintDismissedStore } from './ringerHint'

/** Older iOS: no audioSession API, so the ringer switch still silences us. */
function onOldIos() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
  )
}

beforeEach(() => {
  localStorage.clear()
  silentSwitchHintDismissedStore.reset()
})

afterEach(() => {
  // @ts-expect-error removing any stub a test installed
  delete navigator.audioSession
  vi.restoreAllMocks()
})

describe('SilentSwitchHint', () => {
  it('says nothing on a platform that can route around the switch', () => {
    const { container } = render(<SilentSwitchHint />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains the silence on iOS that cannot', () => {
    onOldIos()
    render(<SilentSwitchHint />)
    expect(screen.getByText(/silent switch/i)).toBeVisible()
  })

  it('stays quiet once iOS can claim a playback session', () => {
    onOldIos()
    Object.defineProperty(navigator, 'audioSession', {
      value: { type: 'auto' },
      configurable: true,
    })

    const { container } = render(<SilentSwitchHint />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is genuinely one-time: dismissal persists', async () => {
    onOldIos()
    const user = userEvent.setup()
    const { unmount } = render(<SilentSwitchHint />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(silentSwitchHintDismissedStore.read()).toBe(true),
    )
    unmount()

    const { container } = render(<SilentSwitchHint />)
    expect(container).toBeEmptyDOMElement()
  })
})
