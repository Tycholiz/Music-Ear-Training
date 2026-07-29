import { LOWEST_NOTE, isPlayable, type MelodyPhrase } from '../audio'
import {
  DEGREES_PER_OCTAVE,
  degreeOf,
  degreePitch,
  scaleById,
  sharedDegrees,
  tonicChord,
  type Degree,
  type Scale,
} from '../theory'
import type { MelodySettings } from '../settings'
import type { Random } from './intervalQuestion'

/**
 * Melody generation and answer checking.
 *
 * ## Steps are scale steps
 *
 * Everything here works in *scale positions* — an index into the scale's
 * degrees — rather than in semitones. A step is one position, whatever
 * distance that happens to be: two semitones between 1 and 2 of the major
 * scale, three between 1 and b3 of the minor pentatonic. Measuring in
 * semitones instead would make the pentatonics look like they were leaping
 * about when they are doing nothing of the sort, and would have the generator
 * write different music for different scales for no musical reason.
 *
 * Positions run from 0 (the tonic) up to `scale.degrees.length` (the octave
 * above it), so a melody spans an octave and no more. That keeps every note
 * inside the configured range by construction rather than by rejection, and
 * an octave is as far as a melody needs to go to ask what it is asking.
 *
 * ## Why melodies are shaped at all
 *
 * Random notes from a scale sound like noise that happens to be in key. Noise
 * is harder to transcribe without being more useful — the difficulty comes
 * from having nothing to hold onto rather than from the degrees themselves.
 * So the generator prefers steps, resolves leaps by turning back, and likes to
 * end at rest. None of that is decoration; a phrase that behaves like music is
 * a phrase the ear can follow, which is the thing being trained.
 *
 * ## Several scales at once
 *
 * Each question picks one of the selected scales. That is a harder exercise
 * than any one of them alone and a different one: the ear has to place the
 * degree *and* work out which scale it is placing it in, which is what
 * listening to real music actually asks.
 *
 * A featured degree must therefore be common to every selected scale. One that
 * only some of them contain could not be guaranteed — the question that picked
 * a scale without it would have to break the promise — and a guarantee that
 * sometimes holds is exactly what featuring exists to replace.
 *
 * ## Where melodies start
 *
 * Anywhere in the scale. Because the tonic chord sounds *underneath* the
 * melody throughout, the reference is continuously available and the opening
 * note no longer has to establish it. Insisting on the tonic would only make
 * every melody begin the same way, which is a tell rather than a help.
 */

export interface MelodyQuestion {
  /** The answer: the degrees to be identified, in order. */
  degrees: readonly Degree[]
  /** The melody as it sounds. */
  notes: readonly number[]
  /** Sounded underneath throughout. Empty when backing is switched off. */
  backing: readonly number[]
  tonic: number
  scaleId: string
}

/** How far a melody may range: one octave, so it fits the window it is given. */
const MELODY_SPAN = DEGREES_PER_OCTAVE

/**
 * Weights for the next position, indexed by distance from the current one.
 *
 * Steps dominate, small leaps happen, wide leaps are rare — the proportions of
 * an ordinary tune. Index 0 is repeating a note, which is common in real
 * melodies and gives the ear somewhere to rest mid-phrase.
 */
const MOTION_WEIGHTS = [2, 6, 3, 2, 1] as const

/** How many whole melodies to try before admitting the constraints don't fit. */
const MAX_ATTEMPTS = 40

/**
 * How much a melody leans towards ending at rest.
 *
 * Enough that most phrases close where a phrase ought to, short of the
 * certainty that would let a user rule out four degrees before listening.
 */
const RESTING_BIAS = 16

/**
 * The pitch at a scale position, counting 0 as the tonic.
 *
 * Positions past the end of the scale wrap into the octave above, which is how
 * a melody climbs past the 7 without the caller tracking octaves.
 */
function positionPitch(scale: Scale, tonic: number, position: number): number {
  const size = scale.degrees.length
  const octave = Math.floor(position / size)
  return degreePitch(tonic, scale.degrees[position - octave * size], octave)
}

function positionDegree(scale: Scale, position: number): Degree {
  const size = scale.degrees.length
  return scale.degrees[position - Math.floor(position / size) * size]
}

function pick<T>(options: readonly T[], random: Random): T {
  return options[Math.floor(random() * options.length)]
}

function pickWeighted<T>(
  options: readonly T[],
  weights: readonly number[],
  random: Random,
): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let cursor = random() * total
  for (const [i, option] of options.entries()) {
    cursor -= weights[i]
    if (cursor < 0) return option
  }
  return options[options.length - 1]
}

