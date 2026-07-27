import { createStore } from '../settings'

/**
 * Whether the user has dismissed the ringer-switch hint.
 *
 * Persisted so it is genuinely a one-time note. Kept out of the component file
 * so Fast Refresh still works.
 */
export const silentSwitchHintDismissedStore = createStore<boolean>({
  key: 'met.silentSwitchHintDismissed',
  version: 1,
  defaults: false,
  sanitize: (raw, defaults) => (typeof raw === 'boolean' ? raw : defaults),
})
