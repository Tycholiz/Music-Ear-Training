import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Offers a new version rather than installing it underneath the user.
 *
 * The service worker is registered with `registerType: 'prompt'`, so a new
 * build waits instead of taking over. Reloading mid-question would throw away
 * whatever the user was in the middle of, which is why this is a banner and
 * not an automatic refresh.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-center gap-3 border-t border-separator bg-surface px-4 py-3"
    >
      <span className="flex-1 text-sm">A new version is ready.</span>
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
    </div>
  )
}