/** Tonics that leave a full octave of room inside the range. */
function tonicWindow(settings: MelodySettings): { low: number; high: number } {
  return {
    low: settings.range.low,
    high: settings.range.high - MELODY_SPAN,
  }
}

/**
 * Whether these settings can produce a melody at all.
 *
 * In the spirit of `canGenerateChord`: the screen is told rather than the
 * generator spinning. Three ways to be stuck — a range too narrow to hold an
 * octave, a melody too short to fit everything it must feature, and a featured
 * degree the chosen scale does not contain.
 */
export function canGenerateMelody(settings: MelodySettings): boolean {
  const scales = selectedScales(settings)
  if (scales.length === 0) return false
  if (settings.length < 1) return false

  const window = tonicWindow(settings)
  if (window.high < window.low) return false

  const featured = uniqueFeatured(settings)
  if (featured.length > settings.length) return false

  // Every selected scale has to be able to deliver every featured degree,
  // since any of them may be the one a question picks.
  const shared = sharedDegrees(scales)
  return featured.every((degree) => shared.includes(degree))
}

/**
 * The scales a question may be drawn from.
 *
 * Unknown ids are dropped rather than thrown on: they come from stale
 * persisted settings, and a predicate whose job is answering "will this work?"
 * should answer it.
 */
export function selectedScales(settings: MelodySettings): Scale[] {
  return settings.scaleIds.flatMap((id) => {
    try {
      return [scaleById(id)]
    } catch {
      return []
    }
  })
}

function uniqueFeatured(settings: MelodySettings): Degree[] {
  return [...new Set(settings.featured)]
}

/**
 * The chord heard under the melody, as sounding pitches.
 *
 * An octave below the tonic, so it sits under the melody rather than tangling
 * with it — the melody occupies the octave *above* the tonic, and a backing in
 * the same register would compete with the notes being transcribed instead of
 * supporting them. It drops back to the tonic's own octave only when there is
 * no piano left underneath.
 *
 * `drone` is the tonic alone. It still says where home is, but says nothing
 * about the quality of the key, so the thirds and sixths have to be heard
 * rather than read off the harmony.
 */
export function backingNotes(
  scale: Scale,
  tonic: number,
  backing: MelodySettings['backing'],
): number[] {
  if (backing === 'none') return []

  const root = tonic - DEGREES_PER_OCTAVE
  const base = isPlayable(root) && root >= LOWEST_NOTE ? root : tonic
  const degrees = backing === 'drone' ? [0] : tonicChord(scale)

  return degrees.map((degree) => base + degree)
}

export function generateMelodyQuestion(
  settings: MelodySettings,
  random: Random = Math.random,
): MelodyQuestion {
  if (!canGenerateMelody(settings)) {
    throw new Error(
      'No melody can be generated: check the scale, featured degrees, length and range',
    )
  }

  const scale = pick(selectedScales(settings), random)
  const featured = uniqueFeatured(settings)
  const window = tonicWindow(settings)
  const tonic =
    window.low + Math.floor(random() * (window.high - window.low + 1))

  let positions = melodyPositions(scale, settings, featured, random)
  for (
    let attempt = 1;
    attempt < MAX_ATTEMPTS && !featuresAll(scale, positions, featured);
    attempt++
  ) {
    positions = melodyPositions(scale, settings, featured, random)
  }

  return {
    degrees: positions.map((position) => positionDegree(scale, position)),
    notes: positions.map((position) => positionPitch(scale, tonic, position)),
    backing: backingNotes(scale, tonic, settings.backing),
    tonic,
    scaleId: scale.id,
  }
}

function featuresAll(
  scale: Scale,
  positions: readonly number[],
  featured: readonly Degree[],
): boolean {
  const sounded = new Set(positions.map((p) => positionDegree(scale, p)))
  return featured.every((degree) => sounded.has(degree))
}

/** One attempt at a melody, as scale positions. */
function melodyPositions(
  scale: Scale,
  settings: MelodySettings,
  featured: readonly Degree[],
  random: Random,
): number[] {
  const top = scale.degrees.length
  const all = range(0, top)
  const resting = restingPositions(scale)

  const positions = [pick(all, random)]

  for (let i = 1; i < settings.length; i++) {
    const from = positions[positions.length - 1]
    const remaining = settings.length - i
    const missing = featured.filter(
      (degree) => !positions.some((p) => positionDegree(scale, p) === degree),
    )

    // Running out of room: every note left has to earn its place, or the
    // melody comes back missing something it was supposed to drill.
    const required =
      missing.length >= remaining
        ? all.filter((p) => missing.includes(positionDegree(scale, p)))
        : null

    const last = i === settings.length - 1

    positions.push(
      nextPosition(
        from,
        positions,
        top,
        { required, favoured: last ? resting : null },
        random,
      ),
    )
  }

  return positions
}

