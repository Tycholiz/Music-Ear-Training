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
