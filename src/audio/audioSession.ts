/**
 * Routing the app's audio past the iPhone's ringer switch.
 *
 * By default iOS treats Web Audio as "ambient" sound and routes it to the
 * ringer channel, so the app is completely silent whenever the physical switch
 * on the side of the phone is flipped — with nothing on screen to explain why.
 *
 * Safari 16.4 added `navigator.audioSession`. Setting its type to `playback`
 * declares this as media rather than incidental sound, which routes it to the
 * media channel and takes it out from under the ringer switch, the same as a
 * music or podcast app.
 *
 * There is no API that reports the switch position, and no way to make older
 * Safari ignore it. So where the API is missing the only honest fallback is to
 * say so — see `SilentSwitchHint`.
 */

type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record'

interface AudioSession {
  type: AudioSessionType
}

function audioSession(): AudioSession | null {
  const session = (navigator as { audioSession?: AudioSession }).audioSession
  return session ?? null
}

/** Whether this browser can be told to ignore the ringer switch. */
export function supportsAudioSession(): boolean {
  if (typeof navigator === 'undefined') return false
  return audioSession() !== null
}

/**
 * Declare our audio as media playback. Safe to call repeatedly, and a no-op
 * anywhere the API doesn't exist.
 */
export function configureAudioSession(): void {
  const session = audioSession()
  if (!session) return

  try {
    session.type = 'playback'
  } catch {
    // Setting an unsupported type throws in some Safari builds. Nothing to do
    // about it, and it must not stop audio from starting.
  }
}

/** iOS is the only platform with a ringer switch to work around. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Whether the ringer switch can still silence us, so the user may need telling.
 */
export function ringerSwitchMayMute(): boolean {
  return isIos() && !supportsAudioSession()
}
