import { LOWEST_NOTE, HIGHEST_NOTE } from '../audio'
import { numeralById, type RomanNumeral } from '../theory'
import { CADENCES, type Cadence, type ProgressionSettings } from '../settings'
import type { Random } from './intervalQuestion'

/**
 * Chord progression generation and answer checking.
 *
 * ## Why progressions are walked rather than sampled
 *
 * Random chords sound worse than random notes did. Harmony carries stronger
 * expectations than melody: an unfamiliar melody is unfamiliar, but an
 * unfamiliar chord succession is heard as a *mistake* — the ear knows `V` wants
 * `I` the way it does not know what any given note wants. Sampled from a set,
 * the exercise would be asking users to transcribe something no one would ever
 * play, and the difficulty would come from the strangeness rather than from the
 * chords.
 *
 * So chords are walked through a table of conventional successors. `ii` goes to
 * `V`, `V` goes to `I` or `vi`, `vi` goes back round to `ii` or `IV`. What comes
 * out sounds like music because it moves the way music moves.
 *
 * ## Cadences end the walk rather than being appended to it
 *
 * Every progression resolves, because one that stops on `ii` is a fragment. But
 * the cadence is chosen *first* and the walk is built to arrive at it, rather
 * than a progression being generated and a cadence stuck on the end — the
 * approach to a cadence is part of the cadence, and a `V` reached from nowhere
 * in particular does not sound like an arrival.
 *
 * ## Cadencing is not ending on I
 *
 * If it were, the last answer would be free before the user heard a note. That
 * is the fault the melody generator shipped with, where every melody ended on a
 * chord tone and the assertion read `>0.8` against a real rate of 100%. Four
 * cadence types, landing on `I`, `I`, `V` and `vi`, mean the ending stays
 * unpredictable while every progression still resolves.
 *
 * ## No chord twice in a row
 *
 * Two identical chords in succession are close to indistinguishable from one
 * chord held longer, so a progression containing them asks the user a question
 * the sound cannot answer. They are excluded rather than left to be unfair.
 */

/** The numerals a cadence ends with, in order. */
const CADENCE_ENDINGS: Record<Cadence, readonly string[]> = {
  authentic: ['V', 'I'],
  plagal: ['IV', 'I'],
  // A half cadence is an arrival on the dominant; what precedes it is open.
  half: ['V'],
  deceptive: ['V', 'vi'],
}

/**
 * Where each chord conventionally goes next.
 *
 * Functional harmony, kept deliberately small: these are the moves that sound
 * like moves, not every pair that is theoretically defensible. `I` is the hub
 * and can go almost anywhere; the secondary dominants exist to point at one
 * chord each and so have a single successor.
 */
const SUCCESSORS: Record<string, readonly string[]> = {
  I: [
    'ii',
    'iii',
    'IV',
    'V',
    'vi',
    'iv',
    'bIII',
    'bVI',
    'bVII',
    'II',
    'III',
    'VI',
    'bII',
  ],
  ii: ['V', 'vii-dim', 'IV'],
  iii: ['vi', 'IV', 'ii'],
  IV: ['V', 'I', 'ii', 'vii-dim', 'iv'],
  V: ['I', 'vi'],
  vi: ['ii', 'IV', 'V', 'iii'],
  'vii-dim': ['I'],
  iv: ['V', 'I', 'bVII'],
  bIII: ['bVI', 'bVII', 'IV', 'I'],
  bVI: ['bVII', 'IV', 'V', 'I'],
  bVII: ['I', 'IV', 'bVI'],
  // Secondary dominants: each points at the chord it is the dominant of.
  II: ['V'],
  III: ['vi'],
  VI: ['ii'],
  bII: ['I', 'V'],
}

/**
 * How much more likely a progression is to open on the tonic.
 *
 * Most do, and it is the clearest way in. Not so much more likely that the
 * first answer becomes a formality — the Key button is what guarantees the user
 * can find the tonic, so the opening chord does not have to.
 */
const TONIC_OPENING_WEIGHT = 4

export interface ProgressionQuestion {
  /** The answer: numeral ids in the order they sound. */
  numerals: readonly string[]
  /** The key everything is measured from. */
  tonic: number
  /** How this progression resolves. */
  cadence: Cadence
}

function pick<T>(options: readonly T[], random: Random): T {
  return options[Math.floor(random() * options.length)]
}

function uniqueNumerals(settings: ProgressionSettings): string[] {
  return [...new Set(settings.numerals)].filter((id) => id in SUCCESSORS)
}

/** Cadences whose every chord is switched on. */
export function usableCadences(settings: ProgressionSettings): Cadence[] {
  const enabled = new Set(uniqueNumerals(settings))
  return CADENCES.filter(
    (cadence) =>
      settings.cadences.includes(cadence) &&
      CADENCE_ENDINGS[cadence].every((id) => enabled.has(id)),
  )
}

/** The chords a cadence needs, for explaining why it is unavailable. */
export function cadenceNumerals(cadence: Cadence): readonly string[] {
  return CADENCE_ENDINGS[cadence]
}

