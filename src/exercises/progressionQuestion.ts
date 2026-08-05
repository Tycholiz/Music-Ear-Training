import { LOWEST_NOTE, HIGHEST_NOTE } from '../audio'
import {
  CADENCES,
  cadenceNumerals,
  numeralById,
  type Cadence,
  type RomanNumeral,
} from '../theory'
import { MIN_PROGRESSION_LENGTH, type ProgressionSettings } from '../settings'
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
 * chord tone and the assertion read `>0.8` against a real rate of 100%. Five
 * cadence types, landing on `I`, `I`, `V`, `vi` and `vi`, mean the ending stays
 * unpredictable while every progression still resolves.
 *
 * ## The number of chords can be a question too
 *
 * With `upTo` set, `length` is a ceiling and each question picks its own. The
 * row of empty slots on screen otherwise announces how long the phrase will be
 * before a note has sounded, so the user never has to hear where it ends —
 * and hearing where a phrase ends is part of hearing it. The length is chosen
 * before the cadence, because which cadences fit depends on how many chords
 * there are.
 *
 * ## No chord twice in a row
 *
 * Two identical chords in succession are close to indistinguishable from one
 * chord held longer, so a progression containing them asks the user a question
 * the sound cannot answer. They are excluded rather than left to be unfair.
 */

/**
 * Where each chord conventionally goes next.
 *
 * Functional harmony, kept deliberately small: these are the moves that sound
 * like moves, not every pair that is theoretically defensible. `I` is the hub
 * and can go almost anywhere.
 *
 * ## A secondary dominant resolves, or hands on down the circle
 *
 * Each one used to have a single successor — the chord it is the dominant of —
 * which is the rule for a secondary dominant heard on its own. It is not the
 * rule for a *chain* of them. `III VI II V I` is E7 A7 D7 G7 C: every chord the
 * dominant of the next, every root falling a fifth, and one of the most worn
 * grooves in tonal music. Under one-successor-each it could not be generated at
 * all, because `III` could only go to `vi` and `VI` only to `ii`.
 *
 * So `III` also leads to `VI`, and `VI` to `II`. Each still resolves the
 * ordinary way as well, so nothing that could be generated before is lost —
 * what changes is that a dominant may now delay its resolution by pointing at
 * the next dominant instead, which is exactly what makes the chain a chain.
 *
 * These are still the only two additions, and both are the same move: the
 * circle continuing. `II` gets no new successor, because the chord a fifth
 * below `II` is `V`, which it already leads to.
 *
 * ## A chord needs more than one way in, not just one way out
 *
 * `III` used to be reachable only from `I`. That was survivable while it was an
 * ordinary chord in the middle of a walk, and stopped being so the moment it
 * became the approach chord of the `secondary` cadence: every such progression
 * then ended `I III vi`, and at three chords there was exactly one progression
 * the generator could produce. A question with one possible answer is not a
 * hard question, it is a memorised one.
 *
 * So `IV` and `vi` lead to `III` as well. Both are ordinary — `IV III vi` is
 * the subdominant handing over to the dominant of the relative minor, and
 * `vi III vi` is `i V i` heard in that minor. What this is not is a licence to
 * widen the table whenever something is hard to reach: the fix for a
 * *cadence* that cannot be approached is more approaches, and the fix for a
 * chord nobody uses is to leave it alone.
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
  IV: ['V', 'I', 'ii', 'vii-dim', 'iv', 'III'],
  V: ['I', 'vi'],
  vi: ['ii', 'IV', 'V', 'iii', 'III'],
  'vii-dim': ['I'],
  iv: ['V', 'I', 'bVII'],
  bIII: ['bVI', 'bVII', 'IV', 'I'],
  bVI: ['bVII', 'IV', 'V', 'I'],
  bVII: ['I', 'IV', 'bVI'],
  // Secondary dominants: each resolves to the chord it is the dominant of, or
  // hands on to the next dominant round the circle. `II` needs no second
  // successor — the chord a fifth below it is `V`, which it already leads to.
  II: ['V'],
  III: ['vi', 'VI'],
  VI: ['ii', 'II'],
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

/**
 * How much more likely the walk is to continue around the circle of fifths.
 *
 * A root falling a fifth is the strongest move in tonal harmony and the shape
 * behind an enormous amount of real music — `vi ii V I`, `iii vi ii V I`, the
 * whole sequence a jazz tune runs on. Left to an unweighted walk it turned up
 * only by accident: the successor table offers each of these moves alongside
 * three or four others, so the chance of taking two in a row was small and of
 * taking three smaller again. A user could practise for a long time without
 * ever being asked to hear a fifths sequence as a sequence.
 *
 * Weighted rather than built as a pattern of its own. A dedicated
 * circle-of-fifths generator would need its own reachability arithmetic to
 * guarantee it could still arrive at the chosen cadence, and could dead-end
 * when the chords it wanted were switched off — the exact failure that
 * `viablePositions` exists to make impossible. Weighting reorders choices the
 * walk was already free to make, so every invariant holds by construction:
 * enabled chords only, no chord twice in a row, and the cadence still reachable
 * from wherever the chain leaves off.
 *
 * Four, matching the tonic weighting. Raising it does almost nothing, which is
 * how the shape of this was found: at 4 a run-up produces a three-chord fifths
 * run in 39% of progressions, and at 12 in 35% — the same, inside the noise.
 * See `aroundTheCircle` for why, and for what the weight is applied *to*.
 */
