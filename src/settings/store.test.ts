import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStore,
  sanitizeInteger,
  sanitizeSelection,
  type StoreOptions,
} from './store'

interface Thing {
  name: string
  count: number
}

const defaults: Thing = { name: 'default', count: 0 }

function makeStore(overrides: Partial<StoreOptions<Thing>> = {}) {
  return createStore<Thing>({
    key: 'test.thing',
    version: 1,
    defaults,
    sanitize: (raw, fallback) =>
      typeof raw === 'object' && raw !== null
        ? { ...fallback, ...(raw as Thing) }
        : fallback,
    ...overrides,
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('reading and writing', () => {
  it('returns defaults when nothing is stored', () => {
    expect(makeStore().read()).toEqual(defaults)
  })

  it('round trips a written value through storage', () => {
    makeStore().write({ name: 'written', count: 3 })
    // A fresh store instance, so this really came back out of localStorage.
    expect(makeStore().read()).toEqual({ name: 'written', count: 3 })
  })

  it('survives a simulated reload', () => {
    makeStore().write({ name: 'persisted', count: 7 })
    expect(makeStore().read()).toEqual({ name: 'persisted', count: 7 })
  })

  it('goes back to defaults on reset and clears the key', () => {
    const store = makeStore()
    store.write({ name: 'written', count: 3 })
    store.reset()

    expect(store.read()).toEqual(defaults)
    expect(localStorage.getItem('test.thing')).toBeNull()
  })
})

describe('resilience', () => {
  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem('test.thing', '{ not json')
    expect(makeStore().read()).toEqual(defaults)
  })

  it('falls back to defaults when the envelope is not an object', () => {
    localStorage.setItem('test.thing', '"a string"')
    expect(makeStore().read()).toEqual(defaults)
  })

  it('ignores a value written by a different version', () => {
    localStorage.setItem(
      'test.thing',
      JSON.stringify({ version: 99, value: { name: 'old', count: 1 } }),
    )
    expect(makeStore().read()).toEqual(defaults)
  })

  it('falls back to defaults when the sanitiser itself throws', () => {
    localStorage.setItem(
      'test.thing',
      JSON.stringify({ version: 1, value: { name: 'x', count: 1 } }),
    )
    const store = makeStore({
      sanitize: () => {
        throw new Error('boom')
      },
    })
    expect(store.read()).toEqual(defaults)
  })

  it('does not throw when localStorage is unavailable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    const store = makeStore()
    expect(store.read()).toEqual(defaults)
    expect(() => store.write({ name: 'x', count: 1 })).not.toThrow()
    // The in-memory value is still correct for this session.
    expect(store.read()).toEqual({ name: 'x', count: 1 })

    getItem.mockRestore()
    setItem.mockRestore()
  })
})

describe('subscribe', () => {
  it('notifies on write and on reset', () => {
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.write({ name: 'a', count: 1 })
    expect(listener).toHaveBeenCalledTimes(1)

    store.reset()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops notifying after unsubscribe', () => {
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)()

    store.write({ name: 'a', count: 1 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns a stable reference between reads so React does not loop', () => {
    const store = makeStore()
    expect(store.read()).toBe(store.read())

    store.write({ name: 'a', count: 1 })
    expect(store.read()).toBe(store.read())
  })
})

describe('sanitizeSelection', () => {
  const allowed = ['a', 'b', 'c'] as const

  it('keeps only allowed members', () => {
    expect(sanitizeSelection(['a', 'zzz', 'c'], allowed, allowed)).toEqual([
      'a',
      'c',
    ])
  })

  it('reorders to match the canonical order', () => {
    expect(sanitizeSelection(['c', 'a'], allowed, allowed)).toEqual(['a', 'c'])
  })

  it('falls back when values were stored but none is recognized', () => {
    // A stale blob — settings written before an option was removed. The
    // defaults are the only sensible answer, since the alternative is
    // silently switching the exercise off for something the user never did.
    expect(sanitizeSelection(['zzz'], allowed, ['b'])).toEqual(['b'])
  })

  it('keeps a deliberately empty selection', () => {
    // Not the same as the case above, and telling them apart is the point:
    // an empty array is someone choosing nothing. Replacing it filled the
    // screen back in with settings they had never chosen.
    expect(sanitizeSelection([], allowed, ['b'])).toEqual([])
  })

  it('falls back when the stored value is not an array', () => {
    expect(sanitizeSelection('a', allowed, ['b'])).toEqual(['b'])
    expect(sanitizeSelection(null, allowed, ['b'])).toEqual(['b'])
  })

  it('drops duplicates', () => {
    expect(sanitizeSelection(['a', 'a', 'b'], allowed, allowed)).toEqual([
      'a',
      'b',
    ])
  })
})

describe('sanitizeInteger', () => {
  const bounds = { min: 0, max: 10, fallback: 5 }

  it('passes through an in-range integer', () => {
    expect(sanitizeInteger(7, bounds)).toBe(7)
  })

  it('clamps out-of-range values instead of discarding them', () => {
    expect(sanitizeInteger(-4, bounds)).toBe(0)
    expect(sanitizeInteger(99, bounds)).toBe(10)
  })

  it('falls back for non-integers', () => {
    expect(sanitizeInteger(1.5, bounds)).toBe(5)
    expect(sanitizeInteger('7', bounds)).toBe(5)
    expect(sanitizeInteger(NaN, bounds)).toBe(5)
    expect(sanitizeInteger(undefined, bounds)).toBe(5)
  })
})
