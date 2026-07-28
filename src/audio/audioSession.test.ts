import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimRecordingSession,
  configureAudioSession,
  isIos,
  isRecordingSessionActive,
  releaseRecordingSession,
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
  // The claim count lives in the module, so a test that leaves one standing
  // would hand it to the next test.
  while (isRecordingSessionActive()) releaseRecordingSession()

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

describe('recording claims', () => {
  it('moves to a record-capable session that keeps playing', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    claimRecordingSession()
    expect(session.type).toBe('play-and-record')
  })

  it('returns to playback once the claim is released', () => {
    // This is what puts the app back under the media channel, and so back to
    // ignoring the ringer switch.
    const session = { type: 'auto' }
    withAudioSession(session)

    claimRecordingSession()
    releaseRecordingSession()
    expect(session.type).toBe('playback')
  })

  it('holds the recording session until the last claim goes', () => {
    const session = { type: 'auto' }
    withAudioSession(session)

    claimRecordingSession()
    claimRecordingSession()
    releaseRecordingSession()
    expect(session.type).toBe('play-and-record')

    releaseRecordingSession()
    expect(session.type).toBe('playback')
  })

  it('ignores a release with nothing to release', () => {
    // stop() on a listener that never started is ordinary, and must not leave
    // the count negative and the next claim unable to take effect.
    const session = { type: 'auto' }
    withAudioSession(session)

    releaseRecordingSession()
    claimRecordingSession()
    expect(session.type).toBe('play-and-record')
  })

  it('does not let a replay reset the session mid-listen', () => {
    // Piano.unlock configures the session on every play. Before the claim
    // existed, replaying the chord while listening dropped the microphone's
    // session on the floor.
    const session = { type: 'auto' }
    withAudioSession(session)

    claimRecordingSession()
    configureAudioSession()
    expect(session.type).toBe('play-and-record')
  })

  it('is a no-op where the API is absent', () => {
    expect(() => {
      claimRecordingSession()
      releaseRecordingSession()
    }).not.toThrow()
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
