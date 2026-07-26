import { describe, expect, it } from 'vitest'
import {
  MIDI_MAX,
  MIDI_MIN,
  MIDDLE_C,
  midiToName,
  midiToPitchClassName,
  nameToMidi,
  notesInRange,
  octaveOf,
  pitchClass,
} from './pitch'

describe('midiToName', () => {
  it.each([
    [MIDDLE_C, 'C4'],
    [0, 'C-1'],
    [21, 'A0'],
    [49, 'C#3'],
    [69, 'A4'],
    [108, 'C8'],
    [127, 'G9'],
  ])('formats %i as %s', (midi, name) => {
    expect(midiToName(midi)).toBe(name)
  })

  it('throws outside the MIDI range', () => {
    expect(() => midiToName(-1)).toThrow(RangeError)
    expect(() => midiToName(128)).toThrow(RangeError)
    expect(() => midiToName(60.5)).toThrow(RangeError)
  })
})

describe('nameToMidi', () => {
  it.each([
    ['C4', 60],
    ['C#3', 49],
    ['A0', 21],
    ['G9', 127],
    ['C-1', 0],
  ])('parses %s as %i', (name, midi) => {
    expect(nameToMidi(name)).toBe(midi)
  })

  it('accepts flats and unicode accidentals even though we never emit them', () => {
    expect(nameToMidi('Db4')).toBe(nameToMidi('C#4'))
    expect(nameToMidi('B♭3')).toBe(nameToMidi('A#3'))
    expect(nameToMidi('C♯3')).toBe(49)
  })

  it('is case insensitive on the letter and tolerates surrounding space', () => {
    expect(nameToMidi(' c4 ')).toBe(60)
  })

  it('rejects unparseable names', () => {
    expect(() => nameToMidi('H4')).toThrow(SyntaxError)
    expect(() => nameToMidi('C')).toThrow(SyntaxError)
    expect(() => nameToMidi('')).toThrow(SyntaxError)
  })

  it('rejects names outside the MIDI range', () => {
    expect(() => nameToMidi('C-2')).toThrow(RangeError)
    expect(() => nameToMidi('C10')).toThrow(RangeError)
  })
})

describe('round trips', () => {
  it('survives midi -> name -> midi across the whole MIDI range', () => {
    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      expect(nameToMidi(midiToName(midi))).toBe(midi)
    }
  })
})

describe('pitchClass and octaveOf', () => {
  it('treats C as pitch class 0 in every octave', () => {
    for (let midi = 0; midi <= MIDI_MAX; midi += 12) {
      expect(pitchClass(midi)).toBe(0)
      expect(midiToPitchClassName(midi)).toBe('C')
    }
  })

  it('starts each octave at C', () => {
    expect(octaveOf(59)).toBe(3)
    expect(octaveOf(60)).toBe(4)
    expect(octaveOf(71)).toBe(4)
    expect(octaveOf(72)).toBe(5)
  })
})

describe('notesInRange', () => {
  it('is inclusive of both bounds', () => {
    expect(notesInRange(60, 63)).toEqual([60, 61, 62, 63])
    expect(notesInRange(60, 60)).toEqual([60])
  })

  it('throws on an inverted range', () => {
    expect(() => notesInRange(63, 60)).toThrow(RangeError)
  })
})
