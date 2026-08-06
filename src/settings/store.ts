/**
 * Versioned localStorage backing.
 *
 * Settings will keep growing as tickets land, so every stored value carries a
 * version and goes through a sanitiser on the way out. Anything unrecognised,
 * corrupt, or from a version we don't know falls back to defaults rather than
 * throwing — a bad settings blob should never stop the app from starting.
 */

export interface PersistedStore<T> {
  read: () => T
  write: (value: T) => void
  reset: () => void
  /** Shaped for useSyncExternalStore. */
  subscribe: (listener: () => void) => () => void
}

export interface StoreOptions<T> {
  key: string
  version: number
  defaults: T
  /**
   * Coerce whatever came out of storage into a valid value. Return the
   * defaults for anything unsalvageable; repair what can be repaired.
   */
  sanitize: (raw: unknown, defaults: T) => T
}

interface Envelope {
  version: number
  value: unknown
}

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    // Safari private mode and disabled-storage environments throw on access.
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Out of quota or storage disabled. The in-memory value stays correct for
    // this session; there's nothing useful to tell the user here.
  }
}

function removeStorage(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // See writeStorage.
  }
}

export function createStore<T>({
  key,
  version,
  defaults,
  sanitize,
}: StoreOptions<T>): PersistedStore<T> {
  const listeners = new Set<() => void>()
  let cached: T | null = null

  function load(): T {
    const raw = readStorage(key)
    if (raw === null) return defaults

    let envelope: Envelope
    try {
      envelope = JSON.parse(raw) as Envelope
    } catch {
      return defaults
    }

    if (
      typeof envelope !== 'object' ||
      envelope === null ||
      envelope.version !== version
    ) {
      return defaults
    }

    try {
      return sanitize(envelope.value, defaults)
    } catch {
      return defaults
    }
  }

  return {
    read() {
      cached ??= load()
      return cached
    },

    write(value: T) {
      // Sanitise on the way in as well as on the way out, so the store's
      // invariants hold no matter which caller wrote to it. Without this a
      // screen offering an option the store does not allow would leave that
      // value live in memory until the next reload.
      const clean = sanitize(value, defaults)
      cached = clean
      writeStorage(
        key,
        JSON.stringify({ version, value: clean } satisfies Envelope),
      )
      for (const listener of listeners) listener()
    },

    reset() {
      // Drop the cache rather than assigning defaults, so the next read goes
      // back through `load` and picks up anything written since.
      cached = null
      removeStorage(key)
      for (const listener of listeners) listener()
    },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// --- sanitiser building blocks ---------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Keep only the members of `raw` that are in `allowed`, preserving the order of
 * `allowed` so lists render consistently. Falls back to `fallback` if nothing
 * survives, since an empty selection can't generate a question.
 */
/**
 * An empty selection is a choice; an unrecognisable one is damage.
 *
 * These used to be the same answer — anything that came out empty was replaced
 * with the defaults — and that made "none of them" impossible to store. A user
 * who deselected everything had the screen fill itself back in with settings
 * they had never chosen, which is worse than the empty exercise screen they
 * were asking for and which the app already knows how to show.
 *
 * The two are told apart by what arrived rather than by what survived. An empty
 * array is someone choosing nothing. An array with values in it where *none* is
 * recognised is a stale or corrupt blob — settings written before an option was
 * removed, say — and there the defaults are the only sensible answer, because
 * the alternative is silently switching the exercise off for something the user
 * never did.
 */
export function sanitizeSelection<T>(
  raw: unknown,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  if (!Array.isArray(raw)) return [...fallback]
  const chosen = new Set(raw)
  const kept = allowed.filter((option) => chosen.has(option))
  if (kept.length === 0 && raw.length > 0) return [...fallback]
  return kept
}

export function sanitizeInteger(
  raw: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return fallback
  return Math.min(max, Math.max(min, raw))
}
