import { HIGHEST_NOTE, LOWEST_NOTE, type NoteGroup } from '../audio'
import {
  chordNotes,
  maxInversion,
  numeralById,
  numeralChord,
  numeralRoot,
  type RomanNumeral,
} from '../theory'
import type { ProgressionSettings } from '../settings'
import type { ProgressionQuestion } from './progressionQuestion'

/**
 * Turning a progression into something that sounds like one.
 *
 * The numerals say which chords; this says what they sound like. Played as
 * root-position block chords a progression lurches: every voice jumps at once,
 * the bass leaps by fourths and fifths, and what comes out is a chord chart
 * being read aloud rather than music. What makes a progression sound like a
 * progression is voices moving as little as they have to — common tones held,
 * the bass stepping rather than leaping.
 *
 * So each chord is voiced in whichever enabled inversion and register moves
 * least from the chord before it. Greedy, one chord at a time, rather than
 * optimal over the whole progression: a pianist reading a chart does the same
 * thing, and the difference is not audible against the cost of finding it.
 *
 * ## This is what the inversions setting is for
 *
 * Inversions are heard rather than answered — `I⁶` is still `I`, so the pad
 * stays at one button per chord. What the setting controls is how much freedom
 * the voicing has: root position alone gives the lurching version, and allowing
 * the others gives the smooth one. A setting that changes how the exercise
 * sounds without changing what it asks.
 */

/** How far either side of the tonic's own octave to look for a voicing. */
const OCTAVE_SEARCH = 3

/**
 * Every voicing of a chord that fits, across the inversions and registers.
 *
 * Exported because it is the choice the voicing claims to be making well: what
 * it picked can only be judged against what it could have picked instead.
 */
export function voicingsFor(
  numeral: RomanNumeral,
  tonic: number,
  settings: ProgressionSettings,
): number[][] {
  const chord = numeralChord(numeral)
  const allowed = settings.inversions.filter(
    (inversion) => inversion >= 0 && inversion <= maxInversion(chord),
  )

  const voicings: number[][] = []
  for (let octave = -OCTAVE_SEARCH; octave <= OCTAVE_SEARCH; octave++) {
    for (const inversion of allowed) {
      const notes = chordNotes(
        numeralRoot(numeral, tonic, octave),
        chord,
        inversion,
      )
      if (notes.every((note) => fits(note, settings))) voicings.push(notes)
    }
  }

  return voicings
}

function fits(note: number, settings: ProgressionSettings): boolean {
  return (
    note >= Math.max(settings.range.low, LOWEST_NOTE) &&
    note <= Math.min(settings.range.high, HIGHEST_NOTE)
  )
}

/**
 * How far the voices travel between two chords.
 *
 * Sorted pitch against sorted pitch. Both are triads, so pairing them in order
 * is what a listener hears as the voices: the lowest note becomes the lowest,
 * and a common tone held costs nothing because it pairs with itself.
 */
export function voiceMovement(from: readonly number[], to: readonly number[]) {
  const a = [...from].sort((x, y) => x - y)
  const b = [...to].sort((x, y) => x - y)
  const pairs = Math.min(a.length, b.length)

  let total = 0
  for (let i = 0; i < pairs; i++) total += Math.abs(a[i] - b[i])
  return total
}

/** The middle of the usable range, for placing a chord with nothing before it. */
function centre(settings: ProgressionSettings): number {
  const low = Math.max(settings.range.low, LOWEST_NOTE)
  const high = Math.min(settings.range.high, HIGHEST_NOTE)
  return (low + high) / 2
}

function meanPitch(notes: readonly number[]): number {
  return notes.reduce((sum, note) => sum + note, 0) / notes.length
}

/**
 * Voice a progression, chord by chord.
 *
 * The first chord has nothing to lead from, so it is placed near the middle of
 * the range — which leaves the progression room to move in either direction
 * rather than starting at an edge and being pushed off it.
 */
