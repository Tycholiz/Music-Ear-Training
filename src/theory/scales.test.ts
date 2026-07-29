import { describe, expect, it } from 'vitest'
import {
  ALL_DEGREES,
  DEGREES_PER_OCTAVE,
  SCALES,
  degreeLabel,
  degreeOf,
  degreePitch,
  isValidDegree,
  combinedDegrees,
  scaleById,
  scaleContains,
  scalesByDifficulty,
  sharedDegrees,
  tonicChord,
} from './scales'
import { MIDDLE_C, nameToMidi } from './pitch'

describe('degrees', () => {
  it('covers the octave once', () => {
    expect(ALL_DEGREES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(ALL_DEGREES).toHaveLength(DEGREES_PER_OCTAVE)
  })

  it('labels the naturals by number', () => {
    expect(degreeLabel(0)).toBe('1')
    expect(degreeLabel(2)).toBe('2')
    expect(degreeLabel(4)).toBe('3')
    expect(degreeLabel(5)).toBe('4')
    expect(degreeLabel(7)).toBe('5')
    expect(degreeLabel(9)).toBe('6')
    expect(degreeLabel(11)).toBe('7')
  })

  it('spells the accidentals as flats, never sharps', () => {
    // b3 is how a minor third is written and read. A button saying #2 would
    // look like a bug, whatever midiToName does for absolute pitches.
    expect(degreeLabel(1)).toBe('♭2')
    expect(degreeLabel(3)).toBe('♭3')
    expect(degreeLabel(6)).toBe('♭5')
    expect(degreeLabel(8)).toBe('♭6')
    expect(degreeLabel(10)).toBe('♭7')

    for (const degree of ALL_DEGREES) {
      expect(degreeLabel(degree)).not.toContain('#')
    }
  })

  it('has a distinct label for every degree', () => {
    const labels = ALL_DEGREES.map(degreeLabel)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('rejects anything outside the octave', () => {
    expect(isValidDegree(0)).toBe(true)
    expect(isValidDegree(11)).toBe(true)
    expect(isValidDegree(12)).toBe(false)
    expect(isValidDegree(-1)).toBe(false)
    expect(isValidDegree(1.5)).toBe(false)
    expect(() => degreeLabel(12)).toThrow(RangeError)
  })
})

describe('SCALES', () => {
  it('has unique ids, names and levels', () => {
    const ids = SCALES.map((s) => s.id)
    const names = SCALES.map((s) => s.name)
    const levels = SCALES.map((s) => s.level)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(levels).size).toBe(levels.length)
  })

  it('starts every scale on the tonic, ascending, without duplicates', () => {
    for (const scale of SCALES) {
      expect(scale.degrees[0], scale.name).toBe(0)
      expect([...scale.degrees], scale.name).toEqual(
        [...scale.degrees].sort((a, b) => a - b),
      )
      expect(new Set(scale.degrees).size, scale.name).toBe(scale.degrees.length)
    }
  })

  it('only uses degrees inside one octave', () => {
    for (const scale of SCALES) {
      for (const degree of scale.degrees) {
        expect(isValidDegree(degree), `${scale.name} ${degree}`).toBe(true)
      }
    }
  })

  it('spells the scales correctly', () => {
    expect(scaleById('major-pentatonic').degrees).toEqual([0, 2, 4, 7, 9])
    expect(scaleById('minor-pentatonic').degrees).toEqual([0, 3, 5, 7, 10])
    expect(scaleById('major').degrees).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(scaleById('natural-minor').degrees).toEqual([0, 2, 3, 5, 7, 8, 10])
    // Dorian and Mixolydian each differ from a parent scale by one note, which
    // is what makes them useful for isolating that note.
    expect(scaleById('dorian').degrees).toEqual([0, 2, 3, 5, 7, 9, 10])
    expect(scaleById('mixolydian').degrees).toEqual([0, 2, 4, 5, 7, 9, 10])
    expect(scaleById('harmonic-minor').degrees).toEqual([0, 2, 3, 5, 7, 8, 11])
    expect(scaleById('blues').degrees).toEqual([0, 3, 5, 6, 7, 10])
    expect(scaleById('chromatic').degrees).toEqual(ALL_DEGREES)
  })

  it('gives the pentatonics no semitones, which is what makes them easiest', () => {
    for (const id of ['major-pentatonic', 'minor-pentatonic']) {
      const { degrees } = scaleById(id)
      const steps = degrees.map((d, i) =>
        i === 0
          ? DEGREES_PER_OCTAVE + degrees[0] - degrees.at(-1)!
          : d - degrees[i - 1],
      )
      for (const step of steps) expect(step, id).toBeGreaterThan(1)
    }
  })

  it('throws on an unknown id rather than returning nothing', () => {
    expect(() => scaleById('lydian-dominant')).toThrow(RangeError)
  })
})

describe('the difficulty ladder', () => {
  it('puts the pentatonics first and the chromatic last', () => {
    const ordered = scalesByDifficulty().map((s) => s.id)
    expect(ordered[0]).toBe('major-pentatonic')
    expect(ordered[1]).toBe('minor-pentatonic')
    expect(ordered.at(-1)).toBe('chromatic')
  })

  it('orders by level, not by table position or name', () => {
    const levels = scalesByDifficulty().map((s) => s.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('leaves gaps between levels, so a scale can be slotted in later', () => {
    // Renumbering would invalidate nothing persisted — ids are what persist —
    // but contiguous levels would still force a diff across the whole table.
    const levels = scalesByDifficulty().map((s) => s.level)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeGreaterThan(1)
    }
  })

  it('lists every scale exactly once', () => {
    expect(scalesByDifficulty()).toHaveLength(SCALES.length)
  })

  it('does not reorder the table itself', () => {
    const before = SCALES.map((s) => s.id)
    scalesByDifficulty()
    expect(SCALES.map((s) => s.id)).toEqual(before)
  })
})

describe('scaleContains', () => {
  it('knows the major scale has a 7 but no b7', () => {
    const major = scaleById('major')
    expect(scaleContains(major, 11)).toBe(true)
    expect(scaleContains(major, 10)).toBe(false)
  })

  it('accepts every degree of the chromatic scale', () => {
    const chromatic = scaleById('chromatic')
    for (const degree of ALL_DEGREES) {
      expect(scaleContains(chromatic, degree)).toBe(true)
    }
  })
})

describe('sharedDegrees', () => {
  it('is the scale itself for one scale', () => {
    const major = scaleById('major')
    expect(sharedDegrees([major])).toEqual([...major.degrees])
  })

  it('is what two scales agree on', () => {
    // Major and blues share 1, 4 and 5 and nothing else.
    expect(sharedDegrees([scaleById('major'), scaleById('blues')])).toEqual([
      0, 5, 7,
    ])
  })

  it('narrows as more scales are added, never widens', () => {
    const scales = [scaleById('major'), scaleById('blues'), scaleById('dorian')]
    const two = sharedDegrees(scales.slice(0, 2))
    const three = sharedDegrees(scales)
    for (const degree of three) expect(two).toContain(degree)
  })

  it('is empty for no scales, since nothing is common to nothing', () => {
    expect(sharedDegrees([])).toEqual([])
  })

  it('stays ascending', () => {
    const shared = sharedDegrees([
      scaleById('chromatic'),
      scaleById('natural-minor'),
    ])
    expect(shared).toEqual([...shared].sort((a, b) => a - b))
  })
})

describe('combinedDegrees', () => {
  it('is the scale itself for one scale', () => {
    const blues = scaleById('blues')
    expect(combinedDegrees([blues])).toEqual([...blues.degrees])
  })

  it('is everything either scale has, without duplicates', () => {
    const both = combinedDegrees([
      scaleById('major-pentatonic'),
      scaleById('minor-pentatonic'),
    ])
    expect(both).toEqual([0, 2, 3, 4, 5, 7, 9, 10])
    expect(new Set(both).size).toBe(both.length)
  })

  it('tops out at the chromatic scale', () => {
    expect(combinedDegrees(SCALES)).toEqual(ALL_DEGREES)
  })

  it('is empty for no scales', () => {
    expect(combinedDegrees([])).toEqual([])
  })
})

describe('tonicChord', () => {
  it('takes its third from the scale, not from an assumption', () => {
    expect(tonicChord(scaleById('major'))).toEqual([0, 4, 7])
    expect(tonicChord(scaleById('natural-minor'))).toEqual([0, 3, 7])
    expect(tonicChord(scaleById('harmonic-minor'))).toEqual([0, 3, 7])
    expect(tonicChord(scaleById('dorian'))).toEqual([0, 3, 7])
    expect(tonicChord(scaleById('mixolydian'))).toEqual([0, 4, 7])
  })

  it('handles the pentatonics, which have a third but fewer of everything else', () => {
    expect(tonicChord(scaleById('major-pentatonic'))).toEqual([0, 4, 7])
    expect(tonicChord(scaleById('minor-pentatonic'))).toEqual([0, 3, 7])
  })

  it('gives blues a minor third, the only one it has', () => {
    expect(tonicChord(scaleById('blues'))).toEqual([0, 3, 7])
  })

  it('leaves the chromatic scale a bare fifth', () => {
    // Chromatic contains both thirds, so either one would clash with half the
    // melodies drawn from it. A fifth asserts the tonic and nothing else.
    expect(tonicChord(scaleById('chromatic'))).toEqual([0, 7])
  })

  it('never puts a note under the melody that is outside the scale', () => {
    // This is the whole point: the backing has to be a reference, not a
    // wrong note sounding against every phrase.
    for (const scale of SCALES) {
      for (const degree of tonicChord(scale)) {
        expect(scaleContains(scale, degree), `${scale.name} ${degree}`).toBe(
          true,
        )
      }
    }
  })

  it('never sounds both thirds at once', () => {
    for (const scale of SCALES) {
      const chord = tonicChord(scale)
      expect(chord.includes(3) && chord.includes(4), scale.name).toBe(false)
    }
  })

  it('always contains the tonic, ascending and without duplicates', () => {
    for (const scale of SCALES) {
      const chord = tonicChord(scale)
      expect(chord[0], scale.name).toBe(0)
      expect(chord, scale.name).toEqual([...chord].sort((a, b) => a - b))
      expect(new Set(chord).size, scale.name).toBe(chord.length)
    }
  })

  it('drops the fifth for a scale that has none', () => {
    // Locrian is not on the ladder, but the rule should not depend on that.
    const locrian = {
      id: 'locrian',
      name: 'Locrian',
      level: 999,
      degrees: [0, 1, 3, 5, 6, 8, 10],
    }
    expect(tonicChord(locrian)).toEqual([0, 3])
  })
})

describe('degreePitch', () => {
  it('sounds the tonic itself for degree 1', () => {
    expect(degreePitch(MIDDLE_C, 0)).toBe(MIDDLE_C)
  })

  it('sounds a 5 a perfect fifth above the tonic', () => {
    expect(degreePitch(MIDDLE_C, 7)).toBe(nameToMidi('G4'))
  })

  it('raises and lowers by whole octaves', () => {
    expect(degreePitch(MIDDLE_C, 4, 1)).toBe(nameToMidi('E5'))
    expect(degreePitch(MIDDLE_C, 4, -1)).toBe(nameToMidi('E3'))
  })

  it('works from a tonic that is not C', () => {
    const a3 = nameToMidi('A3')
    expect(degreePitch(a3, 3)).toBe(nameToMidi('C4'))
    expect(degreePitch(a3, 7)).toBe(nameToMidi('E4'))
  })

  it('rejects a degree outside the octave', () => {
    expect(() => degreePitch(MIDDLE_C, 12)).toThrow(RangeError)
  })
})

describe('degreeOf', () => {
  it('reads a sounding pitch back as its degree', () => {
    expect(degreeOf(MIDDLE_C, nameToMidi('G4'))).toBe(7)
    expect(degreeOf(MIDDLE_C, nameToMidi('Eb4'))).toBe(3)
  })

  it('ignores the octave, the way root matching does', () => {
    // A 5 is a 5 whether it is sung above the tonic or below it.
    expect(degreeOf(MIDDLE_C, nameToMidi('G5'))).toBe(7)
    expect(degreeOf(MIDDLE_C, nameToMidi('G3'))).toBe(7)
    expect(degreeOf(MIDDLE_C, nameToMidi('G2'))).toBe(7)
  })

  it('reads a pitch below the tonic without going negative', () => {
    // B3 is a semitone under middle C, which is the 7 — not -1.
    expect(degreeOf(MIDDLE_C, nameToMidi('B3'))).toBe(11)
  })

  it('round-trips against degreePitch for every degree', () => {
    for (const degree of ALL_DEGREES) {
      for (const octave of [-1, 0, 1]) {
        expect(degreeOf(MIDDLE_C, degreePitch(MIDDLE_C, degree, octave))).toBe(
          degree,
        )
      }
    }
  })

  it('rejects pitches outside the MIDI range', () => {
    expect(() => degreeOf(MIDDLE_C, 128)).toThrow(RangeError)
    expect(() => degreeOf(-1, MIDDLE_C)).toThrow(RangeError)
  })
})
