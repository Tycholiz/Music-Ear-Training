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
 *
 * ## The microphone complicates this
 *
 * `playback` is a play-only category. The moment `getUserMedia` opens a stream,
 * iOS has to move to a record-capable category whether we ask it to or not, and
 * if we have not said which one it picks for itself — historically the one that
 * sends output to the earpiece at call volume. The chord goes quiet and thin
 * with no error anywhere, which is the worst kind of bug to be handed.
 *
 * So the declared type follows what the app is actually doing: `playback` while
 * it is only playing, `play-and-record` for as long as anything holds a
 * recording claim. Claims are counted rather than flagged so that two listeners
 * cannot have the first one to stop drop the session out from under the second.
 *
 * Every path that starts audio calls `configureAudioSession`, which re-asserts
 * whichever type currently applies. That matters more than it looks: replaying
 * a chord goes through `Piano.unlock`, and before this it would have reset the
 * session to `playback` mid-listen on every single replay.
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

/** What we declare while the app is only playing. */
const PLAYING: AudioSessionType = 'playback'

/** What we have to declare while a microphone is open. */
const RECORDING: AudioSessionType = 'play-and-record'

/** How many callers currently need the microphone. */
let recorders = 0

/** The type the app's current activity calls for. */
function wantedType(): AudioSessionType {
  return recorders > 0 ? RECORDING : PLAYING
}

function apply(): void {
  const session = audioSession()
  if (!session) return

  const wanted = wantedType()
  if (session.type === wanted) return

  try {
    session.type = wanted
  } catch {
    // Setting an unsupported type throws in some Safari builds. Nothing to do
    // about it, and it must not stop audio from starting.
  }
}

/**
 * Declare the session that matches what the app is doing right now. Safe to
 * call repeatedly, and a no-op anywhere the API doesn't exist.
 *
 * Call this from anywhere audio is about to start: on iOS the category is
 * settled at that moment, so a declaration made earlier in the page's life is
 * not necessarily the one in force.
 */
export function configureAudioSession(): void {
  apply()
}

/**
 * Declare that something is about to record, and keep declaring it until the
 * matching `releaseRecordingSession`.
 *
 * Claim *before* calling `getUserMedia`. iOS chooses the category when capture
 * starts; saying what we want first is the difference between choosing the
 * routing and being told what it is.
 */
export function claimRecordingSession(): void {
  recorders += 1
  apply()
}

/**
 * Give up a recording claim. Once the last one goes, the app is back to plain
 * playback — which is also what restores the ringer-switch behaviour.
 *
 * Unbalanced calls are ignored rather than driving the count negative: `stop()`
 * on a listener that never started is a normal thing to happen.
 */
export function releaseRecordingSession(): void {
  if (recorders === 0) return
  recorders -= 1
  apply()
}

/** Whether anything currently holds a recording claim. */
export function isRecordingSessionActive(): boolean {
  return recorders > 0
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
