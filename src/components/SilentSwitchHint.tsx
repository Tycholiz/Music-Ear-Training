import { ringerSwitchMayMute } from '../audio'
import { usePersisted } from '../settings'
import { silentSwitchHintDismissedStore } from './ringerHint'

/**
 * Explains silence that the app cannot otherwise prevent.
 *
 * On iOS before Safari 16.4 there is no `navigator.audioSession`, so Web Audio
 * stays on the ringer channel and the physical switch mutes the app outright.
 * Nothing about that is visible on screen — the exercise looks like it is
 * playing. Since there is no API to read the switch, the only thing left is to
 * say so once, where a confused user will actually be looking.
 *
 * Renders nothing at all on any platform that can route around the switch,
 * which is most of them.
 */
export function SilentSwitchHint() {
  const [dismissed, setDismissed] = usePersisted(silentSwitchHintDismissedStore)

  if (dismissed || !ringerSwitchMayMute()) return null

  return (
    <p className="flex items-start gap-2 px-4 py-1 text-center text-xs text-content-muted">
      <span className="flex-1">
        No sound? Check the silent switch on the side of your phone.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 px-1 leading-none text-accent"
      >
        ×
      </button>
    </p>
  )
}
