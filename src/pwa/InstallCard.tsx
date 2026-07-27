import { usePersisted } from '../settings'
import { installHintDismissedStore } from './installHint'
import { useInstallPrompt } from './useInstallPrompt'

/** Offer to add the app to the home screen, shown on the exercise list. */
export function InstallCard() {
  const state = useInstallPrompt()
  const [dismissed, setDismissed] = usePersisted(installHintDismissedStore)

  if (dismissed || state.kind === 'unavailable') return null

  return (
    <section className="rounded-xl bg-surface p-4">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm">
          {state.kind === 'ios-instructions' ? (
            <>
              Add this to your home screen to use it offline: tap{' '}
              <span aria-label="the Share button">Share</span>, then{' '}
              <strong className="font-medium">Add to Home Screen</strong>.
            </>
          ) : (
            'Install this app to use it offline and launch it from your home screen.'
          )}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="-mt-1 px-2 py-1 text-lg leading-none text-content-muted"
        >
          ×
        </button>
      </div>

      {state.kind === 'prompt' && (
        <button
          type="button"
          onClick={() => void state.install()}
          className="mt-3 rounded-full bg-accent px-4 py-1.5 text-sm font-medium"
        >
          Install
        </button>
      )}
    </section>
  )
}
