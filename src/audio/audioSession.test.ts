import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimPlaybackSession,
  holdsPlaybackSession,
  isIos,
  releasePlaybackSession,
  ringerSwitchMayMute,
  supportsAudioSession,
} from './audioSession'

/** A session whose writes can be watched, since order matters here. */
function recordingSession(initial = 'auto') {
  const writes: string[] = []
  const session = {
    get type() {
      return writes.length > 0 ? writes[writes.length - 1] : initial
    },
    set type(value: string) {
      writes.push(value)
    },
    writes,
  }
  return session
}

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
  // The claim lives in the module, so a test that leaves one standing would
  // hand it to the next.
  releasePlaybackSession()

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

describe('claimPlaybackSession', () => {
  it('claims a playback session, which the ringer switch does not mute', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    claimPlaybackSession()
    expect(session.type).toBe('playback')
  })

  it('is a no-op where the API is absent', () => {
    expect(() => claimPlaybackSession()).not.toThrow()
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
    expect(() => claimPlaybackSession()).not.toThrow()
  })

  it('can be called repeatedly', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    claimPlaybackSession()
    claimPlaybackSession()
    expect(session.type).toBe('playback')
  })

  it('does not write the same value twice over while it holds the session', () => {
    const session = recordingSession()
    withAudioSession(session)

    claimPlaybackSession()
    claimPlaybackSession()
    expect(session.writes).toEqual(['playback', 'playback'])
  })

  it('forces a transition when the type is stale rather than held', () => {
    // This is the bug the app came back silent from: iOS deactivates the
    // session while the app is away and leaves `playback` behind on the
    // property. Writing it again is not a change and brings nothing back, so
    // the claim has to go via `auto` to make one.
    const session = recordingSession('playback')
    withAudioSession(session)

    claimPlaybackSession()
    expect(session.writes).toEqual(['auto', 'playback'])
  })

  it('reports holding the session, and letting it go', () => {
    withAudioSession({ type: 'auto' })

    claimPlaybackSession()
    expect(holdsPlaybackSession()).toBe(true)

    releasePlaybackSession()
    expect(holdsPlaybackSession()).toBe(false)
  })
})

describe('releasePlaybackSession', () => {
  it('hands the session back so nothing is held while silent', () => {
    // A held session is one iOS can take back, and an app playing two-second
    // chords has no business holding one between them.
    const session = { type: 'auto' }
    withAudioSession(session)

    claimPlaybackSession()
    releasePlaybackSession()
    expect(session.type).toBe('auto')
  })

  it('is harmless when nothing is held', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    expect(() => releasePlaybackSession()).not.toThrow()
    expect(holdsPlaybackSession()).toBe(false)
  })

  it('is a no-op where the API is absent', () => {
    expect(() => releasePlaybackSession()).not.toThrow()
  })

  it('survives a browser that rejects the assignment', () => {
    withAudioSession({
      set type(_value: string) {
        throw new TypeError('unsupported')
      },
      get type() {
        return 'playback'
      },
    })
    expect(() => releasePlaybackSession()).not.toThrow()
  })

  it('leaves the next claim a real transition to make', () => {
    const session = recordingSession()
    withAudioSession(session)

    claimPlaybackSession()
    releasePlaybackSession()
    claimPlaybackSession()

    expect(session.writes).toEqual(['playback', 'auto', 'playback'])
  })
})

describe('going into the background', () => {
  it('gives the session back rather than carrying a claim away', () => {
    // A phrase still ringing when the user leaves is interrupted mid-flight and
    // its voices may never report ending, so the claim would otherwise survive
    // the whole time the app is away — which is the state that gets the session
    // taken off us.
    const session = { type: 'auto' }
    withAudioSession(session)
    claimPlaybackSession()

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(holdsPlaybackSession()).toBe(false)
    expect(session.type).toBe('auto')
  })

  it('keeps the claim while the app is merely visible', () => {
    const session = { type: 'auto' }
    withAudioSession(session)
    claimPlaybackSession()

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(holdsPlaybackSession()).toBe(true)
    expect(session.type).toBe('playback')
  })
})

describe('isIos', () => {
  it('recognizes an iPhone', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(isIos()).toBe(true)
  })

  it('recognizes an iPad that claims to be a Mac', () => {
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