const CIRCLE_OF_FIFTHS_WEIGHT = 4

/** Longest fifths run worth chasing. Past this the weighting has said enough. */
const MAX_CIRCLE_LOOKAHEAD = 3

/**
 * Whether the root falls a fifth — the circle-of-fifths move.
 *
 * Measured up a fourth rather than down a fifth because roots are pitch
 * classes: `V` to `I` is seven semitones down or five up, and five up is the
 * one that does not depend on which octave anything landed in. Deliberately the
 * same arithmetic `rootMovement` calls `up-fourth`, so what the walk favours
 * and what the statistics screen reports are the same move rather than two
 * definitions that could drift apart.
 *
 * Note this excludes `IV` to `vii°`, the one step of the diatonic circle that
 * is a tritone rather than a perfect fourth. That is correct: it is the place
 * the diatonic circle audibly is not a circle, and the successor table does not
 * lead out of `vii°` into `iii` anyway.
 */
function fallsAFifth(from: string, to: string): boolean {
  const root = (id: string) => numeralById(id).root
  return (((root(to) - root(from)) % 12) + 12) % 12 === 5
}

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
      cadenceNumerals(cadence).every((id) => enabled.has(id)),
  )
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
function reachableCadences(
  settings: ProgressionSettings,
  length: number,
): Cadence[] {
  const enabled = uniqueNumerals(settings)
  return usableCadences(settings).filter((cadence) => {
    const runUp = length - cadenceNumerals(cadence).length
    if (runUp < 0) return false
    if (runUp === 0) return true
    return viablePositions(cadence, enabled, runUp)[0].length > 0
  })
}

/**
 * The lengths a question is allowed to come out at.
 *
 * `upTo` turns `length` from an exact count into a ceiling. The floor is the
 * shortest progression the exercise offers at all rather than anything derived
 * from the setting: two chords is a bare cadence, which the Length screen
 * already calls the right place to start, so it is a legitimate question and
 * not a degenerate one.
 */
function allowedLengths(settings: ProgressionSettings): number[] {
  if (!settings.upTo) return [settings.length]
  const lengths: number[] = []
  for (let n = MIN_PROGRESSION_LENGTH; n <= settings.length; n++)
    lengths.push(n)
  return lengths
}

/**
 * The allowed lengths that can actually reach an enabled cadence.
 *
 * Not every length in the range works: with only `I` and `V` switched on there
 * is nowhere for a long run-up to go, and an authentic cadence needs two
 * chords before it can happen at all. Filtering here rather than retrying in
 * the generator keeps the promise the rest of this file makes — whatever is
 * offered can be built, at exactly the length claimed.
 */
