import { sequence, simultaneous, type NoteGroup } from '../audio'
import {
  CHORDS,
  chordById,
  chordNotes,
  invert,
  maxInversion,
  pitchClass,
  type Chord,
} from '../theory'
import type { ChordPlayMode, ChordSettings } from '../settings'
import type { Random } from './intervalQuestion'

/**
 * Chord question generation and answer checking.
 *
 * ## Collisions
 *
 * Once inversions are enabled, several chords are literally the same set of
 * pitches. C6 (C E G A) and Am7 in first inversion are the same four notes in
 * the same order; so are Cm6 and Am7b5 in first inversion. Diminished 7th and
 * augmented triads are symmetric, so their inversions are transpositions of
 * themselves.
 *
 * There is no way for the ear to tell these apart, so marking one of them wrong
 * would simply be incorrect. `acceptableAnswers` returns every enabled chord
 * that could have produced the audio, and any of them counts. When a question
 * is ambiguous this way, `groupsForChordQuestion` plays the root alone before
 * the chord, so there's a reference tone without giving away which of the
 * colliding chords was actually generated.
 */

export interface ChordQuestion {
  /** The notes as played, lowest first. */
  notes: readonly number[]
  /** The chord that was generated. Not necessarily the only right answer. */
  chordId: string
  inversion: number
  playMode: ChordPlayMode
  /**
   * The MIDI note the chord was built on, before inversion is applied. Use
   * `chordRootPitch` to get the root's actual sounding pitch in this voicing.
   */
  root: number
}

/** A chord and inversion that fit inside the configured range. */
export interface ChordCandidate {
  chord: Chord
  inversion: number
}

function spanOf(chord: Chord, inversion: number): number {
  const offsets = invert(chord.offsets, inversion)
  return offsets[offsets.length - 1] - offsets[0]
}

/**
 * Every chord and inversion pairing that is enabled, legal, and narrow enough
 * for the range. Empty means no question can be generated.
 */
export function chordCandidates(settings: ChordSettings): ChordCandidate[] {
  const span = settings.range.high - settings.range.low
  const candidates: ChordCandidate[] = []

  for (const id of settings.chords) {
    const chord = chordById(id)
    for (const inversion of settings.inversions) {
      // 3rd inversion needs four voices; a triad simply skips it rather than
      // dropping out of the pool entirely.
      if (inversion > maxInversion(chord)) continue
      if (spanOf(chord, inversion) > span) continue
      candidates.push({ chord, inversion })
    }
  }

  return candidates
}

export function canGenerateChord(settings: ChordSettings): boolean {
  return chordCandidates(settings).length > 0 && settings.playModes.length > 0
}

function pick<T>(options: readonly T[], random: Random): T {
  return options[Math.floor(random() * options.length)]
}

export function generateChordQuestion(
  settings: ChordSettings,
  random: Random = Math.random,
): ChordQuestion {
  const candidates = chordCandidates(settings)
  if (candidates.length === 0 || settings.playModes.length === 0) {
    throw new Error(
      'No chord question can be generated: check the enabled chords, inversions, play modes and range',
    )
  }

  const { chord, inversion } = pick(candidates, random)
  const playMode = pick(settings.playModes, random)

  // Place the chord so every voice lands inside the range. After an inversion
  // the lowest offset is no longer zero, so the root can sit below the range.
  const offsets = invert(chord.offsets, inversion)
  const lowestRoot = settings.range.low - offsets[0]
  const highestRoot = settings.range.high - offsets[offsets.length - 1]
  const root =
    lowestRoot + Math.floor(random() * (highestRoot - lowestRoot + 1))

  return {
    notes: chordNotes(root, chord, inversion),
    chordId: chord.id,
    inversion,
    playMode,
    root,
  }
}

/**
 * The root's actual pitch within this voicing, as opposed to the bass note.
 *
 * `invert` always raises the root by exactly one octave the moment the
 * inversion moves off root position, and never raises it further as the
 * inversion goes higher — the root is always the smallest of a chord's
 * offsets, so it's always among the "lowest n" voices `invert` shifts,
 * however many voices the chord has or however deep the inversion goes.
 */
export function chordRootPitch(question: ChordQuestion): number {
  return question.root + (question.inversion > 0 ? 12 : 0)
}

/** Whether more than one enabled chord could have produced this question's audio. */
export function isAmbiguous(
  question: ChordQuestion,
  enabledChords: readonly string[],
): boolean {
  return acceptableAnswers(question.notes, enabledChords).size > 1
}

/**
 * Audio shape for a chord question.
 *
 * When more than one enabled chord could explain the notes played — see the
 * collision cases at the top of this file — the root is played alone first,
 * at the pitch it actually sounds at in this voicing, before the chord
 * itself. That gives a reference for which chord was actually generated
 * without giving away the inversion; every colliding answer is still
 * accepted regardless.
 */
export function groupsForChordQuestion(
  question: ChordQuestion,
  enabledChords: readonly string[] = [],
): NoteGroup[] {
  const notes = [...question.notes]
  const chordGroups =
    question.playMode === 'arpeggiated' ? sequence(notes) : simultaneous(notes)

  if (!isAmbiguous(question, enabledChords)) return chordGroups
  return [[chordRootPitch(question)], ...chordGroups]
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value))
}

/**
 * Every enabled chord that could have produced these notes.
 *
 * A chord matches when its pitch classes and its bass note both agree with what
 * was played.
 *
 * For close-position triads and sevenths the bass check rarely excludes
 * anything, since rotating through the inversions puts every voice in the bass
 * in turn. It earns its keep on chords with extensions: an Add9's 9th sits an
 * octave up, so no inversion ever brings it to the bottom, and a voicing with
 * that note in the bass is genuinely a different chord.
 */
export function acceptableAnswers(
  notes: readonly number[],
  enabled: readonly string[],
): Set<string> {
  const playedPitchClasses = new Set(notes.map(pitchClass))
  const playedBass = pitchClass(notes[0])
  const matches = new Set<string>()

  for (const id of enabled) {
    const chord = chordById(id)

    for (let inversion = 0; inversion <= maxInversion(chord); inversion++) {
      const offsets = invert(chord.offsets, inversion)

      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        const bass = pitchClass(rootPitchClass + offsets[0])
        if (bass !== playedBass) continue

        const pitchClasses = new Set(
          offsets.map((offset) => pitchClass(rootPitchClass + offset)),
        )
        if (sameSet(pitchClasses, playedPitchClasses)) {
          matches.add(id)
        }
      }
    }
  }

  return matches
}

export function isChordCorrect(
  question: ChordQuestion,
  guessId: string,
  enabled: readonly string[],
): boolean {
  return acceptableAnswers(question.notes, enabled).has(guessId)
}

export const ALL_CHORD_IDS = CHORDS.map((chord) => chord.id)
