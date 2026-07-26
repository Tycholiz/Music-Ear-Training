import { describe, expect, it } from 'vitest'
import {
  CHORDS,
  CHORD_CATEGORIES,
  chordById,
  chordNotes,
  chordSpan,
  chordsInCategory,
  invert,
  maxInversion,
  voiceCount,
} from './chords'
import { MIDDLE_C, nameToMidi } from './pitch'

describe('CHORDS', () => {
  it('has unique ids and names', () => {
    const ids = CHORDS.map((c) => c.id)
    const names = CHORDS.map((c) => c.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('only uses declared categories, and every category is populated', () => {
    for (const chord of CHORDS) {
      expect(CHORD_CATEGORIES).toContain(chord.category)
    }
    for (const category of CHORD_CATEGORIES) {
      expect(chordsInCategory(category).length).toBeGreaterThan(0)
    }
  })

  it('starts every chord on the root, sorted ascending, with no duplicates', () => {
    for (const chord of CHORDS) {
      expect(chord.offsets[0], chord.name).toBe(0)
      expect([...chord.offsets], chord.name).toEqual(
        [...chord.offsets].sort((a, b) => a - b),
      )
      expect(new Set(chord.offsets).size, chord.name).toBe(chord.offsets.length)
    }
  })

  it('has at least three voices in every chord', () => {
    for (const chord of CHORDS) {
      expect(voiceCount(chord), chord.name).toBeGreaterThanOrEqual(3)
    }
  })

  it.each([
    ['major', [0, 4, 7]],
    ['minor', [0, 3, 7]],
    ['diminished', [0, 3, 6]],
    ['augmented', [0, 4, 8]],
    ['sus2', [0, 2, 7]],
    ['sus4', [0, 5, 7]],
    ['major-6th', [0, 4, 7, 9]],
    ['minor-6th', [0, 3, 7, 9]],
    ['dominant-7th', [0, 4, 7, 10]],
    ['major-7th', [0, 4, 7, 11]],
    ['minor-7th', [0, 3, 7, 10]],
    ['minor-major-7th', [0, 3, 7, 11]],
    ['half-diminished-7th', [0, 3, 6, 10]],
    ['diminished-7th', [0, 3, 6, 9]],
    ['augmented-7th', [0, 4, 8, 10]],
    ['augmented-major-7th', [0, 4, 8, 11]],
    ['dominant-7th-flat-5', [0, 4, 6, 10]],
    ['dominant-7th-sus4', [0, 5, 7, 10]],
    ['add9', [0, 4, 7, 14]],
    ['minor-add9', [0, 3, 7, 14]],
    ['six-nine', [0, 4, 7, 9, 14]],
    ['dominant-9th', [0, 4, 7, 10, 14]],
    ['major-9th', [0, 4, 7, 11, 14]],
    ['minor-9th', [0, 3, 7, 10, 14]],
    ['minor-major-9th', [0, 3, 7, 11, 14]],
    ['dominant-7th-flat-9', [0, 4, 7, 10, 13]],
    ['dominant-7th-sharp-9', [0, 4, 7, 10, 15]],
    ['dominant-11th', [0, 7, 10, 14, 17]],
    ['minor-11th', [0, 3, 7, 10, 14, 17]],
    ['dominant-7th-sharp-11', [0, 4, 7, 10, 18]],
    ['major-7th-sharp-11', [0, 4, 7, 11, 18]],
    ['dominant-13th', [0, 4, 7, 10, 14, 21]],
    ['major-13th', [0, 4, 7, 11, 14, 21]],
    ['minor-13th', [0, 3, 7, 10, 14, 21]],
  ])('%s has the expected offsets', (id, offsets) => {
    expect([...chordById(id).offsets]).toEqual(offsets)
  })

  it('covers all 34 chords from the spec', () => {
    expect(CHORDS).toHaveLength(34)
  })

  it('omits the 3rd from the Dominant 11th and the 11th from the 13ths', () => {
    expect(chordById('dominant-11th').offsets).not.toContain(4)
    for (const id of ['dominant-13th', 'major-13th', 'minor-13th']) {
      expect(chordById(id).offsets, id).not.toContain(17)
    }
  })

  it('throws for an unknown id', () => {
    expect(() => chordById('nope')).toThrow(RangeError)
  })
})

describe('invert', () => {
  it('leaves root position untouched', () => {
    expect(invert([0, 4, 7], 0)).toEqual([0, 4, 7])
  })

  it('inverts a triad', () => {
    expect(invert([0, 4, 7], 1)).toEqual([4, 7, 12])
    expect(invert([0, 4, 7], 2)).toEqual([7, 12, 16])
  })

  it('inverts a seventh chord through 3rd inversion', () => {
    const dom7 = [0, 4, 7, 10]
    expect(invert(dom7, 1)).toEqual([4, 7, 10, 12])
    expect(invert(dom7, 2)).toEqual([7, 10, 12, 16])
    expect(invert(dom7, 3)).toEqual([10, 12, 16, 19])
  })

  it('keeps the result sorted when an extension is displaced past it', () => {
    // Add9's root rises to 12, landing between the 5th and the 9th.
    expect(invert([0, 4, 7, 14], 1)).toEqual([4, 7, 12, 14])
  })

  it('handles six-voice chords', () => {
    const minor13 = [0, 3, 7, 10, 14, 21]
    expect(invert(minor13, 3)).toEqual([10, 12, 14, 15, 19, 21])
  })

  it('preserves voice count at every inversion of every chord', () => {
    for (const chord of CHORDS) {
      for (let i = 0; i <= maxInversion(chord); i++) {
        expect(invert(chord.offsets, i), `${chord.name} inv ${i}`).toHaveLength(
          voiceCount(chord),
        )
      }
    }
  })

  it('rejects an inversion the chord does not have enough voices for', () => {
    expect(() => invert([0, 4, 7], 3)).toThrow(RangeError)
    expect(() => invert([0, 4, 7], -1)).toThrow(RangeError)
    expect(() => invert([0, 4, 7], 1.5)).toThrow(RangeError)
  })
})

describe('maxInversion', () => {
  it('caps triads at 2nd inversion', () => {
    expect(maxInversion(chordById('major'))).toBe(2)
  })

  it('allows 3rd inversion only from four voices up', () => {
    expect(maxInversion(chordById('dominant-7th'))).toBe(3)
    expect(maxInversion(chordById('minor-13th'))).toBe(5)
  })
})

describe('chordNotes', () => {
  it('builds a root position triad on the given root', () => {
    expect(chordNotes(MIDDLE_C, chordById('major'))).toEqual([60, 64, 67])
  })

  it('puts the inverted bass note first, not the root', () => {
    const notes = chordNotes(MIDDLE_C, chordById('major'), 1)
    expect(notes).toEqual([64, 67, 72])
    expect(notes[0]).not.toBe(MIDDLE_C)
  })

  it('reproduces the C6 / Am7 first inversion collision from issue #14', () => {
    const c6 = chordNotes(nameToMidi('C4'), chordById('major-6th'), 0)
    const am7FirstInversion = chordNotes(
      nameToMidi('A3'),
      chordById('minor-7th'),
      1,
    )
    expect(c6).toEqual(am7FirstInversion)
  })

  it('reproduces the Cm6 / Am7b5 first inversion collision', () => {
    const cm6 = chordNotes(nameToMidi('C4'), chordById('minor-6th'), 0)
    const halfDim = chordNotes(
      nameToMidi('A3'),
      chordById('half-diminished-7th'),
      1,
    )
    expect(cm6).toEqual(halfDim)
  })

  it('shows that diminished 7th inversions are transpositions of each other', () => {
    const root = chordNotes(nameToMidi('C4'), chordById('diminished-7th'), 0)
    const first = chordNotes(nameToMidi('D#4'), chordById('diminished-7th'), 0)
    const inverted = chordNotes(
      nameToMidi('C4'),
      chordById('diminished-7th'),
      1,
    )
    expect(inverted).toEqual(first)
    expect(root).not.toEqual(inverted)
  })
})

describe('chordSpan', () => {
  it('measures lowest to highest voice', () => {
    expect(chordSpan(chordById('major'))).toBe(7)
    expect(chordSpan(chordById('major'), 1)).toBe(8)
    expect(chordSpan(chordById('minor-13th'))).toBe(21)
  })

  it('never reports a wider span than two octaves plus a major 6th', () => {
    // Sanity bound so the range validation in #20 has something to work with.
    for (const chord of CHORDS) {
      for (let i = 0; i <= maxInversion(chord); i++) {
        expect(
          chordSpan(chord, i),
          `${chord.name} inv ${i}`,
        ).toBeLessThanOrEqual(33)
      }
    }
  })
})
