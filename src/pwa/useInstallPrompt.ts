import { useEffect, useState } from 'react'

/**
 * Whether and how the app can be added to the home screen.
 *
 * Android and desktop fire `beforeinstallprompt`, which has to be captured and
 * replayed later from a user gesture. iOS fires nothing and offers no API at
 * all — Add to Home Screen is a manual Share-sheet action there, so the only
 * thing we can do is say so.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState =
  /** Already installed, or the platform gives us nothing to offer. */
  | { kind: 'unavailable' }
  | { kind: 'prompt'; install: () => Promise<void> }
  | { kind: 'ios-instructions' }

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the standard media query.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented; we want to
      // choose where the offer appears.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return { kind: 'unavailable' }

  if (deferred) {
    return {
      kind: 'prompt',
      install: async () => {
        await deferred.prompt()
        await deferred.userChoice
        // The event is single-use; drop it either way.
        setDeferred(null)
      },
    }
  }

  return isIos() ? { kind: 'ios-instructions' } : { kind: 'unavailable' }
}