export function voiceProgression(
  question: ProgressionQuestion,
  settings: ProgressionSettings,
): NoteGroup[] {
  const voiced: number[][] = []

  for (const id of question.numerals) {
    const options = voicingsFor(numeralById(id), question.tonic, settings)
    if (options.length === 0) {
      // Nothing fits the range in any enabled inversion. Falling back on an
      // unplayable chord would be worse than a chord in the wrong octave.
      voiced.push(
        chordNotes(
          numeralRoot(numeralById(id), question.tonic),
          numeralChord(numeralById(id)),
          0,
        ),
      )
      continue
    }

    const previous = voiced[voiced.length - 1]
    voiced.push(
      previous
        ? best(options, (notes) => voiceMovement(previous, notes))
        : best(options, (notes) =>
            Math.abs(meanPitch(notes) - centre(settings)),
          ),
    )
  }

  return voiced
}

/** The option with the lowest score, keeping the first on a tie. */
function best(options: number[][], score: (notes: number[]) => number) {
  let winner = options[0]
  let lowest = score(winner)

  for (const option of options.slice(1)) {
    const value = score(option)
    if (value < lowest) {
      winner = option
      lowest = value
    }
  }

  return winner
}

/**
 * One chord on its own, with nothing to lead from or to.
 *
 * Placed near the middle of the range, the same way a progression's opening
 * chord is. For anything sounded outside a progression — the key reference, and
 * the opening chord of a guess — where there is no neighbour to move least from.
 */
export function voiceChordAlone(
  numeralId: string,
  tonic: number,
  settings: ProgressionSettings,
): number[] {
  const numeral = numeralById(numeralId)
  const options = voicingsFor(numeral, tonic, settings)
  if (options.length === 0) {
    return chordNotes(numeralRoot(numeral, tonic), numeralChord(numeral), 0)
  }
  return best(options, (notes) => Math.abs(meanPitch(notes) - centre(settings)))
}

/**
 * How a guessed chord should sound at a given position.
 *
 * Not the standalone voicing. The progression's chords are voice-led, so the
 * same chord placed on its own sits in a different register and inversion from
 * the one heard in the progression a moment earlier — and a user comparing what
 * they pressed against what they remember would be comparing two arrangements
 * of the same harmony, and could reasonably conclude they had the wrong chord.
 *
 * So it is voiced as though it *were* the chord at that position: least-moving
 * from whatever the progression actually played before it. A right guess then
 * sounds exactly like the chord it is identifying, and a wrong one sounds like
 * the chord that would have been there — same register, so what differs between
 * them is the harmony rather than the arrangement.
 */
export function voiceGuess(
  question: ProgressionQuestion,
  index: number,
  numeralId: string,
  settings: ProgressionSettings,
): number[] {
  // Nothing before the opening chord to lead from, which is the one position
  // the progression itself also places by register.
  if (index <= 0) return voiceChordAlone(numeralId, question.tonic, settings)

  const previous = voiceProgression(question, settings)[index - 1]
  const numeral = numeralById(numeralId)
  const options = voicingsFor(numeral, question.tonic, settings)
  if (options.length === 0) {
    return chordNotes(
      numeralRoot(numeral, question.tonic),
      numeralChord(numeral),
      0,
    )
  }

  return best(options, (notes) => voiceMovement(previous, notes))
}

/**
 * The tonic chord, for the Key button.
 *
 * Voiced on its own rather than taken from the progression, since the user may
 * ask for it before a note of the progression has sounded — and it should
 * always sound the same, so it is a reference rather than another thing to work
 * out.
 */
export function keyChord(
  question: ProgressionQuestion,
  settings: ProgressionSettings,
): number[] {
  return voiceChordAlone('I', question.tonic, settings)
}

