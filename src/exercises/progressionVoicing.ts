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
  const tonicNumeral = numeralById('I')
  const options = voicingsFor(tonicNumeral, question.tonic, settings)
  if (options.length === 0) {
    return chordNotes(question.tonic, numeralChord(tonicNumeral), 0)
  }
  return best(options, (notes) => Math.abs(meanPitch(notes) - centre(settings)))
}
