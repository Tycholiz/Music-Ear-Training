import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureAudioSession,
  isIos,
  ringerSwitchMayMute,
  supportsAudioSession,
} from './audioSession'

/** Stand in for Safari 16.4+, which exposes navigator.audioSession. */
function withAudioSession(session: unknown) {
  Object.defineProperty(navigator, 'audioSession', {
    value: session,
    configurable: true,
  })
}

function withUserAgent(ua: string, platform = 'iPhone', touchPoints = 5) {
  // defineProperty rather than spyOn: jsdom does not define maxTouchPoints at
  // all, and there is nothing for a spy to attach to.
  for (const [key, value] of Object.entries({
    userAgent: ua,
    platform,
    maxTouchPoints: touchPoints,
  })) {
    Object.defineProperty(navigator, key, { value, configurable: true })
  }
}

afterEach(() => {
  for (const key of [
    'audioSession',
    'userAgent',
    'platform',
    'maxTouchPoints',
  ]) {
    delete (navigator as unknown as Record<string, unknown>)[key]
  }
  vi.restoreAllMocks()
})

describe('supportsAudioSession', () => {
  it('is false where the API is absent', () => {
    expect(supportsAudioSession()).toBe(false)
  })

  it('is true once the API exists', () => {
    withAudioSession({ type: 'auto' })
    expect(supportsAudioSession()).toBe(true)
  })
})

describe('configureAudioSession', () => {
  it('claims a playback session, which the ringer switch does not mute', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    configureAudioSession()
    expect(session.type).toBe('playback')
  })

  it('is a no-op where the API is absent', () => {
    expect(() => configureAudioSession()).not.toThrow()
  })

  it('survives a browser that rejects the assignment', () => {
    // Some Safari builds throw on an unsupported type. Audio still has to
    // start; a silenced app is better than no app.
    withAudioSession({
      set type(_value: string) {
        throw new TypeError('unsupported')
      },
      get type() {
        return 'auto'
      },
    })
    expect(() => configureAudioSession()).not.toThrow()
  })

  it('can be called repeatedly', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    configureAudioSession()
    configureAudioSession()
    expect(session.type).toBe('playback')
  })
})

describe('isIos', () => {
  it('recognises an iPhone', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(isIos()).toBe(true)
  })

  it('recognises an iPad that claims to be a Mac', () => {
    // iPadOS 13+ reports MacIntel; the touch points are what give it away.
    withUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'MacIntel',
      5,
    )
    expect(isIos()).toBe(true)
  })

  it('does not mistake a real Mac for one', () => {
    withUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'MacIntel',
      0,
    )
    expect(isIos()).toBe(false)
  })

  it('does not mistake Android for one', () => {
    withUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5)
    expect(isIos()).toBe(false)
  })
})

describe('ringerSwitchMayMute', () => {
  it('is true on older iOS, where nothing can route around the switch', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')
    expect(ringerSwitchMayMute()).toBe(true)
  })

  it('is false on iOS new enough to claim a playback session', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    withAudioSession({ type: 'auto' })
    expect(ringerSwitchMayMute()).toBe(false)
  })

  it('is false everywhere else, since no other platform has the switch', () => {
    withUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5)
    expect(ringerSwitchMayMute()).toBe(false)
  })
})
