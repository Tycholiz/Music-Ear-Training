import { sequence, simultaneous, type NoteGroup } from '../audio'
import { pitchClass } from '../theory'
import type { ChordSettings, ExerciseStats } from '../settings'
import {
  chordRootPitch,
  generateChordQuestion,
  type ChordQuestion,
} from './chordQuestion'
import type { Random } from './intervalQuestion'

/**
 * Chord root recognition: hear a chord, identify its root.
 *
 * The question is the same object the chord exercise uses — a chord, an
 * inversion, a play mode — so generation is shared. What differs is which part
 * of it is the answer, and how the answer is checked.
 */

/**
 * A chord to find the root of. Structurally identical to a `ChordQuestion`;
 * the alias exists so screens read as being about roots.
 */
export type RootQuestion = ChordQuestion

export function generateRootQuestion(
  settings: ChordSettings,
  random?: Random,
  stats?: ExerciseStats,
): RootQuestion {
  return generateChordQuestion(settings, random, stats)
}

/**
 * The note being asked for, at the pitch it actually sounds at in this voicing.
 *
 * For an inverted chord that is not the bass note — it is the root an octave
 * up, which is the whole difficulty of the exercise.
 */
export function rootAnswer(question: RootQuestion): number {
  return chordRootPitch(question)
}

/**
 * Audio for a root question: the chord, and nothing else.
 *
 * Deliberately *not* `groupsForChordQuestion`. That one prepends the root as a
 * reference tone whenever several enabled chords share the same notes, which is
 * exactly the right thing when the question is "which chord is this" and
 * exactly the wrong thing here — it would announce the answer before asking.
 */
export function groupsForRootQuestion(question: RootQuestion): NoteGroup[] {
  const notes = [...question.notes]
  return question.playMode === 'arpeggiated'
    ? sequence(notes)
    : simultaneous(notes)
}

/**
 * Whether a heard note is the root.
 *
 * **Any octave counts.** A bass cannot hum a C6 and a soprano cannot hum a C2;
 * requiring the written octave would test vocal range rather than ears. It also
 * makes the exercise robust to the octave errors autocorrelation pitch
 * detection is prone to.
 *
 * `heard` may be fractional. It is rounded to the nearest semitone first, so a
 * note up to 50 cents off still counts — the point is identifying the note, not
 * singing it in tune.
 */
export function matchesRoot(heard: number, question: RootQuestion): boolean {
  return pitchClass(Math.round(heard)) === pitchClass(rootAnswer(question))
}
