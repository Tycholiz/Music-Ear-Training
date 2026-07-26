import { describe, expect, it } from 'vitest'
import {
  COMPOUND_INTERVALS,
  INTERVALS,
  MAX_INTERVAL,
  SIMPLE_INTERVALS,
  intervalBySemitones,
  intervalName,
  isCompound,
} from './intervals'

describe('INTERVALS', () => {
  it('covers Unison through Double Octave with no gaps', () => {
    expect(INTERVALS).toHaveLength(MAX_INTERVAL + 1)
    INTERVALS.forEach((interval, i) => {
      expect(interval.semitones).toBe(i)
    })
  })

  it('names every interval exactly as the exercise buttons do', () => {
    expect(INTERVALS.map((i) => i.name)).toEqual([
      'Unison',
      'Minor 2nd',
      'Major 2nd',
      'Minor 3rd',
      'Major 3rd',
      'Perfect 4th',
      'Tritone',
      'Perfect 5th',
      'Minor 6th',
      'Major 6th',
      'Minor 7th',
      'Major 7th',
      'Octave',
      'Minor 9th',
      'Major 9th',
      'Minor 10th',
      'Major 10th',
      'Perfect 11th',
      'Diminished 12th',
      'Perfect 12th',
      'Minor 13th',
      'Major 13th',
      'Minor 14th',
      'Major 14th',
      'Double Octave',
    ])
  })

  it('has unique names', () => {
    const names = INTERVALS.map((i) => i.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('simple vs compound', () => {
  it('splits at the octave', () => {
    expect(SIMPLE_INTERVALS).toHaveLength(13)
    expect(COMPOUND_INTERVALS).toHaveLength(12)
    expect(SIMPLE_INTERVALS.at(-1)?.name).toBe('Octave')
    expect(COMPOUND_INTERVALS[0].name).toBe('Minor 9th')
  })

  it('counts the octave itself as simple', () => {
    expect(isCompound(12)).toBe(false)
    expect(isCompound(13)).toBe(true)
  })

  it('partitions the full table', () => {
    expect(SIMPLE_INTERVALS.length + COMPOUND_INTERVALS.length).toBe(
      INTERVALS.length,
    )
  })
})

describe('lookup', () => {
  it('finds intervals by semitone count', () => {
    expect(intervalName(6)).toBe('Tritone')
    expect(intervalName(18)).toBe('Diminished 12th')
    expect(intervalBySemitones(24).name).toBe('Double Octave')
  })

  it('throws for semitone counts outside the table', () => {
    expect(() => intervalBySemitones(25)).toThrow(RangeError)
    expect(() => intervalBySemitones(-1)).toThrow(RangeError)
  })
})
