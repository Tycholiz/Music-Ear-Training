import { createStore } from '../settings'

/**
 * Whether the user has dismissed the install offer.
 *
 * Persisted so declining is permanent rather than something they have to do on
 * every visit. Kept out of the component file so Fast Refresh still works.
 */
export const installHintDismissedStore = createStore<boolean>({
  key: 'met.installHintDismissed',
  version: 1,
  defaults: false,
  sanitize: (raw, defaults) => (typeof raw === 'boolean' ? raw : defaults),
})
