import { describe, expect, it } from 'vitest'
import {
  CHORDS,
  CHORD_CATEGORIES,
  CHORD_QUALITIES,
  QUALITY_NAMES,
  UNAMBIGUOUS_ROOT_CHORDS,
  UNAMBIGUOUS_ROOT_CHORD_IDS,
  hasAmbiguousRoot,
  chordById,
  chordNotes,
  chordQuality,
  chordSpan,
  chordsInCategory,
  chordsOfQuality,
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
    ['minor-six-nine', [0, 3, 7, 9, 14]],
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

  it('covers all 35 chords from the spec', () => {
    expect(CHORDS).toHaveLength(35)
  })

  it('leaves Minor 6/9 with a root that can be heard', () => {
    // Checked rather than assumed: five-note chords are where the table's
    // shared-notes problem lives, and C6 against Am7 in first inversion is the
    // example this file already documents. Minor 6/9 shares its notes with
    // nothing in the table at any transposition, so the root exercise can use
    // it.
    expect(UNAMBIGUOUS_ROOT_CHORD_IDS).toContain('minor-six-nine')
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

/**
 * The quality of each chord is hand-written, so what these check is the
 * curation rather than a function.
 *
 * They assert the rules the table would follow if it *were* derived, one
 * quality at a time, which pins every entry that agrees with the obvious rule
 * and leaves the two that deliberately do not to be named on their own. A
 * mistyped quality on any of the other thirty-three fails here.
 */
describe('chord quality', () => {
  /**
   * Whether a chord has a voice at exactly this offset.
   *
   * Exactly, not by pitch class. These are close-position stacks, so a third
   * sits at 3 or 4 and a voice at 15 is a ♯9 — the same pitch class as a minor
   * third and a different note in the chord. Folding the octaves together
   * would make the Dominant 7♯9 read as minor, which is precisely the reading
   * the table is written out to avoid.
   */
  const has = (id: string, offset: number) =>
    chordById(id).offsets.includes(offset)

  it('only uses declared qualities, and every quality is populated', () => {
    for (const chord of CHORDS) {
      expect(CHORD_QUALITIES, chord.name).toContain(chord.quality)
    }
    for (const quality of CHORD_QUALITIES) {
      expect(chordsOfQuality(quality).length, quality).toBeGreaterThan(0)
    }
  })

  it('names every quality', () => {
    for (const quality of CHORD_QUALITIES) {
      expect(QUALITY_NAMES[quality], quality).toBeTruthy()
    }
  })

  it('accounts for every chord exactly once', () => {
    const grouped = CHORD_QUALITIES.flatMap((quality) =>
      chordsOfQuality(quality),
    )
    expect(grouped).toHaveLength(CHORDS.length)
  })

  it('gives every major chord a major third and no flat seventh', () => {
    // The flat seventh is what separates major from dominant. Without it a
    // Major 7♯11 and a Dominant 7♯11 would land in the same group, which is
    // the one distinction this roll-up exists to be able to make.
    for (const chord of chordsOfQuality('major')) {
      expect(has(chord.id, 4), chord.name).toBe(true)
      expect(has(chord.id, 10), chord.name).toBe(false)
    }
  })

  it('gives every minor chord a minor third and a perfect fifth', () => {
    // The fifth is what separates minor from diminished: a minor 7th and a
    // half-diminished 7th differ by that note alone.
    for (const chord of chordsOfQuality('minor')) {
      expect(has(chord.id, 3), chord.name).toBe(true)
      expect(has(chord.id, 7), chord.name).toBe(true)
    }
  })

  it('gives every dominant chord a flat seventh and never a minor third', () => {
    // A Minor 7th has the flat seventh too, so the seventh alone is not
    // enough — it is the flat seventh *without* a minor third under it.
    for (const chord of chordsOfQuality('dominant')) {
      expect(has(chord.id, 10), chord.name).toBe(true)
      expect(has(chord.id, 3), chord.name).toBe(false)
    }
  })

  it('gives every diminished chord a minor third and a flat fifth', () => {
    for (const chord of chordsOfQuality('diminished')) {
      expect(has(chord.id, 3), chord.name).toBe(true)
      expect(has(chord.id, 6), chord.name).toBe(true)
    }
  })

  it('gives every augmented chord a major third and a sharp fifth', () => {
    for (const chord of chordsOfQuality('augmented')) {
      expect(has(chord.id, 4), chord.name).toBe(true)
      expect(has(chord.id, 8), chord.name).toBe(true)
    }
  })

  it('leaves the suspended chords with no third at all', () => {
    for (const chord of chordsOfQuality('suspended')) {
      expect(has(chord.id, 3), chord.name).toBe(false)
      expect(has(chord.id, 4), chord.name).toBe(false)
    }
  })

  it('calls the Dominant 7th Sus4 a dominant despite having no third', () => {
    // The chord a derivation from the offsets would get wrong, which is why
    // the table is written out. There is no third to read, so the only rule
    // that could reach it is "no third means suspended" — and the flat seventh
    // is what the ear takes from this chord, not the missing third.
    expect(chordQuality('dominant-7th-sus4')).toBe('dominant')
    expect(has('dominant-7th-sus4', 3)).toBe(false)
    expect(has('dominant-7th-sus4', 4)).toBe(false)
  })

  it('calls the Dominant 7♯9 a dominant, with its ♯9 an octave clear of the third', () => {
    // The other chord a derivation could get wrong, and the reason `has`
    // compares offsets rather than pitch classes: the ♯9 is a minor third
    // twelve semitones up, sitting over a major third the chord also has. Read
    // by pitch class this chord has both thirds and no rule can place it.
    const chord = chordById('dominant-7th-sharp-9')
    expect(chord.quality).toBe('dominant')
    expect(has(chord.id, 4)).toBe(true)
    expect(has(chord.id, 3)).toBe(false)
    expect(chord.offsets).toContain(15)
  })

  it('returns null rather than throwing for a chord the table has dropped', () => {
    // The statistics read ids out of a persisted record, so an id the table no
    // longer has is an ordinary thing to meet rather than a bug.
    expect(chordQuality('no-such-chord')).toBeNull()
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

describe('hasAmbiguousRoot', () => {
  it('rejects sus2 and sus4, which are each other', () => {
    // G C D is a Gsus4 and equally a Csus2. Nothing in the sound says which
    // note is the root.
    expect(hasAmbiguousRoot(chordById('sus2'))).toBe(true)
    expect(hasAmbiguousRoot(chordById('sus4'))).toBe(true)
  })

  it('rejects chords that map onto themselves when transposed', () => {
    // A diminished 7th repeats every minor third and an augmented triad every
    // major third, so every note in them is an equally defensible root.
    expect(hasAmbiguousRoot(chordById('diminished-7th'))).toBe(true)
    expect(hasAmbiguousRoot(chordById('augmented'))).toBe(true)
    expect(hasAmbiguousRoot(chordById('dominant-7th-flat-5'))).toBe(true)
  })

  it('rejects the sixth and seventh chords that share pitches', () => {
    // C6 and Am7 are the same four notes rooted a minor third apart.
    expect(hasAmbiguousRoot(chordById('major-6th'))).toBe(true)
    expect(hasAmbiguousRoot(chordById('minor-7th'))).toBe(true)
    expect(hasAmbiguousRoot(chordById('minor-6th'))).toBe(true)
    expect(hasAmbiguousRoot(chordById('half-diminished-7th'))).toBe(true)
  })

  it('accepts chords whose root is the only one that fits', () => {
    for (const id of [
      'major',
      'minor',
      'diminished',
      'dominant-7th',
      'major-7th',
    ]) {
      expect(hasAmbiguousRoot(chordById(id)), id).toBe(false)
    }
  })

  it('is about the root, not about naming the chord', () => {
    // A dominant 7th is unambiguous by root even though it is a distinct
    // sonority from everything else; ambiguity here means "which note is the
    // root", not "which chord is this".
    expect(hasAmbiguousRoot(chordById('dominant-7th'))).toBe(false)
  })
})

describe('UNAMBIGUOUS_ROOT_CHORDS', () => {
  it('is every chord that survives the check, and nothing else', () => {
    expect(UNAMBIGUOUS_ROOT_CHORD_IDS).toEqual(
      CHORDS.filter((chord) => !hasAmbiguousRoot(chord)).map((c) => c.id),
    )
  })

  it('leaves plenty to practise on', () => {
    expect(UNAMBIGUOUS_ROOT_CHORDS.length).toBeGreaterThan(15)
    expect(UNAMBIGUOUS_ROOT_CHORDS.length).toBeLessThan(CHORDS.length)
  })

  it('contains no chord that shares its pitch classes with another root', () => {
    const seen = new Map<string, string>()
    for (const chord of UNAMBIGUOUS_ROOT_CHORDS) {
      for (let semitones = 0; semitones < 12; semitones++) {
        const key = [...new Set(chord.offsets.map((o) => (o + semitones) % 12))]
          .sort((a, b) => a - b)
          .join(',')
        const previous = seen.get(key)
        // The same notes must never appear twice with different roots.
        expect(previous, `${chord.name} vs ${previous}`).toBeUndefined()
        seen.set(key, `${chord.name}+${semitones}`)
      }
    }
  })
})
