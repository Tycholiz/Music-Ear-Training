import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Registers the service worker and reports on it.
 *
 * Two things surface here:
 *
 * - **Ready to use offline**, once precaching finishes. Without it there is no
 *   way to tell whether it is safe to go offline yet — the samples are ~1.5 MB
 *   and take a moment, and finding out by losing signal is a bad way to learn.
 * - **A new version is ready**, when an update is waiting. The worker uses
 *   `registerType: 'prompt'`, so a new build never takes over on its own:
 *   reloading mid-question would throw away whatever the user was part-way
 *   through.
 */

/** How long the offline confirmation stays up before getting out of the way. */
const OFFLINE_NOTICE_MS = 4000

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      role="status"
      className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-center gap-3 border-t border-separator bg-surface px-4 py-3"
    >
      <span className="flex-1 text-sm">
        {needRefresh ? 'A new version is ready.' : 'Ready to use offline.'}
      </span>

      {needRefresh ? (
        <>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="px-2 py-1 text-sm text-content-muted"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium"
          >
            Reload
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          aria-label="Dismiss"
          className="px-2 py-1 text-sm text-accent"
        >
          Dismiss
        </button>
      )}
    </div>
  )
}
