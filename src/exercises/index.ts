export {
  MAX_DESCENDING_ANSWER,
  answerFor,
  canGenerate,
  candidateAnswers,
  gapForAnswer,
  generateIntervalQuestion,
  groupsForQuestion,
  isCorrect,
  isDescending,
  usablePlayModes,
} from './intervalQuestion'
export type { IntervalQuestion, Random } from './intervalQuestion'
export { buildCells } from './intervalCells'
export {
  ALL_INTERVAL_ANSWERS,
  PLAY_MODE_NAMES,
  intervalsWarning,
  isIntervalUsable,
  isPlayModeUsable,
  isStuck,
  playModeName,
  playModesWarning,
  rangeSpan,
  rangeWarning,
} from './intervalValidation'
export {
  ALL_CHORD_IDS,
  acceptableAnswers,
  canGenerateChord,
  chordCandidates,
  chordRootPitch,
  generateChordQuestion,
  groupsForChordQuestion,
  isAmbiguous,
  isChordCorrect,
} from './chordQuestion'
export type { ChordCandidate, ChordQuestion } from './chordQuestion'
export { buildChordCells } from './chordCells'
export {
  ALL_INVERSIONS,
  CHORD_PLAY_MODE_NAMES,
  INVERSION_NAMES,
  chordRangeWarning,
  chordsWarning,
  inversionsWarning,
  isChordStuck,
  isChordUsable,
  isInversionUsable,
  rangeSpanOf,
} from './chordValidation'
export { groupsForAnswerPreview, previewNotes } from './intervalQuestion'
export { groupsForChordPreview, previewChordNotes } from './chordQuestion'
export {
  generateRootQuestion,
  groupsForRootQuestion,
  matchesRoot,
  rootAnswer,
} from './rootQuestion'
export type { RootQuestion } from './rootQuestion'
export {
  backingNotes,
  canGenerateMelody,
  checkMelody,
  generateMelodyQuestion,
  guessPitch,
  phraseForMelodyQuestion,
  selectedScales,
} from './melodyQuestion'
export type { MelodyQuestion, MelodyResult } from './melodyQuestion'
export {
  BACKING_DESCRIPTIONS,
  BACKING_NAMES,
  MELODY_LENGTHS,
  featuredWarning,
  isMelodyStuck,
  melodyRangeWarning,
  melodyStuckReason,
} from './melodyValidation'
export {
  canGenerateProgression,
  checkProgression,
  generateProgressionQuestion,
  progressionNumerals,
  usableCadences,
} from './progressionQuestion'
export type {
  ProgressionQuestion,
  ProgressionResult,
} from './progressionQuestion'
export {
  keyChord,
  voiceChordAlone,
  voiceGuess,
  voiceMovement,
  voiceProgression,
  voicingsFor,
} from './progressionVoicing'