function viableLengths(settings: ProgressionSettings): number[] {
  return allowedLengths(settings).filter(
    (length) => reachableCadences(settings, length).length > 0,
  )
}

/**
 * Whether these settings can produce a progression.
 *
 * In the spirit of `canGenerateMelody`: the screen is told rather than the
 * generator spinning. Exact rather than hopeful — an approximate answer here
 * would have the generator quietly returning a shorter progression than was
 * asked for, which is the kind of wrong that never raises anything.
 *
 * With `upTo` set this is *more* permissive, and deliberately: a selection that
 * cannot fill five chords but can fill three is now playable, because five was
 * only ever a ceiling. The exactness is unchanged — every length it accepts can
 * be built at that length.
 */
export function canGenerateProgression(settings: ProgressionSettings): boolean {
  if (settings.range.high - settings.range.low < 12) return false
  return viableLengths(settings).length > 0
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
  const target = cadenceNumerals(cadence)[0]
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
  // Length first, then a cadence that fits it. The other way round would have
  // to discard cadences after choosing them — a half cadence can happen in one
  // chord and an authentic one cannot — and a retry loop here is exactly what
  // the exact-reachability work exists to avoid.
  const length = pick(viableLengths(settings), random)
  const cadence = pick(reachableCadences(settings, length), random)

  return {
    numerals: walkTo(cadence, enabled, length, random),
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
  const ending = cadenceNumerals(cadence)
  const runUp = length - ending.length
  if (runUp === 0) return [...ending]

  const viable = viablePositions(cadence, enabled, runUp)
  // The cadence as positions too, one chord wide each. The lookahead in
  // `aroundTheCircle` has to see past the run-up: `ii` in the last run-up slot
  // is only worth favouring because `V I` follows it, and `ii V I` is the
  // fifths sequence more music is built on than any other.
  const positions = [...viable, ...ending.map((id) => [id])]
  const chords: string[] = [openingChord(viable[0], random)]

  for (let i = 1; i < runUp; i++) {
    const from = chords[i - 1]
    // Nothing twice in a row: the ear cannot tell two of a chord from one of it
    // held longer, so a progression containing them would ask something the
    // sound cannot answer.
    const options = viable[i].filter((id) => canLeadTo(from, id))
    chords.push(pick(aroundTheCircle(from, options, positions, i + 1), random))
  }

  return [...chords, ...ending]
}

function canLeadTo(from: string, to: string): boolean {
  return from !== to && (SUCCESSORS[from] ?? []).includes(to)
}

/**
 * How many falling fifths in a row are still available from here.
 *
 * Greedy — it takes the first fifth it finds at each position rather than
 * searching for the longest possible chain. It is deciding how much to favour
 * an option, not planning the progression, and a wrong answer costs a slightly
 * misplaced weight rather than a broken walk.
 */
function fifthsRunFrom(
  id: string,
  positions: readonly (readonly string[])[],
  at: number,
): number {
  let count = 0
  let current = id

  for (let i = at; i < positions.length && count < MAX_CIRCLE_LOOKAHEAD; i++) {
    const next = positions[i].find(
      (candidate) =>
        canLeadTo(current, candidate) && fallsAFifth(current, candidate),
    )
    if (!next) break
    count++
    current = next
  }

  return count
}

/**
 * The same options, weighted toward the ones that get onto the circle.
 *
 * **Weighted by where a move leads, not by whether the move itself is a
 * fifth.** That was the first attempt and it barely worked — three-chord fifths
 * runs went from 17% of progressions to 29%, and raising the weight from 4 to
 * 12 moved it no further. The plateau was the clue: the bottleneck was never
 * *continuing* a chain, which a plain weight already made likely, but *getting
 * onto* one.
 *
 * The reason is specific to where the diatonic circle runs. From `I` the fifth
 * move is `I IV`, and it dead-ends immediately — the next step round would be
 * `IV vii°`, which is the tritone the diatonic circle is broken at, and the
 * successor table does not lead out of `vii°` to `iii` in any case. The
 * productive run is the other side, `iii vi ii V I`, and the way onto it from
 * the tonic is `I vi` — which is a *third*, so a weight on fifths moves ignored
 * it while favouring the dead end.
 *
 * So an option is scored by how long a fifths run remains from it, counting the
 * cadence, and a move onto the circle is favoured as much as a move along it.
 * That doubled the rate again, to 39%.
 *
 * Repetition rather than a real weighted pick, matching `openingChord`: the
 * lists are a handful of strings long, and one weighting mechanism the reader
 * has already met beats a second, cleverer one.
 *
 * Every option keeps a base weight of 1, so nothing is ever *only* a fifths
 * chain. A hard rule would run every chain to its end and the exercise would
 * become one sequence in different keys — the user would learn the shape rather
 * than the sound, which is the failure the melody generator shipped with when
 * every melody ended on a chord tone.
 */
function aroundTheCircle(
  from: string,
  options: readonly string[],
  positions: readonly (readonly string[])[],
  next: number,
): readonly string[] {
  return options.flatMap((id) => {
    const run =
      (fallsAFifth(from, id) ? 1 : 0) + fifthsRunFrom(id, positions, next)
    const weight =
      1 + CIRCLE_OF_FIFTHS_WEIGHT * Math.min(run, MAX_CIRCLE_LOOKAHEAD)
    return Array.from({ length: weight }, () => id)
  })
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

/**
 * How far a chord's root moves from the one before it.
 *
 * The progression equivalent of melody's steps and leaps. Naming `V` in
 * isolation is not really the skill — the ear tracks how far the harmony has
 * travelled — and it points somewhere concrete, since root movement is hardest
 * to follow when an inversion hides where the root is.
 *
 * ## Directed, not by interval class
 *
 * An earlier version measured the smaller of the two directions, which
 * collapsed a fifth into a fourth and a sixth into a third: three distinct
 * relationships reported as one. `I` to `V` and `V` to `I` are not the same
 * move — one departs and one arrives — and a user can be fluent at one while
 * lost in the other.
 *
 * Roots are pitch classes, so "up" is measured as the ascending distance and
 * the far half is named by its descending complement, which is how the moves
 * are actually spoken about. `I` to `vi` is nine semitones up and every
 * musician calls it down a third; `V` to `IV` is ten up and is a step down.
 * A sixth is therefore tracked — it is the same relationship as a third the
 * other way, and named the way it would be said aloud.
 */
export type RootMovement =
  | 'same'
  | 'up-half-step'
  | 'up-whole-step'
  | 'up-third'
  | 'up-fourth'
  | 'tritone'
  | 'up-fifth'
  | 'down-third'
  | 'down-whole-step'
  | 'down-half-step'

export function rootMovement(
  question: ProgressionQuestion,
  index: number,
): RootMovement {
  const from = numeralById(question.numerals[index - 1]).root
  const to = numeralById(question.numerals[index]).root
  const up = (((to - from) % 12) + 12) % 12

  switch (up) {
    case 0:
      // IV to iv keeps its root and changes mode. Nothing else in the
      // successor table shares a root across a move.
      return 'same'
    case 1:
      return 'up-half-step'
    case 2:
      return 'up-whole-step'
    case 3:
    case 4:
      return 'up-third'
    case 5:
      return 'up-fourth'
    case 6:
      return 'tritone'
    case 7:
      return 'up-fifth'
    case 8:
    case 9:
      return 'down-third'
    case 10:
      return 'down-whole-step'
    default:
      return 'down-half-step'
  }
}

/** Whether this position is one of the chords the cadence is made of. */
export function isCadenceChord(
  question: ProgressionQuestion,
  index: number,
): boolean {
  const ending = cadenceNumerals(question.cadence).length
  return index >= question.numerals.length - ending
}