/**
 * Where a melody may come to rest: the degrees of the tonic chord.
 *
 * A note sounds at rest exactly when it belongs to the harmony under it, which
 * is the same question `tonicChord` answers — hence the same set. Weighted
 * rather than required, and deliberately so: a melody that *always* ended on a
 * chord tone would narrow the last answer to three degrees out of seven before
 * the user had heard a thing, which is a tell that grows with every question
 * they answer.
 */
function restingPositions(scale: Scale): number[] {
  const chord = tonicChord(scale)
  return range(0, scale.degrees.length).filter((position) =>
    chord.includes(positionDegree(scale, position)),
  )
}

/**
 * The next position, favouring stepwise motion.
 *
 * A leap is answered by a step back against it, which is what stops a melody
 * from wandering off in one direction and never returning — the oldest rule in
 * counterpoint, and the one that most makes a line sound intentional.
 */
function nextPosition(
  from: number,
  sofar: readonly number[],
  top: number,
  pull: {
    /** Must be one of these. Used where a guarantee has been made. */
    required: readonly number[] | null
    /** Weighted towards these, but not confined to them. */
    favoured: readonly number[] | null
  },
  random: Random,
): number {
  const previous = sofar.length >= 2 ? sofar[sofar.length - 2] : null
  const leapt = previous !== null && Math.abs(from - previous) >= 2
  const back = leapt ? Math.sign(previous - from) : 0

  const candidates = range(0, top)
  const weights = candidates.map((position) => {
    const distance = Math.abs(position - from)
    let weight = MOTION_WEIGHTS[Math.min(distance, MOTION_WEIGHTS.length - 1)]

    // After a leap, a step back the other way is what the ear expects.
    if (leapt) {
      const direction = Math.sign(position - from)
      weight *= direction === back && distance === 1 ? 6 : 1
      if (direction === -back && distance >= 2) weight *= 0.2
    }

    return weight
  })

  const { required, favoured } = pull

  if (favoured && favoured.length > 0) {
    for (const [i, position] of candidates.entries()) {
      if (favoured.includes(position)) weights[i] *= RESTING_BIAS
    }
  }

  if (required && required.length > 0) {
    for (const [i, position] of candidates.entries()) {
      if (!required.includes(position)) weights[i] = 0
    }
    // Nothing required is reachable under the motion weights. The guarantee
    // outranks the shaping, so take one anyway rather than return a melody
    // missing the degree it was supposed to drill.
    if (weights.every((weight) => weight === 0)) {
      return pick(required, random)
    }
  }

  return pickWeighted(candidates, weights, random)
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

/**
 * The pitch to sound when a degree is pressed as a guess.
 *
 * Not simply `degreePitch(tonic, degree)`. A melody runs from the tonic to the
 * octave above it, so the tonic is the one degree with two pitches available —
 * the bottom note and the top — and `degreePitch` always returns the bottom.
 * A user who heard the melody's 1 up at the octave, pressed 1, and was
 * answered an octave lower would reasonably conclude they had misheard, when
 * what they had actually done was press the right button.
 *
 * So the pitch comes from the melody itself wherever the melody has one.
 * Degrees it never played fall back to the plain octave, which is inside the
 * same span, so a wrong guess still sounds in the register of the thing it is
 * being compared against.
 */
export function guessPitch(question: MelodyQuestion, degree: Degree): number {
  const sounded = question.notes.find(
    (note) => degreeOf(question.tonic, note) === degree,
  )
  return sounded ?? degreePitch(question.tonic, degree)
}

/** Audio for a melody question: the melody, over whatever backs it. */
export function phraseForMelodyQuestion(
  question: MelodyQuestion,
): MelodyPhrase {
  return { melody: question.notes, backing: question.backing }
}

export interface MelodyResult {
  /** Whether every position matched. */
  correct: boolean
  /** Per position, whether the entered degree was the right one. */
  positions: boolean[]
}

/**
 * Grade an entered sequence against the melody.
 *
 * Positions are compared one for one, so the screen can show *which* degree
 * was missed rather than only that the melody was wrong — being told you got
 * the fourth note wrong is a lesson; being told you failed is a score.
 *
 * Degrees are already octave-agnostic, so a 5 is a 5 wherever it sounded.
 */
export function checkMelody(
  entered: readonly Degree[],
  question: MelodyQuestion,
): MelodyResult {
  const positions = question.degrees.map(
    (degree, i) => i < entered.length && entered[i] === degree,
  )

  return {
    correct:
      entered.length === question.degrees.length && positions.every(Boolean),
    positions,
  }
}
