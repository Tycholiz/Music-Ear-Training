import { describe, expect, it } from 'vitest'
import {
  NUMERALS,
  numeralById,
  numeralChord,
  numeralNotes,
  numeralRoot,
  numeralsByDifficulty,
} from './romanNumerals'
import { MIDDLE_C, nameToMidi } from './pitch'

/** C major, so the expected chords can be written out by name. */
const C = MIDDLE_C

describe('NUMERALS', () => {
  it('has unique ids and labels', () => {
    const ids = NUMERALS.map((n) => n.id)
    const labels = NUMERALS.map((n) => n.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('roots every numeral inside one octave of the tonic', () => {
    for (const numeral of NUMERALS) {
      expect(numeral.root, numeral.label).toBeGreaterThanOrEqual(0)
      expect(numeral.root, numeral.label).toBeLessThan(12)
    }
  })

  it('matches each label to its case, which is what carries the quality', () => {
    // I and i are different chords; getting this backwards tells the user the
    // wrong answer rather than merely looking untidy.
    for (const numeral of NUMERALS) {
      const letters = numeral.label.replace(/[b°]/g, '')
      const isUpper = letters === letters.toUpperCase()

      if (numeral.quality === 'major') {
        expect(isUpper, numeral.label).toBe(true)
      } else {
        expect(isUpper, numeral.label).toBe(false)
      }
    }
  })

  it('writes the diminished chord with a degree sign and nothing else', () => {
    const diminished = NUMERALS.filter((n) => n.quality === 'diminished')
    expect(diminished.map((n) => n.label)).toEqual(['vii°'])
  })

  it('spells the diatonic triads of a major key correctly', () => {
    const expected: Record<string, [number, string]> = {
      I: [0, 'major'],
      ii: [2, 'minor'],
      iii: [4, 'minor'],
      IV: [5, 'major'],
      V: [7, 'major'],
      vi: [9, 'minor'],
      'vii°': [11, 'diminished'],
    }

    for (const [label, [root, quality]] of Object.entries(expected)) {
      const numeral = NUMERALS.find((n) => n.label === label)
      expect(numeral, label).toBeDefined()
      expect(numeral?.root, label).toBe(root)
      expect(numeral?.quality, label).toBe(quality)
    }
  })

  it('distinguishes a borrowed chord from the diatonic one a degree away', () => {
    // III and bIII are both major and both near the third degree. Confusing
    // them is the mistake the labels exist to prevent.
    expect(numeralById('III').root).toBe(4)
    expect(numeralById('bIII').root).toBe(3)
    expect(numeralById('iii').root).toBe(4)

    expect(numeralById('III').quality).toBe('major')
    expect(numeralById('iii').quality).toBe('minor')
  })

  it('gives the borrowed chords the roots they have in the parallel minor', () => {
    // C minor against C major: Eb, Ab, Bb, and a minor subdominant.
    expect(numeralById('bIII').root).toBe(3)
    expect(numeralById('bVI').root).toBe(8)
    expect(numeralById('bVII').root).toBe(10)
    expect(numeralById('iv').root).toBe(5)
    expect(numeralById('iv').quality).toBe('minor')
  })

  it('makes the secondary dominants major where the key wants minor', () => {
    // What makes them heard as pointing somewhere rather than sitting still.
    for (const id of ['II', 'III', 'VI']) {
      expect(numeralById(id).quality, id).toBe('major')
    }
    expect(numeralById('ii').root).toBe(numeralById('II').root)
    expect(numeralById('iii').root).toBe(numeralById('III').root)
    expect(numeralById('vi').root).toBe(numeralById('VI').root)
  })

  it('throws on an unknown id rather than returning nothing', () => {
    expect(() => numeralById('Vsus')).toThrow(RangeError)
  })
})

describe('the difficulty ladder', () => {
  it('opens with the three chords most music is made of', () => {
    const first = numeralsByDifficulty()
      .slice(0, 3)
      .map((n) => n.label)
    expect(new Set(first)).toEqual(new Set(['I', 'IV', 'V']))
  })

  it('puts the rarest chord last', () => {
    expect(numeralsByDifficulty().at(-1)?.label).toBe('bII')
  })

  it('orders by level, not by table position or label', () => {
    const levels = numeralsByDifficulty().map((n) => n.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('reaches the diatonic chords before any chromatic one', () => {
    const ordered = numeralsByDifficulty().map((n) => n.label)
    const lastDiatonic = Math.max(
      ...['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'].map((l) =>
        ordered.indexOf(l),
      ),
    )
    const firstChromatic = Math.min(
      ...['iv', 'bIII', 'bVI', 'bVII', 'II', 'III', 'VI', 'bII'].map((l) =>
        ordered.indexOf(l),
      ),
    )
    expect(lastDiatonic).toBeLessThan(firstChromatic)
  })

  it('leaves gaps between levels, so one can be slotted in later', () => {
    const levels = [...new Set(NUMERALS.map((n) => n.level))].sort(
      (a, b) => a - b,
    )
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeGreaterThan(1)
    }
  })

  it('lists every numeral exactly once, without reordering the table', () => {
    const before = NUMERALS.map((n) => n.id)
    expect(numeralsByDifficulty()).toHaveLength(NUMERALS.length)
    expect(NUMERALS.map((n) => n.id)).toEqual(before)
  })
})

describe('numeralChord', () => {
  it('builds a triad for every numeral', () => {
    for (const numeral of NUMERALS) {
      expect(numeralChord(numeral).offsets, numeral.label).toHaveLength(3)
    }
  })

  it('picks the chord its quality names', () => {
    expect(numeralChord(numeralById('I')).id).toBe('major')
    expect(numeralChord(numeralById('ii')).id).toBe('minor')
    expect(numeralChord(numeralById('vii-dim')).id).toBe('diminished')
  })
})

describe('numeralRoot', () => {
  it('roots the tonic chord on the tonic', () => {
    expect(numeralRoot(numeralById('I'), C)).toBe(C)
  })

  it('roots each numeral where the key puts it', () => {
    expect(numeralRoot(numeralById('IV'), C)).toBe(nameToMidi('F4'))
    expect(numeralRoot(numeralById('V'), C)).toBe(nameToMidi('G4'))
    expect(numeralRoot(numeralById('vi'), C)).toBe(nameToMidi('A4'))
  })

  it('shifts by whole octaves', () => {
    expect(numeralRoot(numeralById('V'), C, 1)).toBe(nameToMidi('G5'))
    expect(numeralRoot(numeralById('V'), C, -1)).toBe(nameToMidi('G3'))
  })

  it('works in a key that is not C', () => {
    const eb = nameToMidi('Eb4')
    // V of Eb is Bb.
    expect(numeralRoot(numeralById('V'), eb)).toBe(nameToMidi('Bb4'))
  })
})

describe('numeralNotes', () => {
  it('spells the chords of C major by name', () => {
    // Written out rather than derived, so a mistake in the offsets cannot
    // agree with a mistake in the expectation.
    expect(numeralNotes(numeralById('I'), C)).toEqual(
      ['C4', 'E4', 'G4'].map(nameToMidi),
    )
    expect(numeralNotes(numeralById('ii'), C)).toEqual(
      ['D4', 'F4', 'A4'].map(nameToMidi),
    )
    expect(numeralNotes(numeralById('V'), C)).toEqual(
      ['G4', 'B4', 'D5'].map(nameToMidi),
    )
    expect(numeralNotes(numeralById('vi'), C)).toEqual(
      ['A4', 'C5', 'E5'].map(nameToMidi),
    )
    expect(numeralNotes(numeralById('vii-dim'), C)).toEqual(
      ['B4', 'D5', 'F5'].map(nameToMidi),
    )
  })

  it('spells the borrowed chords by name', () => {
    expect(numeralNotes(numeralById('bVII'), C)).toEqual(
      ['Bb4', 'D5', 'F5'].map(nameToMidi),
    )
    expect(numeralNotes(numeralById('iv'), C)).toEqual(
      ['F4', 'Ab4', 'C5'].map(nameToMidi),
    )
  })

  it('is in root position, whatever the numeral', () => {
    // Inversion is a question about voicing a progression, not about what a
    // numeral means.
    for (const numeral of NUMERALS) {
      const notes = numeralNotes(numeral, C)
      expect(notes[0], numeral.label).toBe(numeralRoot(numeral, C))
      expect(notes, numeral.label).toEqual([...notes].sort((a, b) => a - b))
    }
  })

  it('transposes as a whole when the key changes', () => {
    const inC = numeralNotes(numeralById('IV'), C)
    const inD = numeralNotes(numeralById('IV'), C + 2)
    expect(inD).toEqual(inC.map((note) => note + 2))
  })
})