/**
 * Which inversion a voiced chord ended up in, read back off its bass note.
 *
 * The voicing chooses inversions for smoothness rather than announcing them,
 * so this recovers the choice after the fact. Worth recording because
 * inversions are the one thing in this exercise that is *heard but never
 * answered* — a user who names chords cleanly in root position and loses them
 * once the bass moves has a specific gap, and an Inversions setting to
 * practise it with.
 */
export function inversionOf(
  numeralId: string,
  tonic: number,
  notes: readonly number[],
): number {
  const numeral = numeralById(numeralId)
  const chord = numeralChord(numeral)

  const rootClass = ((numeralRoot(numeral, tonic) % 12) + 12) % 12
  const bassClass = ((notes[0] % 12) + 12) % 12
  const above = (bassClass - rootClass + 12) % 12

  const inversion = chord.offsets.findIndex((offset) => offset % 12 === above)
  // A bass note that is not a chord tone cannot happen from `voicingsFor`;
  // reading it as root position beats throwing inside a statistics path.
  return inversion < 0 ? 0 : inversion
}

/**
 * The answer id recorded when the bass was taken for the root.
 *
 * A reserved value rather than a numeral, because the fact being recorded is
 * not "they said III" — it is "they named whatever was in the bass". Which
 * numeral that happened to be varies with the inversion and says less than the
 * pattern does.
 */
export const BASS_AS_ROOT = 'bass-as-root'

/**
 * The interval class between two pitches: the smaller of the two directions.
 *
 * A fifth up and a fourth down are one relationship, and an octave
 * displacement is not a different move.
 */
function intervalClass(from: number, to: number): number {
  const distance = Math.abs(to - from) % 12
  return Math.min(distance, 12 - distance)
}

/**
 * How the *bass* moves into a chord, which is not always how the root does.
 *
 * `V IV I` has roots G F C — a step then a fourth. Invert the `I` and its bass
 * is E, so the line is G F E: a whole step then a **half** step. An ear
 * following the bass hears a stepwise descent and reads `V IV III`, because
 * `III` is rooted on E. The harmony did one thing and the bass said another.
 *
 * Half and whole steps are separated here but not in `rootMovement`, and the
 * asymmetry is deliberate. A root moving by a semitone needs a chromatic
 * chord and is rare; a semitone in the *bass* is the commonest artefact of an
 * inversion, and is exactly the one that misleads.
 */
export type BassMovement =
  | 'opening'
  | 'same-note'
  | 'half-step'
  | 'whole-step'
  | 'third'
  | 'fourth-fifth'
  | 'tritone'

export function bassMovement(
  voiced: readonly (readonly number[])[],
  index: number,
): BassMovement {
  if (index <= 0) return 'opening'

  const size = intervalClass(voiced[index - 1][0], voiced[index][0])
  if (size === 0) return 'same-note'
  if (size === 1) return 'half-step'
  if (size === 2) return 'whole-step'
  if (size <= 4) return 'third'
  if (size === 6) return 'tritone'
  return 'fourth-fifth'
}

/**
 * Whether a wrong answer named the chord sitting on the bass note.
 *
 * The signature of hearing the bass as the root: the numeral pressed is rooted
 * on the note that was actually sounding underneath. `I` in first inversion
 * answered as `III`; `V` in first inversion answered as `vii°`.
 *
 * Only counted when the chord was inverted. In root position the bass *is* the
 * root, so this would fire for `IV` answered as `iv` — same root, different
 * quality — which is a mistake about the chord rather than about the bass.
 */
export function isBassMistakenForRoot(
  question: ProgressionQuestion,
  index: number,
  answeredId: string,
  voiced: readonly (readonly number[])[],
): boolean {
  const played = question.numerals[index]
  if (inversionOf(played, question.tonic, voiced[index]) === 0) return false

  const bassClass = ((voiced[index][0] % 12) + 12) % 12
  const answeredRoot = numeralRoot(numeralById(answeredId), question.tonic)
  return ((answeredRoot % 12) + 12) % 12 === bassClass
}
