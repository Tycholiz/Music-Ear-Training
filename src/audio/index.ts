export { NOTE_GAIN, Piano, RELEASE_MS, piano } from './piano'
export type { LoadStatus, PianoOptions } from './piano'
export {
  HIGHEST_NOTE,
  LOWEST_NOTE,
  SAMPLED_NOTES,
  isPlayable,
  nearestSample,
  playbackRate,
  sampleUrl,
} from './samples'
export {
  MELODY_TIMING,
  PROGRESSION_TIMING,
  RING_OUT_MS,
  TIMING,
  buildMelodySchedule,
  buildProgressionSchedule,
  buildSchedule,
  scheduleDurationMs,
  scheduleEndMs,
  sequence,
  sequenceThenSimultaneous,
  simultaneous,
  struck,
} from './schedule'
export type {
  MelodyPhrase,
  MelodyTiming,
  ProgressionTiming,
  NoteGroup,
  ScheduledNote,
  Timing,
} from './schedule'
export {
  claimPlaybackSession,
  holdsPlaybackSession,
  isIos,
  releasePlaybackSession,
  ringerSwitchMayMute,
  supportsAudioSession,
} from './audioSession'
