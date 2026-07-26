import { useCallback, useSyncExternalStore } from 'react'
import type { PersistedStore } from './store'

/**
 * Read and write a persisted store from React. Every component sharing a store
 * re-renders together, so the score in the header and the score in the modal
 * can never drift apart.
 */
export function usePersisted<T>(
  store: PersistedStore<T>,
): [T, (value: T) => void, () => void] {
  const value = useSyncExternalStore(store.subscribe, store.read, store.read)
  const write = useCallback((next: T) => store.write(next), [store])
  const reset = useCallback(() => store.reset(), [store])
  return [value, write, reset]
}
