import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallCard } from './InstallCard'
import { installHintDismissedStore } from './installHint'
import { isIos, isStandalone } from './useInstallPrompt'

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile'

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value,
    configurable: true,
  })
}

function setStandalone(value: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(display-mode: standalone)' ? value : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

/** Stand-in for the event Chrome fires when the app is installable. */
function fireBeforeInstallPrompt(userChoice = 'accepted' as const) {
  // Cancelable, like the real thing — preventDefault is a no-op otherwise.
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome: userChoice })
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  localStorage.clear()
  installHintDismissedStore.reset()
  setStandalone(false)
  setUserAgent(ANDROID_UA)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isStandalone', () => {
  it('is true when launched from the home screen', () => {
    setStandalone(true)
    expect(isStandalone()).toBe(true)
  })

  it('is false in a normal browser tab', () => {
    expect(isStandalone()).toBe(false)
  })

  it('honours iOS Safari’s own flag, which predates the media query', () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      configurable: true,
    })
    expect(isStandalone()).toBe(true)

    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      configurable: true,
    })
  })
})

describe('isIos', () => {
  it('detects iPhone and iPad', () => {
    setUserAgent(IOS_UA)
    expect(isIos()).toBe(true)
  })

  it('does not fire on Android', () => {
    expect(isIos()).toBe(false)
  })
})

describe('InstallCard', () => {
  it('offers nothing on a platform with no install path', () => {
    // Android with no beforeinstallprompt event — already installed, or the
    // browser has decided it isn't eligible.
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden once the app is running standalone', async () => {
    setUserAgent(IOS_UA)
    setStandalone(true)
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gives manual instructions on iOS, which has no install API', () => {
    setUserAgent(IOS_UA)
    render(<InstallCard />)

    expect(screen.getByText(/Add to Home Screen/)).toBeVisible()
    // No button to press: iOS cannot be prompted programmatically.
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('offers an Install button once the browser says it is installable', async () => {
    render(<InstallCard />)
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()

    fireBeforeInstallPrompt()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install' })).toBeVisible(),
    )
  })

  it('replays the captured event when Install is pressed', async () => {
    const user = userEvent.setup()
    render(<InstallCard />)
    const event = fireBeforeInstallPrompt()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install' })).toBeVisible(),
    )
    await user.click(screen.getByRole('button', { name: 'Install' }))

    expect(event.prompt).toHaveBeenCalledOnce()
  })

  it('suppresses the browser’s own infobar so the offer appears where we put it', () => {
    render(<InstallCard />)
    const event = fireBeforeInstallPrompt()
    expect(event.defaultPrevented).toBe(true)
  })

  it('stays dismissed across visits rather than nagging', async () => {
    const user = userEvent.setup()
    setUserAgent(IOS_UA)
    const { unmount } = render(<InstallCard />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByText(/Add to Home/)).toBeNull())
    unmount()

    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('disappears when the app is installed while the card is showing', async () => {
    render(<InstallCard />)
    fireBeforeInstallPrompt()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install' })).toBeVisible(),
    )

    window.dispatchEvent(new Event('appinstalled'))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Install' })).toBeNull(),
    )
  })
})
