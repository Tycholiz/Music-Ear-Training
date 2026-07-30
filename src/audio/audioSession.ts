/**
 * Routing the app's audio past the iPhone's ringer switch, and letting go of it
 * again afterwards.
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
 *
 * ## Why the session is given back
 *
 * `playback` was claimed once and held for the life of the page, which is how a
 * music player behaves and not how this app does. Two things followed from it.
 *
 * The visible one: iOS shows a media session in the Dynamic Island, so an app
 * that plays two-second chords sat there advertising itself as though it were
 * streaming an album.
 *
 * The one that actually broke: a held session is a session iOS can take back.
 * Leave the app for a few minutes and it deactivates ours, and reactivating it
 * is not something the app can do by writing `playback` over the top — the
 * property already reads `playback`, so there is no transition to act on. The
 * app came back with a resumable AudioContext feeding a session that was no
 * longer live, which sounds exactly like nothing at all.
 *
 * So the session is claimed when something is about to sound and released when
 * nothing is. That fixes the indicator, stops iOS having a claim of ours to
 * reclaim while we are away, and means the next claim is always a real
 * `auto` → `playback` transition rather than a write that changes nothing.
 */

type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record'

/** What we claim while sounding: media, not incidental noise. */
const SOUNDING: AudioSessionType = 'playback'

/**
 * What we go back to when silent.
 *
 * `auto` rather than `ambient`: it hands the decision back to the browser
 * instead of asserting a category we do not want either.
 */
const SILENT: AudioSessionType = 'auto'

interface AudioSession {
  type: AudioSessionType
}

function audioSession(): AudioSession | null {
  const session = (navigator as { audioSession?: AudioSession }).audioSession
  return session ?? null
}

/** Whether we believe we are currently holding the session. */
let held = false

/** Whether this browser can be told to ignore the ringer switch. */
export function supportsAudioSession(): boolean {
  if (typeof navigator === 'undefined') return false
  return audioSession() !== null
}

/**
 * Declare our audio as media playback, for as long as something is sounding.
 *
 * Safe to call repeatedly, and a no-op anywhere the API doesn't exist. Must
 * happen before the sound starts: the category in force when a note begins is
 * the one that decides whether the ringer switch can silence it.
 */
export function claimPlaybackSession(): void {
  const session = audioSession()
  if (!session) {
    held = true
    return
  }

  try {
    // If the type already reads `playback` while we are not holding it, iOS
    // deactivated the session under us and left the property behind. Writing
    // the same value over the top is not a change and will not bring it back,
    // so go via `auto` to make it one.
    if (!held && session.type === SOUNDING) session.type = SILENT
    session.type = SOUNDING
  } catch {
    // Setting an unsupported type throws in some Safari builds. Nothing to do
    // about it, and it must not stop audio from starting.
  }

  held = true
}

/**
 * Give the session back, now that nothing is sounding.
 *
 * Safe to call when we do not hold it.
 */
export function releasePlaybackSession(): void {
  const session = audioSession()
  held = false
  if (!session) return

  try {
    session.type = SILENT
  } catch {
    // As above: nothing to be done, and nothing that should propagate.
  }
}

/** Whether the session is currently claimed. Exposed for tests. */
export function holdsPlaybackSession(): boolean {
  return held
}

/**
 * Never carry a claim into the background.
 *
 * The release that follows silence covers the ordinary case, but a phrase still
 * ringing when the user leaves would be interrupted mid-flight and its voices
 * may never report ending, so the claim would survive the whole time the app is
 * away — which is precisely the state that gets the session taken off us.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releasePlaybackSession()
  })
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
