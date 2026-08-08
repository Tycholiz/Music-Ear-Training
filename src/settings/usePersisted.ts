import { useCallback, useSyncExternalStore } from 'react'
import type { PersistedStore } from './store'

/**
 * A write, either of a whole value or of a change to the current one.
 *
 * The function form is the one to reach for whenever the new value depends on
 * the old — which, because every settings write spreads what was there before,
 * is very nearly all of them.
 */
export type Persist<T> = (next: T | ((current: T) => T)) => void

/**
 * Read and write a persisted store from React. Every component sharing a store
 * re-renders together, so the score in the header and the score in the modal
 * can never drift apart.
 *
 * ## Derive the next value inside the updater, never from the render
 *
 * `setSettings({ ...settings, chords })` reads the settings **this render was
 * built with**. Two taps that land before React has re-rendered therefore both
 * start from the same value, and the second write lands on top of the first
 * with the first tap missing from it. On a checklist that is the user ticking
 * four rows quickly and watching one or two of them stay put — the same bug
 * the melody exercise had with entered notes, and the statistics with two
 * presses in one batch.
 *
 * A store subscription does not help. The store has the truth the moment it is
 * written; it is the *closure* that is stale, and it stays stale until the
 * render that replaces it.
 *
 * So the function form reads `store.read()` at write time. That is the same
 * rule `recordInStore` follows, for the same reason, and it is why this hook
 * offers the updater at all rather than leaving each screen to remember.
 */
export function usePersisted<T>(
  store: PersistedStore<T>,
): [T, Persist<T>, () => void] {
  const value = useSyncExternalStore(store.subscribe, store.read, store.read)

  const write = useCallback<Persist<T>>(
    (next) => {
      store.write(
        typeof next === 'function'
          ? (next as (current: T) => T)(store.read())
          : next,
      )
    },
    [store],
  )

  const reset = useCallback(() => store.reset(), [store])
  return [value, write, reset]
}