/**
 * Cadences these settings can actually reach, not merely afford the chords for.
 *
 * Having `IV` and `I` switched on does not mean a five-chord progression can be
 * built that arrives at them: the run-up has to get there through the
 * transition table without repeating a chord, and a small enough selection can
 * make that impossible. So this asks the question properly rather than
 * approximating it — see `viablePositions`.
 */
function reachableCadences(settings: ProgressionSettings): Cadence[] {
  const enabled = uniqueNumerals(settings)
  return usableCadences(settings).filter((cadence) => {
    const runUp = settings.length - CADENCE_ENDINGS[cadence].length
    if (runUp < 0) return false
    if (runUp === 0) return true
    return viablePositions(cadence, enabled, runUp)[0].length > 0
  })
}

/**
 * Whether these settings can produce a progression.
 *
 * In the spirit of `canGenerateMelody`: the screen is told rather than the
 * generator spinning. Exact rather than hopeful — an approximate answer here
 * would have the generator quietly returning a shorter progression than was
 * asked for, which is the kind of wrong that never raises anything.
 */
export function canGenerateProgression(settings: ProgressionSettings): boolean {
  if (settings.range.high - settings.range.low < 12) return false
  return reachableCadences(settings).length > 0
}

/**
 * Which chords may occupy each position of the run-up and still reach the
 * cadence, worked out backwards from it.
 *
 * The last position needs a chord that can lead into the cadence; the one
 * before needs a chord that can reach one of *those*, and so on back to the
 * opening. Walking forwards through these can never dead-end, which is what
 * lets the generator run without retries and without a fallback that would
 * have to lie about the length.
 */
function viablePositions(
  cadence: Cadence,
  enabled: readonly string[],
  runUp: number,
): string[][] {
  const target = CADENCE_ENDINGS[cadence][0]
  const positions: string[][] = new Array(runUp)

  positions[runUp - 1] = enabled.filter((id) => canLeadTo(id, target))
  for (let i = runUp - 2; i >= 0; i--) {
    positions[i] = enabled.filter((id) =>
      positions[i + 1].some((next) => canLeadTo(id, next)),
    )
  }

  return positions
}

export function generateProgressionQuestion(
  settings: ProgressionSettings,
  random: Random = Math.random,
): ProgressionQuestion {
  if (!canGenerateProgression(settings)) {
    throw new Error(
      'No progression can be generated: check the enabled chords, cadences, length and range',
    )
  }

  const enabled = uniqueNumerals(settings)
  const cadence = pick(reachableCadences(settings), random)

  return {
    numerals: walkTo(cadence, enabled, settings.length, random),
    tonic: pickTonic(settings, random),
    cadence,
  }
}

/** A key with room for the chords to be voiced inside the range. */
function pickTonic(settings: ProgressionSettings, random: Random): number {
  const low = Math.max(settings.range.low, LOWEST_NOTE)
  const high = Math.min(settings.range.high, HIGHEST_NOTE) - 12
  if (high <= low) return low
  return low + Math.floor(random() * (high - low + 1))
}

/**
 * A progression of exactly this length arriving at this cadence.
 *
 * Cannot fail, because every choice is made from the chords that still leave
 * the cadence reachable. The caller has already established through
 * `reachableCadences` that at least one such chord exists at every position.
 */
function walkTo(
  cadence: Cadence,
  enabled: readonly string[],
  length: number,
  random: Random,
): string[] {
  const ending = CADENCE_ENDINGS[cadence]
  const runUp = length - ending.length
  if (runUp === 0) return [...ending]

  const viable = viablePositions(cadence, enabled, runUp)
  const chords: string[] = [openingChord(viable[0], random)]

  for (let i = 1; i < runUp; i++) {
    const from = chords[i - 1]
    // Nothing twice in a row: the ear cannot tell two of a chord from one of it
    // held longer, so a progression containing them would ask something the
    // sound cannot answer.
    const options = viable[i].filter((id) => canLeadTo(from, id))
    chords.push(pick(options, random))
  }

  return [...chords, ...ending]
}

function canLeadTo(from: string, to: string): boolean {
  return from !== to && (SUCCESSORS[from] ?? []).includes(to)
}

/** Weighted towards the tonic, which is how most progressions open. */
function openingChord(enabled: readonly string[], random: Random): string {
  const weighted = enabled.flatMap((id) =>
    id === 'I' ? Array.from({ length: TONIC_OPENING_WEIGHT }, () => id) : [id],
  )
  return pick(weighted, random)
}

/** The numerals of a progression, as table entries. */
export function progressionNumerals(
  question: ProgressionQuestion,
): RomanNumeral[] {
  return question.numerals.map(numeralById)
}

export interface ProgressionResult {
  /** Whether every position matched. */
  correct: boolean
  /** Per position, whether the entered numeral was the right one. */
  positions: boolean[]
}

/**
 * Grade an entered progression.
 *
 * Positions are compared one for one, so the screen can mark each press as it
 * lands rather than waiting for the whole answer — being told the third chord
 * was wrong while it is still in the ear is a lesson, and being told at the end
 * is a score.
 */
export function checkProgression(
  entered: readonly string[],
  question: ProgressionQuestion,
): ProgressionResult {
  const positions = question.numerals.map(
    (id, i) => i < entered.length && entered[i] === id,
  )

  return {
    correct:
      entered.length === question.numerals.length && positions.every(Boolean),
    positions,
  }
}
